# Claude Code Instructions

## Project Overview

XR Glasses React Native app for Android. Phone app that communicates with XR glasses via Jetpack XR APIs.

## Build Instructions

**ALWAYS follow these steps when building the Android app:**

1. Set Android SDK path:
   ```bash
   export ANDROID_HOME=~/Android/Sdk
   ```

2. Clean the build cache first:
   ```bash
   cd android && ./gradlew clean
   ```

3. Build **RELEASE** APK (not debug):
   ```bash
   ./gradlew assembleRelease
   ```

4. The APK will be at:
   ```
   android/app/build/outputs/apk/release/app-release.apk
   ```

**Important:**
- NEVER build debug APK - it requires Metro bundler running
- ALWAYS clean before building to ensure JS changes are included
- User installs APK manually on phone - do NOT use `adb install`

## Testing

After installing the APK:
1. Open app
2. Tap "Enable Emulation Mode" to test without real XR hardware
3. Capabilities should show all 1s when emulation is enabled
