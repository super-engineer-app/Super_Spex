# XR Glasses Projection - Maintenance Guide

## Overview
This document explains how the XR glasses projection system works and how to fix common issues.

## Architecture

### The Problem We Solved
The Android XR SDK (Jetpack XR) corrupts React Native's rendering context when called from the same process. This causes text in buttons and other UI elements to disappear on the phone while the glasses projection works.

### The Solution: Separate Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                             │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  React Native   │    │      XRGlassesService           │ │
│  │  (Phone UI)     │◄───│  (Bridge - NO XR SDK calls)     │ │
│  └─────────────────┘    └─────────────┬───────────────────┘ │
└───────────────────────────────────────┼─────────────────────┘
                                        │ Intent (IPC)
                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    :xr_process (SEPARATE)                    │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │ ProjectionLauncher  │───►│     GlassesActivity         │ │
│  │ Activity            │    │  (Runs on glasses display)  │ │
│  │ (XR SDK setup)      │    │  (XR SDK, Speech, etc.)     │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Process | Purpose |
|------|---------|---------|
| `XRGlassesService.kt` | Main | Bridge between RN and XR. Does NOT call XR SDK directly |
| `XRGlassesModule.kt` | Main | Expo native module, receives events via broadcast |
| `ProjectionLauncherActivity.kt` | :xr_process | Handles XR SDK setup, launches GlassesActivity |
| `GlassesActivity.kt` | :xr_process | Runs on glasses display, handles speech/UI |
| `GlassesBroadcastReceiver.kt` | Main | Receives broadcasts from :xr_process |

### Critical Manifest Configuration

```xml
<!-- These MUST have android:process=":xr_process" -->
<activity
    android:name=".ProjectionLauncherActivity"
    android:process=":xr_process"
    ... />

<activity
    android:name=".glasses.GlassesActivity"
    android:process=":xr_process"
    android:requiredDisplayCategory="xr_projected"
    ... />
```

**WARNING**: Removing `android:process=":xr_process"` will break React Native's UI!

---

## Common Issues & Fixes

### Issue: Phone UI text disappears after connecting to glasses

**Cause**: XR SDK code running in the same process as React Native.

**Fix**: Ensure all XR activities have `android:process=":xr_process"` in AndroidManifest.xml.

**Verification**:
```bash
# Check manifest for process attribute
grep -A5 "GlassesActivity\|ProjectionLauncherActivity" modules/xr-glasses/android/src/main/AndroidManifest.xml
```

### Issue: Glasses don't project after app restart

**Cause**: XR system state from previous session may be stale.

**Fix**:
1. Fully kill the app (not just close)
2. Reconnect to glasses
3. If persists, disconnect glasses in system settings and re-pair

### Issue: Communication between phone and glasses not working

**Cause**: Broadcasts not crossing process boundary correctly.

**Fix**: Ensure broadcasts use `setPackage(packageName)`:
```kotlin
val intent = Intent(ACTION_SPEECH_RESULT).apply {
    putExtra(EXTRA_TEXT, text)
    setPackage(packageName)  // Required for cross-process
}
sendBroadcast(intent)
```

---

## What NOT to Do

1. **NEVER** call `ProjectedContext.createProjectedDeviceContext()` from the main process
2. **NEVER** call `ProjectedActivityCompat.create()` with React Native's context
3. **NEVER** remove the `android:process=":xr_process"` attribute from XR activities
4. **NEVER** import/use XR SDK classes directly in `XRGlassesService.kt` or `XRGlassesModule.kt`

---

## Failed Approaches (For Reference)

These approaches were tried and **DID NOT WORK**:

### 1. Using createProjectedActivityOptions() directly
Tried using the simpler API without createProjectedDeviceContext(). Failed because other XR SDK calls still affected RN.

### 2. Intermediate Activity (same process)
Created ProjectionLauncherActivity to isolate RN from XR setup, but running in the same process still caused corruption.

### 3. Removing individual XR SDK calls
Tried removing specific calls (createProjectedDeviceContext, ProjectedActivityCompat.create). Failed because the XR SDK has global effects on the process.

### 4. Using Application Context instead of Activity Context
The XR SDK affects the process regardless of which context type is used.

**The ONLY solution that worked**: Running XR activities in a completely separate Android process.

---

## Testing Checklist

After any changes to the XR module:

- [ ] Phone UI text renders correctly after connecting
- [ ] Glasses display shows GlassesActivity
- [ ] Speech recognition works on glasses
- [ ] Disconnect works without crashing
- [ ] Reconnect works after disconnect
- [ ] App restart + connect works correctly

---

## Related Documentation

- [Android XR SDK Docs](https://developer.android.com/develop/xr/jetpack-xr-sdk)
- `/docs/xr-glasses-resources.md` - API references and samples
- `/docs/PROJECTION_FIX_ATTEMPTS.md` - Detailed log of fix attempts
