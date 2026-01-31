# Camera Capture - Maintenance Guide

## Overview

Camera capture uses Android CameraX to capture images from the glasses camera. The camera runs on the phone side but accesses glasses hardware via the projected context.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHONE (Main Process)                          │
│                                                                  │
│  ┌─────────────────────┐                                        │
│  │ XRGlassesModule     │◄──── React Native calls                │
│  │ initializeCamera()  │                                        │
│  │ captureImage()      │                                        │
│  │ releaseCamera()     │                                        │
│  └─────────┬───────────┘                                        │
│            │                                                     │
│            ▼                                                     │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │ XRGlassesService    │───▶│ GlassesCameraManager            │ │
│  │ (delegates camera)  │    │ (CameraX implementation)        │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
│                                       │                          │
└───────────────────────────────────────│──────────────────────────┘
                                        │ Uses projected context
                                        │ to access glasses camera
                                        ▼
                              ┌─────────────────────┐
                              │ Glasses Camera      │
                              │ (hardware)          │
                              └─────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `GlassesCameraManager.kt` | CameraX setup, image capture logic |
| `XRGlassesService.kt` | Camera lifecycle management |
| `XRGlassesModule.kt` | Expo bridge for camera functions |
| `useGlassesCamera.ts` | React Native hook |

## Camera Flow

1. **Initialize**: `initializeCamera(lowPowerMode)` → Sets up CameraX with projected context
2. **Capture**: `captureImage()` → Takes photo, saves to temp file
3. **Event**: `onImageCaptured` event with base64 image data
4. **Release**: `releaseCamera()` → Unbinds camera, releases resources

## Common Issues & Fixes

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

**Fix**: Check `isCameraReady()` before capturing:
```typescript
const { isCameraReady, initializeCamera, captureImage } = useGlassesCamera();

// Wait for camera ready
await initializeCamera(false);
if (isCameraReady) {
  await captureImage();
}
```

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

## Events

| Event | Data | When |
|-------|------|------|
| `onImageCaptured` | `{ imageData: string (base64), path: string }` | Capture successful |
| `onCameraError` | `{ error: string }` | Capture or init failed |
| `onCameraStateChanged` | `{ ready: boolean }` | Camera readiness changed |

## Important Notes

### Projected Context for Glasses Camera

To access the glasses camera (not phone camera), we would need to use:
```kotlin
val glassesContext = ProjectedContext.createProjectedDeviceContext(activity)
val cameraProvider = ProcessCameraProvider.getInstance(glassesContext)
```

**WARNING**: We currently DON'T do this from the main process because it corrupts React Native (see projection fix docs). Camera currently uses phone context.

**Future improvement**: Move camera capture to `:xr_process` to properly access glasses camera.

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
