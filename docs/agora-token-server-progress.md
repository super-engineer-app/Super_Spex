# Agora Remote View - Progress & Current State

**Last Updated:** 2026-02-02
**Status:** Token server WORKING, Web viewer WORKING, Emulation mode camera fix DONE

---

## Summary

The Agora.io Remote View streaming is now **fully working**:
- ✅ Token server deployed to Cloudflare Workers (using official `agora-token` npm package)
- ✅ Web viewer deployed to Cloudflare Pages
- ✅ App uses production URLs
- ✅ Emulation mode uses phone camera (glasses emulator camera returns black frames)

---

## Current Production Setup

### Token Server (Cloudflare Worker)
**URL:** `https://agora-token.spex-remote.workers.dev/`
**Location:** `cloudflare-workers/index.js`

Uses the official `agora-token` npm package with `nodejs_compat` flag enabled.

```bash
# Deploy token server
cd /home/azki/coding/spex/cloudflare-workers
npm install
npx wrangler deploy
```

### Web Viewer (Cloudflare Pages)
**URL:** `https://spex-viewer.pages.dev/view/{channelId}`
**Location:** `/home/azki/coding/spex-web-viewer/`

Static HTML/JS/CSS site that connects to Agora as a subscriber.

```bash
# Deploy viewer
cd /home/azki/coding/spex-web-viewer
npx wrangler pages deploy . --project-name=spex-viewer --commit-dirty=true
```

### App Configuration
**File:** `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/stream/AgoraStreamManager.kt`

```kotlin
private val TOKEN_SERVER_URL: String by lazy {
    "https://agora-token.spex-remote.workers.dev/"
}

private val VIEWER_URL_BASE: String by lazy {
    "https://spex-viewer.pages.dev/view/"
}
```

---

## Agora Account Configuration

**Project:** spex-remote
**App ID:** `dffce64560794daba02eecae3a4bc6c5`
**App Certificate:** `cb908f2281af490aa5c7d3db382b5b65`

**Required Agora Console settings:**
1. Primary Certificate: Enabled ✅
2. Stream Channel Configuration: Configured ✅
3. Data Center: Selected ✅

---

## Emulation Mode Camera Fix

**Problem:** When running on Android emulator with glasses emulator, the glasses camera (via ProjectedContext) returns black frames.

**Solution:** In emulation mode, the app now uses the phone's camera instead of glasses camera.

**Files Changed:**
1. `StreamingCameraManager.kt` - Added `emulationMode` parameter to `startCapture()`
2. `XRGlassesService.kt` - Passes `emulationMode` to StreamingCameraManager
3. `XRGlassesModule.kt` - Added `onStreamCameraSourceChanged` event
4. `modules/xr-glasses/index.ts` - Added `StreamCameraSourceChangedEvent` type
5. `src/hooks/useRemoteView.ts` - Added `cameraSource` and `isEmulationMode` state
6. `app/glasses/index.tsx` - Added camera source label in UI

**UI Indicator:**
- Shows "PHONE CAMERA (Emulation Mode)" in yellow when streaming in emulation mode
- Shows "GLASSES CAMERA" in green when using real glasses

---

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `cloudflare-workers/index.js` | Production token server | ✅ Working |
| `cloudflare-workers/wrangler.toml` | Wrangler config with nodejs_compat | ✅ Working |
| `cloudflare-workers/package.json` | Dependencies (agora-token) | ✅ Working |
| `/home/azki/coding/spex-web-viewer/` | Web viewer (Cloudflare Pages) | ✅ Working |
| `cloudflare-workers/agora-token-server-v2.js` | Old custom implementation | ❌ Deprecated |

---

## Testing Commands

**Test token server:**
```bash
curl "https://agora-token.spex-remote.workers.dev/?channel=test&role=publisher"
curl "https://agora-token.spex-remote.workers.dev/?channel=test&role=subscriber"
```

**Test web viewer:**
```bash
# Open in browser:
https://spex-viewer.pages.dev/view/test-channel-id
```

**Monitor Android logs:**
```bash
~/Android/Sdk/platform-tools/adb -s emulator-5556 logcat | grep -iE "Agora|Stream|Camera"
```

**Build and install app:**
```bash
cd /home/azki/coding/spex/android
export ANDROID_HOME=~/Android/Sdk
./gradlew clean && ./gradlew assembleRelease
~/Android/Sdk/platform-tools/adb -s emulator-5556 install -r app/build/outputs/apk/release/app-release.apk
```

---

## Known Issues & Next Steps

### 1. Black Screen on Glasses Emulator (WORKAROUND IN PLACE)
**Issue:** The glasses emulator's camera returns black frames when accessed via ProjectedContext from the phone app.
**Workaround:** Emulation mode now uses phone camera instead.
**Next Step:** Test on real hardware to confirm glasses camera works correctly.

### 2. Black Screen in Emulation Mode (NEXT PRIORITY)
**Issue:** Even with the phone camera fix, the screen share in emulation mode still shows a black screen on the web viewer.
**Status:** Not yet investigated.
**Possible causes:**
- Phone emulator camera may also return black/simulated frames
- Frame format/encoding mismatch
- Agora SDK configuration issue
**Next Step:** Debug frame capture and push to identify where black frames originate.

### 3. Test on Real Hardware
- [ ] Test with physical phone (not emulator)
- [ ] Test with real XR glasses (when available)
- [ ] Verify glasses camera via ProjectedContext works on real device

### 4. Test Web Viewer Compatibility
- [ ] Test on Chrome (desktop)
- [ ] Test on Firefox (desktop)
- [ ] Test on Safari (desktop)
- [ ] Test on Chrome (mobile)
- [ ] Test on Safari (mobile/iOS)

### 5. Investigate Black Screen Further
If black screen persists on real hardware:
1. Check if frames are being pushed: Add logging to `pushVideoFrameBuffer()`
2. Check frame format: Verify NV21 conversion is correct
3. Check Agora encoding: Verify video encoder settings match
4. Compare with Agora sample app to identify differences

### 6. Audio Autoplay Issue
The web viewer shows "AudioContext was prevented from starting automatically" warnings.
- Add a "Click to unmute" button or user gesture requirement
- Implement `AgoraRTC.onAutoplayFailed` callback

### 7. Production Hardening
- [ ] Move Agora credentials to Cloudflare secrets (not hardcoded)
- [ ] Add rate limiting to token server
- [ ] Add error monitoring/logging
- [ ] Consider adding viewer authentication

---

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────────────┐
│   Phone App         │     │   Cloudflare Worker         │
│   (Publisher)       │     │   (Token Server)            │
│                     │     │   agora-token.spex-remote.  │
│  StreamingCamera    │     │   workers.dev               │
│       ↓             │     └─────────────────────────────┘
│  AgoraStreamManager │                ↑
│       ↓             │                │ Fetch token
│  Agora RTC SDK      │────────────────┘
│       ↓             │
│  Push frames to     │     ┌─────────────────────────────┐
│  Agora servers      │────→│   Agora Cloud               │
└─────────────────────┘     │   (Media Relay)             │
                            └─────────────────────────────┘
                                         ↓
                            ┌─────────────────────────────┐
                            │   Web Viewer                │
                            │   (Subscriber)              │
                            │   spex-viewer.pages.dev     │
                            │                             │
                            │   Agora Web SDK             │
                            │       ↓                     │
                            │   Display video             │
                            └─────────────────────────────┘
```

---

## Lessons Learned

1. **Always use official libraries** - Custom crypto implementations are error-prone. The official `agora-token` npm package works perfectly with Cloudflare Workers' `nodejs_compat` flag.

2. **Cloudflare Workers support Node.js** - With `nodejs_compat` flag and recent compatibility dates, most Node.js packages work in Workers.

3. **Static site paths matter** - Web viewer needed absolute paths (`/styles.css` not `styles.css`) because URLs like `/view/channel-id` were resolving relative paths incorrectly.

4. **Emulator cameras have limitations** - The Android XR glasses emulator doesn't provide real camera frames via ProjectedContext. Use phone camera for testing.

5. **Token format** - Agora tokens start with `007` followed by base64-encoded zlib-compressed data containing signature, appId, and service data.
