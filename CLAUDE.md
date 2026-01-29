# Claude Code Instructions

## Agent Behavior Rules

### Progress Tracking
- **ALWAYS** use the TodoWrite tool to track tasks and progress
- Update `PROGRESS.md` when completing significant milestones
- Keep the user informed of what's being done

### Failure Handling
- If an approach fails **more than 2 iterations**, STOP and document:
  1. What approach was tried
  2. Why it failed (error messages, root cause)
  3. What was learned
- Add failed approaches to `PROGRESS.md` under a "Failed Approaches" section
- This prevents repeating the same mistakes in future sessions

### Code Quality Standards
Write code that is:
- **Efficient**: No unnecessary operations, optimal algorithms
- **Well-structured**: Clear separation of concerns, logical organization
- **Well-designed**: Follow established patterns (SOLID, DRY, KISS)
- **Scalable**: Code should handle growth without major refactoring
- **Maintainable**: Self-documenting, clear naming, minimal complexity

Avoid:
- Over-engineering or premature optimization
- Magic numbers/strings - use constants
- Deep nesting - extract to functions
- Large files - split into modules
- Duplicated code - extract to shared utilities

---

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

## Testing with Android Studio Emulators

### Prerequisites
- **Android Studio Panda Canary 2** (or newer Canary build)
- XR tools require Canary channel, not stable Android Studio

### Emulator Setup

**1. AI Glasses Emulator:**
- Create AVD: Select "AI Glasses" device type
- System Image: `android-36/ai-glasses/x86_64`
- This is the glasses device

**2. Phone Emulator (CRITICAL - must use CANARY image):**
- Create AVD: Select any phone (e.g., Pixel 9a)
- **API Level: Select "API CANARY Preview"** (NOT android-36!)
- System Image: `Google Play Intel x86_64 Atom System Image` (CANARY)
- The CANARY image includes the Glasses companion app

**Why CANARY?** Regular phone images don't have the XR companion service. Only CANARY Preview images include the Glasses companion app needed to pair with AI glasses.

### Pairing Emulators

1. Start AI Glasses emulator first (usually emulator-5554)
2. Start Phone emulator (usually emulator-5556)
3. On phone, open the **Glasses** app (pre-installed on CANARY image)
4. Follow pairing prompts - accept "Glasses" and "Glasses Core" associations
5. Emulators stay paired across restarts

### Installing and Testing the App

```bash
# List connected emulators
~/Android/Sdk/platform-tools/adb devices -l

# Install on phone emulator (replace 5556 with actual port)
~/Android/Sdk/platform-tools/adb -s emulator-5556 install -r android/app/build/outputs/apk/release/app-release.apk

# Watch logs
~/Android/Sdk/platform-tools/adb -s emulator-5556 logcat | grep XRGlassesService
```

### Testing Flow

1. Open app on phone emulator
2. Tap "Connect" (not emulation mode)
3. App should auto-navigate to Glasses Dashboard
4. Check logs for "Real XR connection established!"

### Emulation Mode (no emulators needed)
For quick UI testing without emulators:
1. Open app
2. Tap "Enable Emulation Mode"
3. Tap "Connect"
4. All features work with simulated data

## Progress Tracking

See `PROGRESS.md` for current status and next steps.
