# Build & Deployment - Maintenance Guide

## Overview

The app is built as a release APK and manually installed on the phone emulator or device. We do NOT use debug builds or Metro bundler for testing.

## Build Process

### Standard Build
```bash
# 1. Set Android SDK path
export ANDROID_HOME=~/Android/Sdk

# 2. Clean build cache (ALWAYS do this)
cd android && ./gradlew clean

# 3. Build release APK
./gradlew assembleRelease

# 4. APK location
android/app/build/outputs/apk/release/app-release.apk
```

### Why Clean First?
- Ensures JavaScript bundle changes are included
- Prevents stale native code issues
- Required after any Kotlin/Java changes

### Why Release (not Debug)?
- Debug APK requires Metro bundler running
- Release APK is self-contained
- Matches production behavior

## Installation

```bash
# List connected devices/emulators
~/Android/Sdk/platform-tools/adb devices -l

# Install (replace port with actual emulator port)
~/Android/Sdk/platform-tools/adb -s emulator-5554 install -r android/app/build/outputs/apk/release/app-release.apk

# Uninstall first if having issues
~/Android/Sdk/platform-tools/adb -s emulator-5554 uninstall com.xrglasses.app
```

**Note**: User installs APK manually - do NOT use `adb install` in production. This is for development/testing only.

## Common Build Issues

### Issue: JS changes not appearing

**Symptoms**: Code changes don't show up after rebuild

**Fix**: Always run `./gradlew clean` before `assembleRelease`

### Issue: Kotlin compile errors

**Symptoms**: Build fails with Kotlin syntax errors

**Fixes**:
1. Check for typos in recent Kotlin changes
2. Ensure all imports are correct
3. Run `./gradlew clean` to clear cached errors

### Issue: "Cannot find symbol" errors

**Symptoms**: Java/Kotlin can't find classes

**Causes**:
1. Missing import statements
2. Class moved or renamed
3. Build cache corruption

**Fix**: Clean and rebuild:
```bash
./gradlew clean && ./gradlew assembleRelease
```

### Issue: APK install fails

**Symptoms**: `adb install` returns error

**Fixes**:
1. Uninstall existing app first: `adb uninstall com.xrglasses.app`
2. Check emulator is running and connected: `adb devices`
3. Ensure using correct emulator port

## Gradle Dependencies

Key dependencies in `modules/xr-glasses/android/build.gradle.kts`:

```kotlin
dependencies {
    // Jetpack XR Projected library
    implementation("androidx.xr.projected:projected:1.0.0-alpha04")

    // Jetpack Compose for glasses UI
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")

    // CameraX for image capture
    implementation("androidx.camera:camera-core:1.3.4")
    implementation("androidx.camera:camera-camera2:1.3.4")
    implementation("androidx.camera:camera-lifecycle:1.3.4")
}
```

**Note**: XR library versions may change - check Maven for latest alpha releases.

## Version Requirements

| Requirement | Value |
|-------------|-------|
| Android SDK | API 30+ minimum |
| Android XR | API 36 for full XR features |
| Kotlin | 2.1.20 |
| Gradle | 8.14.3 |
| Android Studio | Panda Canary 2+ |

## Manifest Configuration

Critical manifest settings in `modules/xr-glasses/android/src/main/AndroidManifest.xml`:

### Process Separation (CRITICAL!)
```xml
<activity
    android:name=".ProjectionLauncherActivity"
    android:process=":xr_process"  <!-- MUST have this! -->
    ... />

<activity
    android:name=".glasses.GlassesActivity"
    android:process=":xr_process"  <!-- MUST have this! -->
    android:requiredDisplayCategory="xr_projected"
    ... />
```

Removing `android:process=":xr_process"` will break React Native UI!

### Required Permissions
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

## Logging

### Watch specific logs
```bash
# XR-related logs
adb logcat | grep -iE "XRGlassesService|GlassesActivity|ProjectionLauncher"

# All app logs
adb logcat | grep com.xrglasses.app

# Clear and watch fresh
adb logcat -c && adb logcat | grep XRGlassesService
```

### Log tags in code

| Tag | File | Purpose |
|-----|------|---------|
| `XRGlassesService` | XRGlassesService.kt | Main service logs |
| `GlassesActivity` | GlassesActivity.kt | Glasses-side logs |
| `ProjectionLauncher` | ProjectionLauncherActivity.kt | Launch flow logs |
| `GlassesCameraManager` | GlassesCameraManager.kt | Camera logs |

## Build Troubleshooting Checklist

When things aren't working:

1. [ ] Did you run `./gradlew clean`?
2. [ ] Is the emulator running?
3. [ ] Is `adb devices` showing the emulator?
4. [ ] Did you uninstall the old APK first?
5. [ ] Are there any Kotlin compile errors?
6. [ ] Did you check logcat for runtime errors?
7. [ ] Is the glasses emulator paired with phone emulator?
