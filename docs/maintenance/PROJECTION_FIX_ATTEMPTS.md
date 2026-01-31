# Projection Fix Attempts

## Problem Statement
When connecting to XR glasses, the React Native phone UI gets corrupted (text in buttons disappears), but the glasses projection works. We need both to work simultaneously.

## Key Observation (Critical!)
**First launch + connect**: UI broken, glasses project correctly
**Disconnect + restart + connect**: UI works fine, but glasses NO LONGER project

This suggests:
- First connection triggers some XR SDK initialization that corrupts RN but enables projection
- Subsequent connections skip that initialization, so RN works but projection fails
- Something is being cached/persisted by the Android XR system between app restarts

---

## Attempted Solutions

### Attempt 1: Use createProjectedActivityOptions() directly
**Date**: 2024-01-31
**Change**: Instead of calling `createProjectedDeviceContext(activity)` on MainActivity, tried using `createProjectedActivityOptions(context)` directly.
**Result**: FAILED - UI still broken
**Reason**: The issue wasn't specifically `createProjectedDeviceContext()`, something else was corrupting RN.

### Attempt 2: Intermediate Activity (ProjectionLauncherActivity)
**Date**: 2024-01-31
**Change**: Created `ProjectionLauncherActivity` - a lightweight native Android activity that:
1. Gets launched from XRGlassesService
2. Creates projected device context from ITSELF (not React Native)
3. Launches GlassesActivity with proper options
4. Finishes immediately

**Files Created**:
- `ProjectionLauncherActivity.kt`
- Added to `AndroidManifest.xml`

**Result**: FAILED - UI still broken
**Reason**: Even though RN MainActivity wasn't touched directly, something in the XR SDK setup still affected RN's rendering.

### Attempt 3: Remove createProjectedDeviceContext() from connect()
**Date**: 2024-01-31
**Change**: Removed the `createProjectedDeviceContext(context)` call that was getting `glassesContext` for capability queries in `XRGlassesService.connect()`.
**Result**: FAILED - UI still broken
**Reason**: The `ProjectedActivityCompat.create(context)` call was still happening with RN context.

### Attempt 4: Remove ProjectedActivityCompat.create() entirely
**Date**: 2024-01-31
**Change**: Completely removed the `ProjectedActivityCompat.create(context, continuation)` call from `connect()`. Simply verified XR SDK availability and launched GlassesActivity.
**Result**: FAILED
**Observation**:
- First connect: UI broken, projection works
- After disconnect + restart + connect: UI works, projection doesn't work

### Attempt 5: Separate Android Process (SUCCESS!)
**Date**: 2024-01-31
**Change**: Added `android:process=":xr_process"` to both `ProjectionLauncherActivity` and `GlassesActivity` in AndroidManifest.xml. This runs all XR SDK code in a completely separate OS process from React Native.

**Manifest Changes**:
```xml
<activity
    android:name=".ProjectionLauncherActivity"
    android:process=":xr_process"
    ... />

<activity
    android:name=".glasses.GlassesActivity"
    android:process=":xr_process"
    ... />
```

**Result**: SUCCESS!
- Phone UI renders correctly (text in buttons visible)
- Glasses projection works
- Both work simultaneously

**Why it works**: Android processes have completely separate memory spaces. The XR SDK's modifications to rendering context only affect the `:xr_process`, not React Native's main process.

---

## Root Cause Analysis

### What we know:
1. The XR SDK initialization affects React Native's rendering context
2. This happens even when using an intermediate activity
3. The "corruption" persists within a session but something is reset on app restart
4. After app restart, the XR system seems to remember previous connection (UI works) but projection setup is incomplete (glasses don't project)

### Hypothesis:
The Android XR system has some global state that gets modified during first connection. This state:
- Affects the current process's rendering pipeline (breaks RN)
- Is partially persisted across app restarts (why subsequent connects have different behavior)
- Requires "fresh" initialization to enable projection

### Potential Solutions to Try:

#### Solution A: Separate Process
Run `ProjectionLauncherActivity` in a completely separate Android process:
```xml
<activity
    android:name=".ProjectionLauncherActivity"
    android:process=":xr_launcher"
    ... />
```
This would completely isolate the XR SDK calls from React Native's process.

#### Solution B: Clear XR State Before Connect
Find a way to "reset" the XR system state before each connection attempt.

#### Solution C: Foreground Service Approach
Use a foreground service in a separate process to manage the XR connection.

#### Solution D: Native Module in Separate Process
Create the Expo native module to run in a separate process.

#### Solution E: Delay/Async Initialization
Initialize XR SDK after React Native has fully rendered, possibly using a delay or waiting for specific lifecycle events.

---

## Files Modified During Attempts

### XRGlassesService.kt
- `connect()` - Removed ProjectedActivityCompat.create() call
- `launchGlassesActivity()` - Added intermediate activity support
- Removed `createProjectedDeviceContext()` for capability queries

### ProjectionLauncherActivity.kt (NEW)
- Intermediate activity for isolated projection setup
- Uses transparent theme, finishes immediately after launching GlassesActivity

### AndroidManifest.xml
- Added ProjectionLauncherActivity declaration

---

## Solution Summary

**The fix**: Run all XR-related activities in a separate Android process using `android:process=":xr_process"`.

**Key insight**: The Android XR SDK modifies global process state that affects rendering. By isolating XR code in its own process, React Native's rendering remains unaffected.

**Maintenance**: See `/docs/maintenance/xr-glasses-projection.md` for detailed architecture and troubleshooting guide.
