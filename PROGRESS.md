# XR Glasses App - Progress & Next Steps

## Current Status (2026-01-29)

### Completed
- [x] React Native app with Expo
- [x] Native Android module (Kotlin) with Jetpack XR SDK
- [x] Event system working (Expo EventEmitter)
- [x] Emulation mode for UI testing
- [x] Brightness controls
- [x] Input event simulation
- [x] SDK detection working (ProjectedActivityCompat found)
- [x] **Real XR connection established** via paired emulators
- [x] Auto-navigate to dashboard after connecting
- [x] Glasses context obtained for capability queries

### Current Issue
**Capabilities show "Not Available" even when connected to glasses**

The logs show:
```
Got glasses device context for capability queries
Querying capabilities from connected glasses
```

But all capabilities return false. This is likely because:
1. The AI glasses emulator may not report capabilities via `PackageManager.hasSystemFeature()`
2. Capabilities might need to be queried via a different API

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Phone App      │────▶│  AI Glasses     │
│  (React Native) │     │  (Emulator)     │
│                 │     │                 │
│  CANARY image   │     │  android-36     │
│  with Glasses   │     │  ai-glasses     │
│  companion app  │     │  image          │
└─────────────────┘     └─────────────────┘
        │                       │
        └───────────────────────┘
          ProjectedActivityCompat
          (connection works!)
```

---

## Next Steps

### Immediate (Fix capabilities)
- [ ] Research how to properly query AI glasses capabilities
- [ ] Check if glasses emulator has different capability APIs
- [ ] May need to use `ProjectedActivityCompat` methods instead of PackageManager
- [ ] Check Jetpack XR docs for capability detection

### Short-term (Display content on glasses)
- [ ] Add Jetpack Compose Glimmer dependency
- [ ] Create `GlassesDisplayActivity.kt` with Compose Glimmer UI
- [ ] Launch glasses activity when connected
- [ ] Send data from React Native to glasses display

### Medium-term (Full feature set)
- [ ] Implement glasses camera access
- [ ] Implement glasses microphone access
- [ ] Handle glasses touchpad input events
- [ ] Test with real XR glasses hardware (when available)

### Long-term (Phase 2+)
- [ ] iOS implementation via C++ protocol
- [ ] Cross-platform protocol abstraction

---

## Quick Commands

```bash
# Build release APK
export ANDROID_HOME=~/Android/Sdk
cd android && ./gradlew clean && ./gradlew assembleRelease

# APK location
android/app/build/outputs/apk/release/app-release.apk

# List emulators
~/Android/Sdk/platform-tools/adb devices -l

# Install on phone emulator
~/Android/Sdk/platform-tools/adb -s emulator-5556 install -r android/app/build/outputs/apk/release/app-release.apk

# Watch logs
~/Android/Sdk/platform-tools/adb -s emulator-5556 logcat | grep XRGlassesService
```

---

## Code Files

### Key Kotlin files
- `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/XRGlassesService.kt` - Core XR service
- `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/XRGlassesModule.kt` - Expo module

### Key TypeScript files
- `src/hooks/useXRGlasses.ts` - Main React hook
- `app/glasses/index.tsx` - Glasses dashboard UI
- `app/connect.tsx` - Connection screen

---

## Testing Setup

See `CLAUDE.md` for full emulator setup instructions.

**TL;DR:**
1. Use Android Studio **Canary** (not stable)
2. Phone AVD must use **API CANARY Preview** image (has Glasses companion app)
3. AI Glasses AVD uses `android-36/ai-glasses` image
4. Pair emulators via Glasses app on phone
5. Install APK on phone, tap Connect

---

Last Updated: 2026-01-29
