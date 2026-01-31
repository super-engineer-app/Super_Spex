# How to Get the Glasses Camera Working

This document explains the exact setup that makes camera capture work with XR Glasses from a React Native Expo app.

---

## Architecture Overview

```
React Native (TypeScript)
    │
    ▼
Expo Native Module (XRGlassesModule.kt)
    │
    ▼
XRGlassesService.kt
    │
    ▼
GlassesCameraManager.kt (uses CameraX)
    │
    ▼
Jetpack XR Projected SDK → AI Glasses Camera
```

**Key insight:** The camera runs on the **phone** using CameraX, but when connected via Jetpack XR Projected SDK, `ProcessCameraProvider.getInstance()` with the projected device context accesses the glasses camera hardware instead of the phone camera.

---

## Required Dependencies

### `modules/xr-glasses/android/build.gradle.kts`

```kotlin
dependencies {
    // Jetpack XR Projected SDK (enables glasses hardware access)
    implementation("androidx.xr.projected:projected:1.0.0-alpha04")

    // CameraX (for camera capture - works with projected context)
    implementation("androidx.camera:camera-core:1.3.1")
    implementation("androidx.camera:camera-camera2:1.3.1")
    implementation("androidx.camera:camera-lifecycle:1.3.1")
}
```

### Minimum SDK
```kotlin
android {
    compileSdk = 35
    defaultConfig {
        minSdk = 30  // Jetpack XR requires API 30+
    }
}
```

---

## Required Permissions

### `modules/xr-glasses/android/src/main/AndroidManifest.xml`

```xml
<!-- Camera permission -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

<!-- Required for Jetpack XR -->
<queries>
    <intent>
        <action android:name="androidx.xr.projected.ACTION_BIND" />
    </intent>
    <intent>
        <action android:name="androidx.xr.projected.ACTION_ENGAGEMENT_BIND" />
    </intent>
</queries>
```

---

## How It Works

### 1. Getting the Glasses Context (GlassesCameraManager.kt:114-143)

```kotlin
private fun getGlassesContext(): Context? {
    return try {
        val projectedContextClass = Class.forName("androidx.xr.projected.ProjectedContext")
        val createMethod = projectedContextClass.methods.find {
            it.name == "createProjectedDeviceContext"
        }

        if (createMethod != null) {
            val result = createMethod.invoke(null, context)
            if (result is Context) {
                glassesContext = result
                result
            } else null
        } else null
    } catch (e: Exception) {
        null  // Falls back to phone camera
    }
}
```

**What this does:**
- Uses reflection to call `ProjectedContext.createProjectedDeviceContext(context)`
- Returns a Context that references the glasses hardware
- If glasses aren't connected, returns `null` and falls back to phone camera

### 2. Initialize CameraX with Projected Context

```kotlin
fun initializeCamera(lifecycleOwner: LifecycleOwner, emulationMode: Boolean, lowPowerMode: Boolean) {
    val cameraContext = if (emulationMode) {
        context  // Phone camera
    } else {
        getGlassesContext() ?: context  // Glasses camera, fallback to phone
    }

    // THIS IS THE KEY LINE: Use glasses context for camera provider
    val cameraProviderFuture = ProcessCameraProvider.getInstance(cameraContext)

    cameraProviderFuture.addListener({
        cameraProvider = cameraProviderFuture.get()
        setupImageCapture(lifecycleOwner, lowPowerMode)
    }, ContextCompat.getMainExecutor(context))
}
```

### 3. Camera Setup (DEFAULT_BACK_CAMERA = Glasses Outward Camera)

```kotlin
private fun setupImageCapture(lifecycleOwner: LifecycleOwner, lowPowerMode: Boolean) {
    // DEFAULT_BACK_CAMERA maps to glasses' outward-facing camera
    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

    // Resolution options
    val targetSize = if (lowPowerMode) {
        Size(640, 480)   // Low power mode
    } else {
        Size(1280, 720)  // High quality
    }

    val resolutionStrategy = ResolutionStrategy(
        targetSize,
        ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER
    )

    val imageCapture = ImageCapture.Builder()
        .setResolutionSelector(ResolutionSelector.Builder()
            .setResolutionStrategy(resolutionStrategy)
            .build())
        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
        .build()

    cameraProvider?.bindToLifecycle(lifecycleOwner, cameraSelector, imageCapture)
}
```

### 4. Capture and Return as Base64

```kotlin
fun captureImage() {
    imageCapture?.takePicture(
        ContextCompat.getMainExecutor(context),
        object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                val base64Image = imageProxyToBase64(image)
                onImageCaptured(base64Image, image.width, image.height)
                image.close()
            }
        }
    )
}
```

---

## React Native Usage

### TypeScript Hook (src/hooks/useGlassesCamera.ts)

```typescript
import { useGlassesCamera } from '../hooks/useGlassesCamera';

function CameraCapture() {
  const {
    isReady,
    isCapturing,
    lastImage,
    error,
    initializeCamera,
    captureImage,
    releaseCamera,
  } = useGlassesCamera();

  useEffect(() => {
    initializeCamera(false);  // false = high quality (1280x720)
    return () => releaseCamera();
  }, []);

  return (
    <View>
      {lastImage && (
        <Image
          source={{ uri: `data:image/jpeg;base64,${lastImage}` }}
          style={{ width: 300, height: 200 }}
        />
      )}
      <Button
        title={isCapturing ? 'Capturing...' : 'Capture'}
        onPress={captureImage}
        disabled={!isReady || isCapturing}
      />
    </View>
  );
}
```

### JS/TS Module Interface (modules/xr-glasses/index.ts)

```typescript
// Initialize camera
await service.initializeCamera(lowPowerMode: boolean);

// Capture (result comes via onImageCaptured event)
await service.captureImage();

// Release resources
await service.releaseCamera();

// Events to subscribe to:
service.onImageCaptured((event) => {
  event.imageBase64;  // Base64 JPEG
  event.width;
  event.height;
  event.isEmulated;
  event.timestamp;
});

service.onCameraError((event) => {
  event.message;
});

service.onCameraStateChanged((event) => {
  event.isReady;
  event.isEmulated;
});
```

---

## Emulator Testing

### Requirements
1. **Android Studio Canary** (Panda Canary 2 or newer)
2. **AI Glasses Emulator**: AVD with `android-36/ai-glasses/x86_64` image
3. **Phone Emulator**: AVD with **CANARY API Preview** image (NOT regular android-36!)

### Why CANARY Image?
Regular phone emulator images don't include the Glasses companion app. Only CANARY Preview images have the XR projection system service needed to pair with glasses.

### Pairing Steps
1. Start AI Glasses emulator first (emulator-5554)
2. Start Phone emulator (emulator-5556)
3. On phone, open the **Glasses** app (pre-installed)
4. Follow pairing prompts

### Install & Test
```bash
# Build
export ANDROID_HOME=~/Android/Sdk
cd android && ./gradlew clean && ./gradlew assembleRelease

# Install on phone emulator
~/Android/Sdk/platform-tools/adb -s emulator-5556 install -r android/app/build/outputs/apk/release/app-release.apk

# Watch logs
~/Android/Sdk/platform-tools/adb -s emulator-5556 logcat | grep GlassesCameraManager
```

---

## Emulation Mode (No Glasses Needed)

For quick UI testing without emulators or glasses:

```typescript
// Enable emulation mode first
await service.setEmulationMode(true);
await service.connect();

// Now camera uses phone's camera instead of glasses
await service.initializeCamera(false);
await service.captureImage();
```

---

## Troubleshooting

### Camera/Connection suddenly stops working after it was working
**This is usually an emulator issue, not an app issue!**

The emulator runtime state gets corrupted (CameraX resource leak, XR service binding stuck, etc.).

**Quick fix:** Just restart the phone emulator. No need to create new AVDs.

1. Close the phone emulator
2. Restart it from AVD Manager
3. Reinstall APK if needed
4. Re-pair with glasses via the Glasses app

**Why this happens:**
- NOT hot module reloading (release APK has no Metro)
- Likely Camera2/CameraX HAL issues in emulator
- Or Jetpack XR Projected service (alpha SDK) gets stuck
- Runtime state corruption - restart clears it

### "Camera not available"
- Check CAMERA permission is granted
- Verify glasses are paired and connected
- Check `adb logcat | grep GlassesCameraManager` for errors

### "Failed to initialize camera"
- Make sure activity is a LifecycleOwner (Expo activities are)
- Check CameraX dependencies are correct versions

### Image is rotated
- `GlassesCameraManager` handles rotation via `image.imageInfo.rotationDegrees`
- The base64 output should already be correctly oriented

### Low quality image
- Check if `lowPowerMode: true` was passed
- Verify resolution in logs: "Camera initialized successfully (resolution: WxH)"

---

## Key Files

| File | Purpose |
|------|---------|
| `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/GlassesCameraManager.kt` | Camera capture logic with CameraX |
| `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/XRGlassesService.kt` | Service that manages camera lifecycle |
| `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/XRGlassesModule.kt` | Expo module exposing JS functions |
| `modules/xr-glasses/android/build.gradle.kts` | Dependencies (CameraX, Jetpack XR) |
| `modules/xr-glasses/android/src/main/AndroidManifest.xml` | Permissions |
| `src/hooks/useGlassesCamera.ts` | React hook for camera capture |

---

## Google Docs Reference

- [Access Hardware in Projected Context](https://developer.android.com/develop/xr/jetpack-xr-sdk/access-hardware-projected-context)
- Key quotes:
  - "Use `ProjectedContext.createProjectedDeviceContext()` to access glasses hardware"
  - "`DEFAULT_BACK_CAMERA` maps to the glasses' outward-facing camera"
  - "Optimize resolution/FPS for battery and thermal limits"
