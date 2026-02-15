# Camera Initialization Bug: Capture & Preview Fail on First Mount

## Status: RESOLVED

## Problem

Camera capture (`takePicture()`) and live preview (`PreviewView`) do not work when first entering any dashboard mode. The camera appears to bind successfully (no errors, `isCameraReady=true`), but:

1. **ImageCapture**: `takePicture()` hangs — neither `onCaptureSuccess` nor `onError` callbacks fire
2. **Preview**: `PreviewView` shows a black screen

Both issues resolve if the user switches to another mode and back, or switches away and returns. This suggests the camera pipeline is not truly opened on the first `bindToLifecycle()` call, but works on subsequent rebinds.

## Key Observations

### Symptom Details
- Button shows "Capturing..." indefinitely (10s timeout eventually fires)
- `LiveCameraPreview` (native `PreviewView`) renders black until mode switch
- After switching modes back and forth, both capture AND preview start working
- `onBound` callback fires successfully on first bind (so `isCameraReady=true`)
- No CameraX errors in logcat on first bind

### The LiveStream Clue
- LiveStream mode has its own `LiveCameraPreview` (CameraPreviewView)
- If you press "Take photo" in Identify mode (hangs), then switch to LiveStream and back, the photo captures correctly
- This means `SharedCameraProvider.rebindUseCases()` — triggered by adding/removing Preview — somehow "kicks" the camera pipeline into working
- The rebind calls `provider.unbindAll()` then `provider.bindToLifecycle()` with the same use cases
- So the **second** `bindToLifecycle()` works, but the **first** one doesn't

### Black Preview on First Mount
- After adding `LiveCameraPreview` to IdentifyMode, the preview is black on first render
- Switching modes and coming back makes it work
- This rules out "ImageCapture needs Preview" as the root cause — even Preview itself doesn't work on first bind

## What We Tried

### Attempt 1: Keepalive ImageAnalysis (FAILED)
**Hypothesis**: ImageCapture alone doesn't open the camera; adding a continuous use case (ImageAnalysis) would keep the pipeline active.

**Implementation**: Added a no-op `ImageAnalysis.Analyzer { it.close() }` alongside ImageCapture in `GlassesCameraManager.initializeCamera()`.

**Result**: Camera capture still hung. Additionally, when switching to LiveStream mode, the pending `takePicture()` now received `ImageCaptureException: Camera is closed` instead of silently completing after rebind. This is because the ImageAnalysis DID partially open the camera, so `unbindAll()` during rebind triggered a camera close error on the pending capture. Before this change, the camera was never truly opened, so `unbindAll()` was harmless and the subsequent rebind + open allowed the queued `takePicture()` to execute.

**Reverted**: Yes, fully reverted.

### Attempt 2: LiveCameraPreview in IdentifyMode (PARTIALLY FAILED)
**Hypothesis**: The emulator camera HAL requires a Preview surface to open.

**Implementation**: Replaced static `CameraPreview` placeholder with always-mounted `LiveCameraPreview` in IdentifyMode.

**Result**: The Preview surface is provided, but it renders black on first mount. Only works after switching modes. This disproves the "needs Preview surface" hypothesis — the issue is earlier in the pipeline.

**Reverted**: Yes, fully reverted. IdentifyMode is back to using static `CameraPreview`.

### Summary: Both Fixes Failed
Neither adding a keepalive ImageAnalysis nor adding a LiveCameraPreview resolved the issue. The keepalive made things worse (caused "Camera is closed" errors). The LiveCameraPreview showed that even Preview itself doesn't work on first bind — the PreviewView renders black. All code changes have been reverted to the original state.

## Architecture: How Camera Binding Works

Read these files carefully to understand the full flow:

### Native Layer (Kotlin)

1. **`modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/SharedCameraProvider.kt`** — **THE MOST IMPORTANT FILE**
   - Singleton managing CameraX `ProcessCameraProvider` with reference-counted use cases
   - `acquireImageCapture()` / `acquirePreview()` / `acquireImageAnalysis()` — create use cases, increment ref count, call `initAndBind()`
   - `initAndBind()` — gets `ProcessCameraProvider` (async on first call, cached after), then calls `rebindUseCases()`
   - `rebindUseCases()` — collects all active use cases, calls `provider.unbindAll()`, then `provider.bindToLifecycle()`
   - **Coalescing logic**: If multiple acquires happen before `ProcessCameraProvider` resolves, only one listener is registered. All use cases accumulate and are bound in a single `rebindUseCases()` call.
   - **Investigate**: Is the coalescing logic correct? Does the first `bindToLifecycle()` actually bind everything? Is there a timing issue with the async `ProcessCameraProvider.getInstance()` resolution?

2. **`modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/GlassesCameraManager.kt`**
   - Creates `ImageCapture` use case via `SharedCameraProvider.acquireImageCapture()`
   - `onBound` callback sets `isCameraReady=true`
   - `captureImage()` calls `takePicture()` on the ImageCapture instance

3. **`modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/CameraPreviewView.kt`**
   - Native Expo view wrapping CameraX `PreviewView`
   - When `active=true`, calls `SharedCameraProvider.acquirePreview(activity, surfaceProvider, emulationMode=true)`
   - **Note**: Always hardcodes `emulationMode=true` (uses phone camera)
   - `PreviewView.implementationMode = COMPATIBLE` (uses TextureView internally)

4. **`modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/XRGlassesService.kt`**
   - Orchestrator: `initializeCamera()` (line ~1229) creates `GlassesCameraManager`
   - `captureImage()` (line ~1290) delegates to `GlassesCameraManager`
   - `emulationMode` field determines camera source (phone vs glasses)

5. **`modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/XRGlassesModule.kt`**
   - Expo Module bridge: JS `initializeCamera(lowPowerMode)` → Kotlin `glassesService.initializeCamera(activity, lowPowerMode)`
   - Uses `AsyncFunction` with `scope.launch` — runs on `Dispatchers.Main`
   - Gets `LifecycleOwner` from `appContext.currentActivity`

6. **`modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/StreamingCameraManager.kt`**
   - Uses `acquireImageAnalysis()` for streaming frames
   - Relevant for understanding multi-consumer camera sharing

### JavaScript Layer (TypeScript)

7. **`src/hooks/useGlassesCamera.ts`**
   - React hook wrapping camera operations
   - `initializeCamera()` calls native `service.initializeCamera(lowPowerMode)`
   - `captureImage()` has auto-init logic if `!isReady`, plus 10s safety timeout
   - Camera state updated via event subscriptions (`onImageCaptured`, `onCameraError`, `onCameraStateChanged`)

8. **`src/components/modes/IdentifyMode.tsx`**
   - Auto-inits camera on mount: `useEffect(() => { initCamera(false) }, [initCamera])`
   - Uses static `CameraPreview` (no live preview)

9. **`src/components/modes/NotesMode.tsx`**
   - Video tab: renders `<LiveCameraPreview active={activeMode === "notes"} />` (gated on visibility to prevent session stall)
   - Photo tab: renders `<TaggingMode>` (no live preview)

10. **`src/components/modes/LiveStreamMode.tsx`**
    - Renders `<LiveCameraPreview active />` — this is the mode where camera "works" after switching

11. **`src/components/shared/LiveCameraPreview.tsx`**
    - Thin wrapper around `NativeCameraPreview` (native view)
    - Props: `active`, `playbackUrl`

12. **`src/components/dashboard/DashboardContext.tsx`**
    - Single `useGlassesCamera()` instance shared across all modes via context

13. **`src/components/dashboard/ContentArea.tsx`**
    - Mode rendering: IdentifyMode, HelpMode, NotesMode are persistent (hidden with display:none); LiveStreamMode, TeaCheckerMode, ConfigMode unmount/remount on switch

## Root Cause

The hidden **NotesMode** `LiveCameraPreview` was the culprit. `ContentArea.tsx` keeps NotesMode always mounted (hidden with `display: "none"`) for state persistence. NotesMode defaults to the "video" tab which renders `<LiveCameraPreview active />`. This caused:

1. On first dashboard mount, `CameraPreviewView` was created with `active=true` inside a `display: "none"` container
2. The native `PreviewView` had **zero dimensions** (0x0) — its internal `TextureView` never received a `SurfaceTexture`
3. `acquirePreview()` added a Preview use case with an unfulfillable `SurfaceProvider` to `SharedCameraProvider`
4. When `ProcessCameraProvider` resolved, `rebindUseCases()` bound **both** Preview + ImageCapture
5. CameraX's camera2 layer requires **ALL surfaces** before creating a `CaptureSession` — the Preview surface was never provided
6. The entire camera session stalled: ImageCapture couldn't work, `takePicture()` hung indefinitely

**Why mode-switch fixed it**: Switching to LiveStreamMode created a second, **visible** `CameraPreviewView` which called `preview?.setSurfaceProvider(newSurfaceProvider)` — replacing the stalled provider with a valid one. CameraX got the surface and created the session.

## Fix Applied

### 1. JS fix — `NotesMode.tsx`
Made `LiveCameraPreview` only active when NotesMode is the visible mode:
```tsx
<LiveCameraPreview active={activeMode === "notes"} playbackUrl={playbackUrl} />
```

### 2. Native fix — `CameraPreviewView.kt` (defense-in-depth)
Added a dimension check that **defers** `acquirePreview()` until `onLayout()` delivers non-zero dimensions:
- If `width == 0 || height == 0`: sets `pendingPreviewAcquire = true` and returns
- `onLayout()` checks the flag and retries when dimensions are valid
- `showNothing()` clears the pending flag

### 3. Diagnostic logging — `SharedCameraProvider.kt`
Added rebind counter, lifecycle state, use case state, and coalescing info to `initAndBind()` and `rebindUseCases()`.

## Diagnostic Logging (permanently added)

`SharedCameraProvider.kt` now logs:
- `initAndBind #N`: lifecycle state, provider cached status, coalescing, all use case states
- `rebindUseCases #N`: lifecycle state, all use case ref counts, camera info
- Use logcat tag filter: `SharedCameraProvider:D GlassesCameraManager:D CameraPreviewView:D`

`CameraPreviewView.kt` now logs:
- `setActive`: includes current dimensions and window attachment state
- `onLayout`: includes dimensions and pending preview flag
- `acquirePreview DEFERRED`: when the zero-dimension guard triggers

## Prevention Checklist

When adding or modifying any component that uses `LiveCameraPreview` or `CameraPreviewView`:

- [ ] Is the `active` prop gated on the component actually being visible?
- [ ] If the component is inside a persistent/always-mounted container (like IdentifyMode, HelpMode, or NotesMode in ContentArea), does it deactivate the preview when hidden?
- [ ] If adding a new persistent mode in `ContentArea.tsx`, does its camera preview respect `activeMode`?

## Key Principle: CameraX Session Creation is All-or-Nothing

CameraX's camera2 layer collects surfaces from ALL bound use cases before creating a `CaptureSession`. If ANY surface is unavailable (e.g. a zero-size `PreviewView`), the entire session is blocked — including unrelated use cases like ImageCapture. This means one broken Preview can silently break photo capture across the entire app.
