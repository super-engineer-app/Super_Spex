# Plan: Fix Image Capture in Identify & Help Modes

## Problem

- **Identify mode**: "Take photo" fails with "Camera is closed" error
- **Help mode**: Photo capture doesn't show the image preview
- **Notes Video tab**: LiveCameraPreview (CameraX Preview use case) works perfectly
- **Notes Photo tab (tagging)**: Image capture works perfectly

## Key Question

Why does image capture work in Notes Photo tab but fail in Identify/Help? They both use `useGlassesCamera` → `captureImage()` → native `GlassesCameraManager.captureImage()` → CameraX `ImageCapture.takePicture()`. Something in the lifecycle or use case binding is different.

## Investigation Steps

### 1. Compare how Notes Photo vs Identify use the camera

Read and compare these files side by side:

```
src/components/modes/IdentifyMode.tsx     — broken
src/components/modes/HelpMode.tsx         — broken
src/components/modes/NotesMode.tsx        — working (has sub-modes)
src/components/TaggingMode.tsx            — working (Notes Photo tab)
src/hooks/useGlassesCamera.ts            — shared hook
src/hooks/useTaggingSession.ts           — may use camera differently
src/components/dashboard/DashboardContext.tsx — provides camera to all modes
```

Key things to check:
- Does TaggingMode use `useGlassesCamera` or its own camera logic?
- Does DashboardContext create ONE camera instance shared across all modes, or per-mode?
- When switching from Notes (where camera works) to Identify (where it breaks), what happens to the camera lifecycle?
- Is the camera being released when switching tabs?

### 2. Trace the full native camera lifecycle

Read the native camera chain:

```
modules/xr-glasses/android/.../XRGlassesService.kt    — initializeCamera(), captureImage(), releaseCamera()
modules/xr-glasses/android/.../GlassesCameraManager.kt — actual CameraX ImageCapture logic
modules/xr-glasses/android/.../SharedCameraProvider.kt  — singleton managing all CameraX use cases
modules/xr-glasses/android/.../CameraPreviewView.kt     — native Preview view (acquires Preview use case)
```

Key things to check:
- When CameraPreviewView acquires Preview, does it interfere with ImageCapture?
- SharedCameraProvider's `rebindUseCases()` unbinds ALL then rebinds. Does this close ImageCapture mid-flight?
- The "Camera is closed" error comes from CameraX's `ImageCapture.takePicture()` callback. This means ImageCapture was bound but the camera was unbound before the capture completed.
- Check if `acquirePreview()` triggers `rebindUseCases()` which momentarily unbinds ImageCapture

### 3. Understand the CameraPreviewView lifecycle conflict

The `CameraPreviewView` (native Expo view in `LiveCameraPreview.tsx`) acquires a CameraX Preview use case. This was just added. It might be conflicting with ImageCapture:

- CameraPreviewView calls `SharedCameraProvider.acquirePreview(activity, surfaceProvider, emulationMode=true)`
- IdentifyMode calls `initializeCamera()` → `SharedCameraProvider.acquireImageCapture(activity, config, emulationMode=false)`
- **Different emulationMode values!** Preview uses `true` (phone camera), ImageCapture uses `false` (tries glasses first). This causes `initAndBind()` to switch camera contexts, potentially invalidating the existing binding.

**This is likely the root cause.** When two use cases have different emulationMode values, `initAndBind` gets called with conflicting contexts.

### 4. Understand the XR process architecture

Read these docs:
```
docs/maintenance/xr-glasses-projection.md
docs/maintenance/camera-capture.md
docs/architecture.md
```

Key architecture:
- GlassesActivity runs in `:xr_process` (separate process for XR SDK)
- XRGlassesService runs in the main process
- `SharedCameraProvider.getCameraContext(emulationMode)` uses `ProjectedContext.createProjectedDeviceContext()` to access glasses camera
- When no glasses connected, falls back to phone camera
- On emulator, there are no glasses, so it should always use phone camera

### 5. Check logcat for the exact failure sequence

Run on emulator, navigate to Identify, press Take Photo, and check:
```bash
adb logcat -c && adb logcat | grep -iE "SharedCameraProvider|GlassesCameraManager|XRGlassesService.*camera|CameraPreview"
```

Look for:
- Is ImageCapture being acquired?
- Is it being released before the capture completes?
- Does `rebindUseCases()` get called between acquire and capture?
- What's the refCount for each use case at capture time?

### 6. Fix: Ensure consistent emulationMode

The CameraPreviewView hardcodes `emulationMode=true`. But `initializeCamera()` passes `this.emulationMode` which defaults to `false`. When both are active, SharedCameraProvider gets conflicting modes.

**Fix approach**: CameraPreviewView should use the same emulationMode as the rest of the camera system, not hardcode `true`. Options:
- Pass emulationMode as a prop from JS
- Have CameraPreviewView read from XRGlassesService's current emulation state
- Have SharedCameraProvider ignore emulationMode on subsequent `initAndBind` calls if already initialized (use the first caller's context)

### 7. Fix: Projected context camera capture with phone fallback

The image capture should:
1. Try `ProjectedContext.createProjectedDeviceContext()` for glasses camera
2. If that fails (no glasses connected), fall back to phone camera
3. This is what `SharedCameraProvider.getCameraContext()` already does

The issue is that `getCameraContext` is called in `initAndBind`, and if two use cases call it with different `emulationMode`, it flip-flops. Fix: once a camera context is established, all use cases should share it until explicitly changed.

### 8. Fix: CameraPreview.tsx container dimensions

Already partially fixed but verify: the `container` style for the image case needs `width: "100%"` and `aspectRatio` to match the placeholder style. Check that the captured image actually renders when base64Image is set.

## Files to Read (in order of importance)

1. `src/components/dashboard/DashboardContext.tsx` — how camera is provided to modes
2. `src/hooks/useGlassesCamera.ts` — the camera hook
3. `src/hooks/useTaggingSession.ts` — how Notes Photo tab captures (working reference)
4. `src/components/modes/IdentifyMode.tsx` — broken mode
5. `src/components/modes/HelpMode.tsx` — broken mode
6. `src/components/TaggingMode.tsx` — working mode (Notes Photo)
7. `modules/xr-glasses/android/.../SharedCameraProvider.kt` — use case management
8. `modules/xr-glasses/android/.../XRGlassesService.kt` — camera init/capture
9. `modules/xr-glasses/android/.../GlassesCameraManager.kt` — CameraX ImageCapture
10. `modules/xr-glasses/android/.../CameraPreviewView.kt` — native Preview view
11. `src/components/shared/CameraPreview.tsx` — static image display
12. `src/components/shared/LiveCameraPreview.tsx` — live camera view (native)
13. `docs/maintenance/camera-capture.md` — camera architecture docs
14. `docs/maintenance/xr-glasses-projection.md` — XR process/context docs

## Likely Root Cause Summary

**Conflicting emulationMode between CameraPreviewView (hardcoded `true`) and initializeCamera (uses service's `emulationMode` which defaults to `false`).** This causes SharedCameraProvider to reinitialize with a different camera context when both Preview and ImageCapture are active, leading to "Camera is closed" errors.

The Notes Photo tab works because it doesn't render a CameraPreviewView — it uses its own image display. The Video tab works because it only uses Preview (no ImageCapture conflict).
