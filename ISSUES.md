# Codebase Issues - Comprehensive Analysis

> **Last Updated:** 2026-02-04
> **Status:** Critical issues FIXED, documentation updated

---

## FIXED ISSUES

### Kotlin Non-Null Assertions (!!) - FIXED
All `!!` assertions in `StreamingCameraManager.kt` have been replaced with safe patterns:
- `cameraExecutor!!` → null check with early return
- `nv21Buffer!!` → `AtomicReference<ByteArray?>` with safe access

### Race Conditions - FIXED
Thread safety improvements made to:
- `StreamingCameraManager.kt`: `isCapturing` → `AtomicBoolean`, `nv21Buffer` → `AtomicReference`, added `@Volatile` to shared fields
- `AgoraStreamManager.kt`: `viewerCount` → `AtomicInteger`, `viewers` → `ConcurrentHashMap`, `currentSession` → `AtomicReference`
- `GlassesActivity.kt`: Added `isActivityDestroyed` flag, all handler callbacks now check this flag, `mainHandler.removeCallbacksAndMessages(null)` in `onDestroy()`

### Resource Leaks - FIXED
- `GlassesActivity.kt`: Handler callbacks now check `isActivityDestroyed` before executing, all pending callbacks removed in `onDestroy()`

### TypeScript Race Conditions - FIXED
- `useTaggingSession.ts`: Replaced `setTimeout(100)` hack with proper ref-based state machine using `pendingSaveRef` and a `useEffect` that watches for transcript updates

### Documentation Mismatches - FIXED
- `docs/architecture.md`: Updated streaming architecture to show it runs in main process, removed `TextureCameraProvider` references, added `StreamingCameraManager` and `AgoraStreamManager` to main process
- `docs/glasses-display.md`: Added note that Glimmer is documented for reference but not currently used
- `docs/remote-view-streaming.md`: Updated `cloudflare-workers/index.js` → `cloudflare-workers/src/index.ts`

---

## REMAINING ISSUES (Low/Medium Priority)

### TypeScript Type Safety

| File | Line | Issue | Risk |
|------|------|-------|------|
| `backendApi.ts` | 134 | `as any` for FormData | **LOW** - RN limitation workaround |
| `XRGlassesModule.ts` | Multiple | `@ts-ignore` comments | **MEDIUM** - bypasses type checking |

### Code Structure Issues

| Files | Issue |
|-------|-------|
| `GlassesCameraManager.kt`, `StreamingCameraManager.kt` | Duplicate `getGlassesContext()` - could extract to shared utility |

### Magic Numbers/Strings

| File | Line | Example |
|------|------|---------|
| `StreamingCameraManager.kt` | 289 | `5000` ms log interval |
| `AgoraStreamManager.kt` | 192 | `15` seconds timeout |
| `useParkingTimer.ts` | 158 | `1000` ms interval |
| `taggingApi.ts` | 17 | Hardcoded backend URL `10.0.2.2:8000` |

### Security Considerations

| File | Issue | Risk |
|------|-------|------|
| `taggingApi.ts:17` | HTTP (not HTTPS) for backend URL | **MEDIUM** - data in transit unencrypted |
| `taggingApi.ts:22-23` | Hardcoded dev user/org IDs | **LOW** - dev only |

---

## Summary

**Fixed:**
- All critical crash-prone `!!` assertions
- All thread safety / race condition issues
- Resource leak in `GlassesActivity`
- TypeScript `setTimeout` race condition
- Documentation drift from implementation

**Remaining:**
- `@ts-ignore` in `XRGlassesModule.ts` (need proper type definitions)
- Magic numbers could be constants
- Code duplication in camera context getters
- HTTP backend URL should be HTTPS
