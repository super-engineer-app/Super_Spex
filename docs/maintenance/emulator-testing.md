# Emulator Testing - Maintenance Guide

## Overview

Testing the XR Glasses app requires two emulators running simultaneously:
1. **Phone emulator** - Runs the React Native app
2. **Glasses emulator** - Receives projected activities

## Prerequisites

- **Android Studio Panda Canary 2** (or newer Canary build)
- XR tools require Canary channel, NOT stable Android Studio

## Emulator Setup

### 1. AI Glasses Emulator

| Setting | Value |
|---------|-------|
| Device Type | AI Glasses |
| System Image | `android-36/ai-glasses/x86_64` |
| Default Port | emulator-5554 (if started first) |

### 2. Phone Emulator (CRITICAL!)

| Setting | Value |
|---------|-------|
| Device Type | Any phone (e.g., Pixel 9a) |
| **API Level** | **API CANARY Preview** (NOT android-36!) |
| System Image | Google Play Intel x86_64 Atom System Image (CANARY) |
| Default Port | emulator-5556 (if started second) |

**Why CANARY?** Regular phone images don't have the XR companion service. Only CANARY Preview images include the Glasses companion app needed to pair with AI glasses.

## Pairing Emulators

1. Start AI Glasses emulator **first** (usually emulator-5554)
2. Start Phone emulator (usually emulator-5556)
3. On phone, open the **Glasses** app (pre-installed on CANARY image)
4. Follow pairing prompts - accept "Glasses" and "Glasses Core" associations
5. Emulators stay paired across restarts

## Common Issues & Fixes

### Issue: Camera/connection works initially, then stops

**Symptoms**: Features work after install, then fail on subsequent uses

**Root cause (suspected)**:
- CameraX/Camera2 resource leak in emulator's camera HAL
- OR Jetpack XR Projected service binding gets stuck (alpha SDK)
- OR emulator's glasses↔phone pairing state corrupts in memory

**Fix**: Fully close and restart the phone emulator. No need to create new AVD.

**Key insight**: Restart fixes it → runtime state corruption, not image corruption.

### Issue: Glasses not projecting

**Symptoms**: App connects but nothing shows on glasses display

**Fixes**:
1. Press the **glasses button** in emulator (icon above 3 dots menu) to wake display
2. Check if pairing is still valid - may need to re-pair
3. Cold boot phone emulator (Wipe data not usually needed)

### Issue: "No XR glasses detected" error

**Symptoms**: Connect fails with glasses not found

**Fixes**:
1. Verify glasses emulator is running
2. Check pairing in Glasses companion app on phone
3. Restart both emulators
4. If persists: Wipe glasses AVD data, forget device on phone, re-pair

### Issue: Speech recognition not available

**Symptoms**: "Speech recognition not available on this device"

**Cause**: Glasses emulator is minimal image without Google services

**This is expected behavior** - the glasses emulator doesn't support SpeechRecognizer.

**Workarounds**:
1. Test speech on phone emulator (network-based ASR works)
2. Use real glasses hardware for full speech testing
3. Use emulation mode for UI testing without real speech

## Display Mapping

| Display ID | Device |
|------------|--------|
| 0 | Phone (main) |
| 2 or 7 | Glasses (projected) |

To verify which display GlassesActivity launches on:
```bash
adb -s emulator-5554 shell dumpsys display | grep mDisplayId
```

## Useful ADB Commands

```bash
# List connected emulators
~/Android/Sdk/platform-tools/adb devices -l

# Install on phone emulator
~/Android/Sdk/platform-tools/adb -s emulator-5554 install -r app-release.apk

# Watch XR logs
~/Android/Sdk/platform-tools/adb -s emulator-5554 logcat | grep -iE "XRGlassesService|GlassesActivity|ProjectionLauncher"

# Watch all app logs
~/Android/Sdk/platform-tools/adb -s emulator-5554 logcat | grep com.xrglasses.app

# Clear logcat
~/Android/Sdk/platform-tools/adb -s emulator-5554 logcat -c
```

## Feature Availability Matrix

| Feature | Glasses Emulator | Phone Emulator | Real Glasses |
|---------|------------------|----------------|--------------|
| Projection | ✅ | N/A | ✅ |
| Speech (on-device) | ❌ | ❌ | ✅ |
| Speech (network) | ❌ | ✅ | ✅ |
| Camera | ❌ | ✅ (phone cam) | ✅ |
| Glasses UI | ✅ | N/A | ✅ |
| Phone UI | N/A | ✅ | ✅ |

## Emulation Mode (No Emulators Needed)

For quick UI testing without emulators:
1. Open app
2. Tap "Enable Emulation Mode"
3. Tap "Connect"
4. All features work with simulated data

**Use emulation mode for:**
- UI development
- Layout testing
- Quick iteration

**Use real emulators for:**
- Projection testing
- IPC/broadcast testing
- Integration testing

## Waking Glasses Display

The glasses display doesn't auto-wake when a projected activity launches (SDK limitation).

**To wake display**:
1. In glasses emulator, find the glasses button icon (above the 3 dots menu)
2. Click it to simulate user pressing glasses button
3. Display should wake and show GlassesActivity

**Note**: "Launching a projected activity does not automatically turn on the AI glasses' display (planned for future releases)" - Official SDK docs
