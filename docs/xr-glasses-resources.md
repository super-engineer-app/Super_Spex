# XR Glasses Development Resources

This document contains official samples, documentation, and API references used in building the XR Glasses app.

## Official Android XR SDK Documentation

### Core Documentation
- **Jetpack XR SDK Overview**: https://developer.android.com/develop/xr/jetpack-xr-sdk
- **First Activity for AI Glasses**: https://developer.android.com/develop/xr/jetpack-xr-sdk/ai-glasses/first-activity
- **Access Hardware via Projected Context**: https://developer.android.com/develop/xr/jetpack-xr-sdk/access-hardware-projected-context

### Emulator Setup & Troubleshooting
- **Create AI Glasses AVDs**: https://developer.android.com/develop/xr/jetpack-xr-sdk/run/create-avds/ai-glasses
- **Run on AI Glasses Emulator**: https://developer.android.com/develop/xr/jetpack-xr-sdk/run/emulator/ai-glasses
- **Troubleshoot AI Glasses Emulator Issues**: https://developer.android.com/develop/xr/jetpack-xr-sdk/run/emulator/ai-glasses-troubleshoot

### API References
- **ProjectedContext API**: Used to create projected device context and activity options
  - `ProjectedContext.createProjectedDeviceContext(activity)` - Creates device context for glasses
  - `ProjectedContext.createProjectedActivityOptions(projectedContext)` - Creates launch options
  - `ProjectedContext.isProjectedDeviceConnected(context)` - Returns Flow<Boolean> for connection status

- **Projected Permissions API**: `androidx.xr.projected.permissions`
  - `ProjectedPermissionsResultContract` - Activity result contract for permission requests
  - `ProjectedPermissionsRequestParams` - Parameters for permission request (permissions list + rationale)

---

## Official Sample Projects

### 1. Android AI Samples - AI Glasses Branch
**Repository**: https://github.com/android/ai-samples/tree/prototype-ai-glasses

**Key Sample**: `samples/gemini-live-todo`
- Gemini Live Todo App for AI Glasses
- Demonstrates voice interaction with Gemini Live API
- Shows proper projected activity setup and permission handling

**Key Files**:
- `GlassesActivity.kt` - Example of projected activity with permissions
- `TodoScreen.kt` - Shows how to launch projected activity with proper options
- `AndroidManifest.xml` - Activity declaration with `requiredDisplayCategory`

**Usage Pattern for Launching Projected Activity**:
```kotlin
// From TodoScreen.kt (lines 91-109)
val projectedContext = ProjectedContext.createProjectedDeviceContext(activity)
val options = ProjectedContext.createProjectedActivityOptions(projectedContext)
val intent = Intent(activity, GlassesActivity::class.java).apply {
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
activity.startActivity(intent, options.toBundle())
```

**Usage Pattern for Projected Permissions**:
```kotlin
// From GlassesActivity.kt (lines 36-44)
@OptIn(ExperimentalProjectedApi::class)
private val requestPermissionLauncher: ActivityResultLauncher<List<ProjectedPermissionsRequestParams>> =
    registerForActivityResult(ProjectedPermissionsResultContract()) { results ->
        val granted = requiredPermissions.all { permission ->
            results[permission] == true
        }
        isPermissionsGranted = granted
    }
```

### 2. Android XR Samples
**Repository**: https://github.com/android/xr-samples
- Basic XR functionality samples
- Hello Android XR demo

### 3. Android XR Codelabs
**Repository**: https://github.com/android/xr-codelabs
- Guided tutorials for XR development

---

## Key Manifest Configuration

### Projected Activity Declaration
```xml
<activity
    android:name=".GlassesActivity"
    android:exported="true"
    android:requiredDisplayCategory="xr_projected"
    android:label="Glasses Experience">
    <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="androidx.xr.projected.CATEGORY_PROJECTED"/>
    </intent-filter>
</activity>
```

**Critical Attributes**:
- `android:requiredDisplayCategory="xr_projected"` - Routes activity to glasses display
- `android:exported="true"` - Required for system to launch
- Category `androidx.xr.projected.CATEGORY_PROJECTED` - Official category for projected apps

### Required Permissions
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

### Query for XR Services
```xml
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

## Dependencies

### Gradle Dependencies (build.gradle.kts)
```kotlin
dependencies {
    // Jetpack XR Projected library
    implementation("androidx.xr.projected:projected:1.0.0-alpha04")

    // Jetpack Compose Glimmer (UI toolkit for glasses)
    implementation("androidx.xr.glimmer:glimmer:1.0.0-alpha02")

    // Jetpack Compose
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")

    // CameraX for image capture
    implementation("androidx.camera:camera-core:1.3.4")
    implementation("androidx.camera:camera-camera2:1.3.4")
    implementation("androidx.camera:camera-lifecycle:1.3.4")
}
```

---

## Known Issues & Workarounds

### 1. Display Not Waking Automatically
**Issue**: "Launching a projected activity does not automatically turn on the AI glasses' display (planned for future releases)"

**Workaround**:
- User must press the glasses button to wake display
- Or use PowerManager wake lock (partial solution)

### 2. Emulator Projection Not Showing
**Issue**: Activity launches on Display 7 but glasses emulator shows home screen

**Solution**: Follow troubleshooting steps:
1. Cold boot phone emulator
2. Start glasses emulator after phone fully boots
3. If still failing: Wipe glasses AVD data, forget device on phone, re-pair

### 3. Permissions on Glasses
**Issue**: Standard `requestPermissions()` dialogs don't show on glasses display

**Solution**: Use `ProjectedPermissionsResultContract` API which properly handles permissions across projected context

---

## Emulator Tips

### Waking Glasses Display
- Press the **glasses button** in emulator (icon above the 3 dots menu)
- This simulates user interaction that wakes the display

### Emulator Ports
- Phone emulator: Usually `emulator-5554`
- Glasses emulator: Usually `emulator-5556`

### ADB Commands
```bash
# List devices
adb devices -l

# Install on phone
adb -s emulator-5554 install -r app-release.apk

# Watch logs
adb -s emulator-5554 logcat | grep XRGlassesService

# Check displays on phone (Display 7 is glasses)
adb -s emulator-5554 shell dumpsys display | grep mDisplayId
```

---

## Blog Posts & Announcements

- **Build for AI Glasses with Android XR SDK DP3**: https://android-developers.googleblog.com/2025/12/build-for-ai-glasses-with-android-xr.html
- **The Android Show XR Edition**: https://android-developers.googleblog.com/2025/12/start-building-for-glasses-new-devices.html
- **Google I/O 2025 Android XR**: https://blog.google/products/android/android-xr-gemini-glasses-headsets/

---

## Architecture Notes

### Phone ↔ Glasses Communication Flow
```
React Native App (TypeScript)
    ↓ (calls async functions)
XRGlassesModule (Expo Native Bridge)
    ↓ (manages lifecycle)
XRGlassesService (Kotlin - Core Logic)
    ↓ (uses Jetpack XR APIs via reflection)
ProjectedContext (Jetpack XR SDK)
    ↓ (launches activity on glasses display)
GlassesActivity (Runs on XR glasses hardware)
    ↓ (renders Compose UI, handles speech)
GlassesScreen (Composable UI for glasses)
```

### Key Files in This Project
- `modules/xr-glasses/android/src/main/AndroidManifest.xml` - Activity & permission declarations
- `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/XRGlassesService.kt` - Core connection logic
- `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/glasses/GlassesActivity.kt` - Activity running on glasses
- `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/glasses/GlassesScreen.kt` - Compose UI for glasses
- `modules/xr-glasses/android/build.gradle.kts` - Dependencies
