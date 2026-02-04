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
| `ProjectionLauncherActivity.kt` | :xr_process | Handles XR SDK setup, launches GlassesActivity, **closes projected context after use** |
| `GlassesActivity.kt` | :xr_process | Runs on glasses display, handles speech/UI, listens for close broadcast |
| `GlassesBroadcastReceiver.kt` | Main | Receives broadcasts from :xr_process |

### Connection/Disconnection Flow

**Connect Flow:**
1. User taps "Connect" in React Native UI
2. `XRGlassesService.connect()` sends Intent to `ProjectionLauncherActivity`
3. `ProjectionLauncherActivity` (in `:xr_process`) creates `ProjectedContext` and launches `GlassesActivity`
4. After 2 seconds, emits `onUiRefreshNeeded` event to help React Native recover from any XR permission overlays
5. `GlassesActivity` appears on glasses display

**Disconnect Flow:**
1. User taps "Disconnect" in React Native UI
2. `XRGlassesService.disconnect()` sends `CLOSE_GLASSES` broadcast
3. `GlassesActivity` receives broadcast and calls `finish()` to close itself
4. `XRGlassesService` closes the `ProjectedContext`
5. Glasses display clears, phone UI returns to disconnected state

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

**Fix**: Simply disconnect and reconnect from the phone app. No need to wipe emulator data.

1. Tap "Disconnect" on the phone app
2. Tap "Connect" again

This works because `ProjectionLauncherActivity` properly closes the `projectedDeviceContext` after each connection, preventing state corruption across sessions.

### Issue: User pressed back on glasses, projection gone

**Cause**: User pressed back button on glasses which closes `GlassesActivity`.

**Fix**: Disconnect and reconnect from the phone app. This is the expected behavior - the glasses "back" button closes the projection, and reconnecting relaunches it.

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

### Issue: Glasses still show projected UI after disconnect

**Cause**: `GlassesActivity` wasn't receiving the close command.

**Fix**: The disconnect flow now sends a `CLOSE_GLASSES` broadcast:
```kotlin
// In XRGlassesService.disconnect()
val closeIntent = Intent("expo.modules.xrglasses.CLOSE_GLASSES")
closeIntent.setPackage(context.packageName)
context.sendBroadcast(closeIntent)
```

`GlassesActivity` has a `BroadcastReceiver` that listens for this and calls `finish()`.

### Issue: React Native UI corrupted on first connection after cold start

**Cause**: The XR SDK launches `RequestPermissionsOnHostActivity` on the phone display during first connection, which overlays React Native's MainActivity and corrupts native text rendering.

**Symptoms**: Button text disappears (buttons show as solid colored rectangles without text), section titles may still render correctly.

**Fix**: A two-part solution:

1. **Native side** (`XRGlassesService.kt`): Emits `onUiRefreshNeeded` event **once per app session** (first connection only) after 2 seconds:
```kotlin
// Only fires once per app session (hasEmittedInitialRefresh flag)
if (!hasEmittedInitialRefresh) {
    hasEmittedInitialRefresh = true
    mainHandler.postDelayed({
        module.emitEvent("onUiRefreshNeeded", mapOf("reason" to "post_glasses_launch"))
    }, 2000)
}
```

2. **React side** (`useXRGlasses.ts` + `GlassesDashboard`): Increments `refreshKey` which triggers a navigation refresh to fix corrupted UI:
```typescript
// In useXRGlasses.ts - increment refreshKey
setState(prev => ({ ...prev, refreshKey: prev.refreshKey + 1 }));

// In GlassesDashboard - do navigation refresh (skip if streaming)
useEffect(() => {
  if (refreshKey > initialRefreshKey.current && !isStreaming) {
    router.replace('/glasses');  // Full remount fixes corrupted native views
  }
}, [refreshKey, router, isStreaming]);
```

**Why navigation refresh?** Simple state updates don't fix corrupted native text views - a full component unmount/remount is required. The navigation refresh simulates what users do manually (back + reopen).

**Why only once?** The corruption only happens on **first connection after cold start** when the XR permission overlay appears. Subsequent connections don't cause corruption, and we don't want to disrupt active streaming sessions.

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
- [ ] **Glasses display clears after disconnect** (no lingering projected UI)
- [ ] Reconnect works after disconnect
- [ ] App restart + connect works correctly
- [ ] **Cold start after wipe**: First connection doesn't corrupt React Native UI

---

## Related Documentation

- [Android XR SDK Docs](https://developer.android.com/develop/xr/jetpack-xr-sdk)
- `/docs/xr-glasses-resources.md` - API references and samples
- `/docs/PROJECTION_FIX_ATTEMPTS.md` - Detailed log of fix attempts
