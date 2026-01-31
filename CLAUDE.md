# Claude Code Instructions

## Agent Behavior Rules

### Progress Tracking
- **ALWAYS** use the TodoWrite tool to track tasks and progress
- Update the status table in `XR_GLASSES_APP_PLAN.md` when completing milestones
- Keep the user informed of what's being done

### Research Before Implementation
- **ALWAYS** conduct extensive research of official documentation before:
  - Implementing any new feature
  - Making adjustments to existing code
  - Integrating new libraries or APIs
- Use WebFetch/WebSearch to read official docs, not just Stack Overflow or tutorials
- Document key findings from official docs in the relevant `docs/` file
- If official docs contradict existing code patterns, flag this to the user

### Failure Handling
- If an approach fails **more than 2 iterations**, STOP and document:
  1. What approach was tried
  2. Why it failed (error messages, root cause)
  3. What was learned
- Add failed approaches to `XR_GLASSES_APP_PLAN.md` under "Research Findings" or "Notes"
- This prevents repeating the same mistakes in future sessions

### Documentation Standards
- **NEVER** exceed 2000 lines in any single documentation file
- Keep `CLAUDE.md` focused on agent instructions only
- Keep `XR_GLASSES_APP_PLAN.md` focused on project status and roadmap
- Keep main docs concise, put details in `docs/maintenance/`

### Documentation Structure (Where to Find Info)

**Always check these first:**
1. `docs/architecture.md` - High-level system design, process separation, file structure
2. `docs/reference.md` - Key files list, quick commands

**For deeper understanding or troubleshooting:**
```
docs/maintenance/
├── README.md                    # Quick troubleshooting matrix, start here
├── xr-glasses-projection.md     # CRITICAL: How projection works, why separate process
├── speech-recognition.md        # Speech architecture, broadcast flow, errors
├── camera-capture.md            # Camera system, CameraX setup
├── emulator-testing.md          # Emulator setup, pairing, known issues
└── build-deploy.md              # Build process, gradle, manifest config
```

**When to check maintenance docs:**
- Something is broken → Start with `maintenance/README.md` troubleshooting matrix
- Phone UI corrupted → `maintenance/xr-glasses-projection.md`
- Speech not working → `maintenance/speech-recognition.md`
- Camera issues → `maintenance/camera-capture.md`
- Emulator problems → `maintenance/emulator-testing.md`
- Build failures → `maintenance/build-deploy.md`

**Other docs:**
- `docs/xr-glasses-resources.md` - Official Android XR SDK links and samples
- `docs/PROJECTION_FIX_ATTEMPTS.md` - History of projection fix attempts (reference only)

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

### Critical Architecture Constraint

**All Android XR features MUST be implemented in native Kotlin modules.**

The Jetpack XR SDK (`androidx.xr.projected`, `SpeechRecognizer`, etc.) is Android-native and cannot be accessed directly from React Native/JavaScript.

```
React Native (TypeScript)  →  Expo Native Module (Kotlin)  →  Jetpack XR SDK  →  AI Glasses
```

- XR logic goes in: `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/`
- React Native receives data via events emitted from Kotlin
- Never try to import Jetpack XR classes in TypeScript

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

## Progress & Documentation

**Project Status:** See `XR_GLASSES_APP_PLAN.md` for current status, next steps, and milestones.

**Understanding the Codebase:**
1. Start with `docs/architecture.md` for system overview
2. Check `docs/reference.md` for key files and commands
3. For troubleshooting, see `docs/maintenance/README.md`

**Before Making Changes:**
- Read relevant maintenance doc if modifying a specific module
- Check `docs/maintenance/xr-glasses-projection.md` before touching ANY XR/projection code
- The separate process architecture is CRITICAL - don't break it!
