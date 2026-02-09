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
1. User taps "Connect" in React Native UI (phone permissions already granted on home screen)
2. `GlassesDashboardWrapper` mounts, shows "Initializing glasses..." spinner, listens for `onProjectedPermissionsCompleted`
3. `XRGlassesService.connect()` sends Intent to `ProjectionLauncherActivity`
4. `ProjectionLauncherActivity` (in `:xr_process`) creates `ProjectedContext` and launches `GlassesActivity`
5. `GlassesActivity.onCreate()` checks `checkAudioPermission()`:
   - **Already granted**: Immediately sends `PROJECTED_PERMISSIONS_COMPLETED` broadcast → wrapper unmounts instantly
   - **Not granted**: XR SDK shows `RequestPermissionsOnHostActivity` on phone → user grants → `handleProjectedPermissionResults()` sends broadcast → wrapper unmounts
6. `GlassesDashboardWrapper` receives `onProjectedPermissionsCompleted` event → mounts real `GlassesDashboard` with fresh views (2s fallback timeout as safety net)
7. `GlassesActivity` appears on glasses display

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

**Cause**: The XR SDK launches `RequestPermissionsOnHostActivity` on the phone display during first connection, which overlays React Native's MainActivity and corrupts native text rendering at the GPU level.

**Symptoms**: Button text disappears (buttons show as solid colored rectangles without text), section titles may still render correctly.

**Fix**: Loading screen wrapper (`GlassesDashboardWrapper` in `app/glasses/index.tsx`) defers mounting the real dashboard until the XR permission overlay has dismissed. Fresh native views = no corruption.

1. **Native side** (`GlassesActivity.kt`): Sends `ACTION_PROJECTED_PERMISSIONS_COMPLETED` broadcast in two cases:
   - **Permissions already granted**: Immediately in `onCreate()` when `checkAudioPermission()` returns true
   - **Permissions just granted**: In `handleProjectedPermissionResults()` after user grants via XR SDK overlay

2. **Broadcast chain**: `GlassesActivity` → `GlassesBroadcastReceiver` → `XRGlassesModule.sendEvent("onProjectedPermissionsCompleted")` → JS

3. **React side** (`app/glasses/index.tsx`): `GlassesDashboardWrapper` shows a loading spinner and listens for `onProjectedPermissionsCompleted`. When the event fires, it sets `ready=true` and mounts the real `GlassesDashboard` with uncorrupted native views. A 2-second fallback timeout exists as a safety net.

**Why not a simple remount/refresh?** Tried React `key` remount and native GPU repair (`setLayerType` toggle + `invalidate()`) — neither fixes corruption at the Android GPU rendering level. Only fresh views created after the overlay dismisses work.

See [xr-permission-loading-optimization.md](xr-permission-loading-optimization.md) for full history of approaches tried.

---

## What NOT to Do

1. **NEVER** call `ProjectedContext.createProjectedDeviceContext()` from the main process **for display/projection purposes** (camera access via `SharedCameraProvider.kt` is fine and verified working)
2. **NEVER** call `ProjectedActivityCompat.create()` with React Native's context
3. **NEVER** remove the `android:process=":xr_process"` attribute from XR activities
4. **NEVER** import/use XR SDK classes directly in `XRGlassesService.kt` or `XRGlassesModule.kt` (use reflection instead, as `SharedCameraProvider.kt` does for camera access)

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
