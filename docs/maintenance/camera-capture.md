# Camera Capture - Maintenance Guide

## Overview

Camera capture uses Android CameraX to capture images from the glasses camera.
**CRITICAL:** To access the glasses camera, you MUST use `ProjectedContext.createProjectedDeviceContext()`.
Neither the main process nor `:xr_process` have direct access to glasses hardware.

## Architecture

Both camera use cases (Image Capture and Video Streaming) now use **SharedCameraProvider**,
a singleton that manages a single `ProcessCameraProvider` with multiple use cases bound simultaneously.

### SharedCameraProvider Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHONE (Main Process)                          │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │ XRGlassesService    │    │ SharedCameraProvider (singleton)│ │
│  │                     │───▶│                                 │ │
│  └─────────────────────┘    │ - ProcessCameraProvider         │ │
│            │                │ - ImageAnalysis (streaming)     │ │
│            │                │ - ImageCapture (snapshots)      │ │
│            ▼                │ - Reference counting per use    │ │
│  ┌─────────────────────┐    │ - ProjectedContext for glasses  │ │
│  │ StreamingCameraManager│   └─────────────────────────────────┘ │
│  │ (acquireImageAnalysis)│                │                      │
│  └─────────────────────┘                  │                      │
│            │                              │                      │
│            ▼                              ▼                      │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │ GlassesCameraManager│    │ CameraX bindToLifecycle()       │ │
│  │ (acquireImageCapture)│──▶│ with BOTH use cases bound       │ │
│  └─────────────────────┘    │ simultaneously                  │ │
│                             └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                        │ ProjectedContext
                                        ▼
                              ┌─────────────────────┐
                              │ Glasses Camera      │
                              └─────────────────────┘
```

### Key Benefit: Simultaneous Use Cases

**CameraX allows binding multiple use cases in a single `bindToLifecycle()` call.**
This means Image Capture and Video Streaming can work simultaneously:
- User can capture images while streaming is active
- No need to stop streaming to take a snapshot
- Both share the same camera stream efficiently

### Reference Counting

SharedCameraProvider uses reference counting to track active consumers:
- `acquireImageAnalysis()` - Increments analysis ref count, creates use case if first consumer
- `releaseImageAnalysis()` - Decrements ref count, removes use case if no consumers
- `acquireImageCapture()` - Increments capture ref count, creates use case if first consumer
- `releaseImageCapture()` - Decrements ref count, removes use case if no consumers

When use cases change, the provider calls `unbindAll()` then `bindToLifecycle()` with all active use cases.

## Key Files

| File | Purpose |
|------|---------|
| `SharedCameraProvider.kt` | Singleton managing CameraX with multiple use cases |
| `GlassesCameraManager.kt` | Image capture logic, uses SharedCameraProvider |
| `StreamingCameraManager.kt` | Video streaming frame capture, uses SharedCameraProvider |
| `XRGlassesService.kt` | Camera lifecycle management |
| `XRGlassesModule.kt` | Expo bridge for camera functions |
| `useGlassesCamera.ts` | React Native hook |

## Key Insight: Process vs Hardware Access

**:xr_process runs on the PHONE, not on the glasses.**

The `:xr_process` is a separate Android process that:
- Runs on the phone hardware
- Has its UI displayed on the glasses screen (via XR projection)
- Does NOT have direct access to phone or glasses hardware

To access glasses hardware from ANY process, you must use:
```kotlin
val glassesContext = ProjectedContext.createProjectedDeviceContext(context)
val cameraProvider = ProcessCameraProvider.getInstance(glassesContext)
```

SharedCameraProvider handles this automatically based on emulation mode.

## Camera Flow

1. **Initialize**: `initializeCamera(lowPowerMode)` → Sets up CameraX with projected context
2. **Capture**: `captureImage()` → Takes photo, saves to temp file
3. **Event**: `onImageCaptured` event with base64 image data
4. **Release**: `releaseCamera()` → Unbinds camera, releases resources

## Common Issues & Fixes

### Issue: Camera capture hangs on first mount / Preview shows black

**Symptoms**: `takePicture()` hangs indefinitely (neither `onCaptureSuccess` nor `onError` fires). `PreviewView` shows black. Both issues resolve after switching modes and back. `isCameraReady=true` but the camera isn't actually working.

**Root cause**: A `CameraPreviewView` with `active=true` inside a **hidden container** (`display: "none"`) has zero dimensions. CameraX's `PreviewView` can't provide a valid surface at 0x0. When `SharedCameraProvider.rebindUseCases()` binds Preview + ImageCapture together, CameraX's camera2 layer waits for **ALL** surfaces before creating the `CaptureSession`. The zero-size Preview surface is never provided, so the entire session stalls — blocking ImageCapture too.

The original trigger was `NotesMode` being always-mounted (hidden with `display: "none"` in `ContentArea.tsx`) with `<LiveCameraPreview active />` in its default video tab.

**Fix (two layers)**:
1. **JS**: Gate `LiveCameraPreview` `active` prop on actual visibility:
   ```tsx
   <LiveCameraPreview active={activeMode === "notes"} />
   ```
2. **Native**: `CameraPreviewView.kt` defers `acquirePreview()` until `onLayout()` delivers non-zero dimensions. If `width == 0 || height == 0`, it sets a `pendingPreviewAcquire` flag and retries when the view gets valid dimensions.

**Key rule**: Never set `active={true}` on `LiveCameraPreview` when the component is hidden or has zero dimensions. CameraX session creation is all-or-nothing — one stalled surface blocks every use case.

**Full postmortem**: `docs/maintenance/camera-initialization-bug.md`

### Issue: Camera released mid-capture ("Camera is closed")

**Symptoms**: `captureImage()` fails with "Camera is closed" CameraX error. Logcat shows `releaseCamera` called immediately after `takePicture`.

**Root cause**: Any `useEffect` cleanup with the camera object as a dependency will fire on every state change (since the hook returns a new object reference each render). This calls `releaseCamera()` mid-capture.

**Fix**: Use a ref-based pattern for unmount cleanup:
```typescript
const cameraRef = useRef(camera);
cameraRef.current = camera;
useEffect(() => {
    return () => {
        const cam = cameraRef.current;
        if (cam.isReady) cam.releaseCamera();
    };
}, []); // empty deps = unmount only
```

**Key rule**: Never put the full `camera` / `UseGlassesCameraReturn` object in a `useEffect` dependency array.

### Issue: Captured image renders white/blank on Android

**Symptoms**: Image capture succeeds (base64 data present, `onLoad` fires), but the `<Image>` component shows a white rectangle. Switching tabs and back makes it appear.

**Root cause**: React Native Android rendering bug where the native `ImageView` loses pixel content during rapid re-renders caused by camera state changes (`isReady` toggling).

**Fix**: Three-part approach:
1. **Single container**: `CameraPreview` always renders the same root `<View>`, switching children inside (never swap between two different root Views)
2. **`key` on `<Image>`**: Use `key={base64.slice(-16)}` to force a clean native view remount per image
3. **`key` on `<CameraPreview>`**: Parent passes `key={camera.lastImage ? "captured" : "empty"}` to force full component remount
4. **`fadeDuration={0}`**: Disables Android's default 300ms Image fade animation
5. **`useMemo` on source**: Memoize the `{ uri: "data:image/jpeg;base64,..." }` object to prevent unnecessary native reloads

### Issue: Camera stops working after several uses

**Symptoms**: Camera worked initially, now capture always fails

**Root cause**: CameraX resource leak in emulator's camera HAL (alpha SDK issue)

**Fix**: Restart the phone emulator

**Prevention**: Always call `releaseCamera()` when done

### Issue: "Camera not ready" error

**Symptoms**: `captureImage()` fails with camera not ready

**Causes**:
1. `initializeCamera()` wasn't called first
2. Camera initialization still in progress
3. Camera was released

**Fix**: The hook has **auto-reinitialize** built in (`useGlassesCamera.ts:184`): if `captureImage()` is called when the camera isn't ready but was previously initialized, it automatically re-initializes and retries. Manual check:
```typescript
const { isReady, initializeCamera, captureImage } = useGlassesCamera();

// Wait for camera ready
await initializeCamera(false);
if (isReady) {
  await captureImage();
}
```

### Camera Source Selection (Glasses-First)

Both photo capture and video recording default to the **glasses camera** (via `ProjectedContext`) and fall back to the phone camera only if that fails:

- **Video recording**: `useVideoRecording.ts` defaults `cameraSource: "glasses"`. The native layer (`XRGlassesService.startVideoRecording`) sets `emulationMode = false` when source is `"glasses"`, which triggers `ProjectedContext.createProjectedDeviceContext()` in `SharedCameraProvider`.
- **Photo capture**: `useTaggingSession.ts` `captureFromPhone()` first tries the glasses camera (`initGlassesCamera(false)` + `captureGlassesImage()`). Only if that throws does it fall back to `ImagePicker.launchCameraAsync()` (phone camera).
- **Emulator**: The glasses emulator doesn't have a real camera, so `SharedCameraProvider` falls back to the phone camera automatically. This is expected.

### Issue: Images captured from phone camera instead of glasses

**Symptoms**: In emulator, images show phone's surroundings not glasses view

**Cause**: Expected in emulator - glasses emulator doesn't have real camera

**Note**: This is normal. In production with real glasses, images will come from glasses camera.

### Issue: Camera permission denied

**Symptoms**: Camera init fails with permission error

**Fix**: Ensure CAMERA permission is in manifest and granted:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

## CameraX Configuration

### Low Power Mode
```kotlin
ImageCapture.Builder()
    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
    .setTargetResolution(Size(640, 480))  // Lower resolution
    .build()
```

### High Quality Mode
```kotlin
ImageCapture.Builder()
    .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
    .setTargetResolution(Size(1920, 1080))  // Higher resolution
    .build()
```

## Hook Return Values

The `useGlassesCamera()` hook also provides:
- `isReady` — whether camera is initialized and ready to capture
- `imageHistory: ImageCapturedEvent[]` — array of all captured images in the session
- `clearHistory()` — clears the image history

## Events

| Event | Data | When |
|-------|------|------|
| `onImageCaptured` | `{ imageData: string (base64), path: string }` | Capture successful |
| `onCameraError` | `{ error: string }` | Capture or init failed |
| `onCameraStateChanged` | `{ ready: boolean }` | Camera readiness changed |

## Important Notes

### Projected Context for Glasses Camera

SharedCameraProvider automatically uses `ProjectedContext.createProjectedDeviceContext()` to access glasses camera when not in emulation mode:
```kotlin
val glassesContext = ProjectedContext.createProjectedDeviceContext(context)
val cameraProvider = ProcessCameraProvider.getInstance(glassesContext)
```

In emulation/demo mode, it falls back to phone camera for testing.

### Image Preview Scaling

`CameraPreview.tsx` uses `resizeMode="cover"` so captured images fill the preview container (cropping edges if the aspect ratio differs). The preview layout uses a **3:2 flex ratio** (`previewColumn: flex 3`, `buttonsColumn: flex 2`) across Identify, Help, and Notes modes for consistent sizing.

### Video Playback Scaling

`CameraPreviewView.kt` wraps the `VideoView` in a `FrameLayout` with `Gravity.CENTER` to center the video within the container. A cover-scale transform is applied in `onPreparedListener` so the video fills the preview area without letterboxing.

### Memory Management

- Images are captured as JPEG and converted to base64
- Large images can cause memory pressure
- Always call `releaseCamera()` when leaving the screen
- Consider implementing image compression for large captures

## Testing Checklist

- [ ] Initialize camera succeeds
- [ ] Capture returns base64 image data
- [ ] Image displays in preview
- [ ] Release camera doesn't crash
- [ ] Re-initialize after release works
- [ ] Error events fire on failure
- [ ] Low power mode captures faster (lower quality)
- [ ] **Simultaneous use**: Capture works while streaming is active
- [ ] **Simultaneous use**: Streaming continues after capture
- [ ] **Simultaneous use**: Both can be released independently
