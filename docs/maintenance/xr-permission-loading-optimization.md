# XR Permission Loading Screen — Optimization Done

## The Problem We Solved
When XR glasses connect for the first time after a cold start, the Jetpack XR SDK launches `RequestPermissionsOnHostActivity` on the phone display to request **projected permissions** (glasses mic/camera access). This overlay corrupts React Native's hardware-accelerated text rendering — buttons become solid rectangles, text disappears.

## What We Tried (and failed)
1. **React `key` prop remount** — didn't work because corruption is at the native Android GPU rendering level, not React's component tree
2. **Native GPU repair** (toggling `LAYER_TYPE_SOFTWARE` → `LAYER_TYPE_NONE` on decor view + recursive `invalidate()`) — didn't fix the corrupted text
3. **Fixed-delay timer before emitting JS event** — fired before the permission overlay dismissed

## Solution: Loading Screen Wrapper + Instant Signal
A **loading screen wrapper** around the glasses dashboard that waits for the projected permission overlay to dismiss before mounting the real dashboard. Fresh native views = no corruption.

### Flow (first connection — permissions not yet granted):
1. `app/index.tsx` — gates on phone permissions (camera, mic, location, bluetooth) before showing Connect button
2. User taps Connect → navigates to `app/glasses/index.tsx`
3. `GlassesDashboardWrapper` shows "Initializing glasses..." spinner
4. Meanwhile, `GlassesActivity` (in `:xr_process`) requests projected permissions via `ProjectedPermissionsResultContract`
5. XR SDK shows `RequestPermissionsOnHostActivity` on phone (corrupts the spinner — nobody cares)
6. User grants permission → `GlassesActivity.handleProjectedPermissionResults()` sends `ACTION_PROJECTED_PERMISSIONS_COMPLETED` broadcast
7. `GlassesBroadcastReceiver` → `XRGlassesModule` emits `onProjectedPermissionsCompleted` JS event
8. `GlassesDashboardWrapper` receives event → sets `ready=true` → mounts real `GlassesDashboard` with fresh views

### Flow (subsequent connections — permissions already granted):
1. User taps Connect → navigates to `app/glasses/index.tsx`
2. `GlassesDashboardWrapper` shows spinner + listens for `onProjectedPermissionsCompleted`
3. `GlassesActivity.onCreate()` calls `checkAudioPermission()` → returns `true`
4. **Immediately** calls `notifyProjectedPermissionsCompleted(true)` — sends broadcast
5. Broadcast → `GlassesBroadcastReceiver` → `XRGlassesModule` → JS event
6. Wrapper receives event instantly → mounts dashboard with near-zero delay
7. Fallback timeout (2s) exists as safety net but should never fire

## Key Files
| File | What it does |
|------|-------------|
| `app/_layout.tsx` | Removed silent permission request (moved to index.tsx) |
| `app/index.tsx` | Permission gate — shows "Grant Permissions" UI before Connect buttons |
| `app/glasses/index.tsx` | `GlassesDashboardWrapper` — loading screen until `onProjectedPermissionsCompleted` (2s fallback) |
| `src/hooks/useXRGlasses.ts` | Removed `refreshKey`, `onUiRefreshNeeded` listener |
| `modules/xr-glasses/src/XRGlassesModule.ts` | `onProjectedPermissionsCompleted` in interface + implementations |
| `modules/xr-glasses/src/XRGlassesModule.web.ts` | `onProjectedPermissionsCompleted` stub |
| `modules/xr-glasses/types.ts` | Removed `UiRefreshNeededEvent` type |
| `modules/xr-glasses/index.ts` + `index.web.ts` | Removed `UiRefreshNeededEvent` re-export |
| `XRGlassesModule.kt` | `onProjectedPermissionsCompleted` event definition |
| `XRGlassesService.kt` | Removed `hasEmittedInitialRefresh`, repair methods |
| `GlassesActivity.kt` | Sends `PROJECTED_PERMISSIONS_COMPLETED` broadcast both after permission result AND immediately when already granted |
| `GlassesBroadcastReceiver.kt` | Handles broadcast, forwards to module |
| `AndroidManifest.xml` (xr-glasses) | `PROJECTED_PERMISSIONS_COMPLETED` action in receiver |
