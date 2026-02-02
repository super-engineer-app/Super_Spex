# Remote View Streaming

This document covers the Remote View streaming feature, which allows users to stream their glasses camera view to remote viewers via the web.

## Overview

Remote View uses Agora RTC to stream video from the glasses camera to a web-based viewer. The system consists of:

1. **Android App (Publisher)**: Captures camera frames and pushes them to Agora
2. **Agora Cloud**: Handles real-time video distribution
3. **Web Viewer (Subscriber)**: Receives and displays the video stream

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         PHONE (Main Process)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌───────────────────┐                   │
│  │ StreamingCamera  │───▶│ AgoraStreamManager│──▶ Agora Cloud    │
│  │    Manager       │    │                   │                   │
│  │  (YUV→NV21)      │    │  (Push frames)    │                   │
│  └──────────────────┘    └───────────────────┘                   │
│         ▲                                                        │
│         │ CameraX ImageAnalysis                                  │
│         │                                                        │
│  ┌──────────────────┐  OR  ┌──────────────────┐                  │
│  │ ProjectedContext │      │ Phone Camera     │                  │
│  │ (Glasses camera) │      │ (Demo Mode)      │                  │
│  └──────────────────┘      └──────────────────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                              │
                              ▼
                        ┌──────────┐
                        │  Agora   │
                        │  Cloud   │
                        └──────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WEB VIEWER (Browser)                        │
├─────────────────────────────────────────────────────────────────┤
│  viewer.js                                                       │
│  - Fetches token from Cloudflare Worker                         │
│  - Subscribes to Agora channel                                   │
│  - Displays video stream                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Demo Mode

Demo mode allows testing Remote View streaming without real XR glasses by using the phone's camera and microphone instead.

### How Demo Mode Works

1. **Activation**: User taps "Demo Mode" on home screen, setting `emulationMode = true` in `XRGlassesService`

2. **Camera Selection** (`StreamingCameraManager.kt:139-149`):
   ```kotlin
   if (isEmulationMode) {
       cameraSource = "PHONE CAMERA (Demo Mode)"
       return context  // Use phone camera
   }
   // Otherwise use ProjectedContext.createProjectedDeviceContext() for glasses camera
   ```

3. **Stream Initialization Order** (`XRGlassesService.kt:1219-1236`):
   - Agora stream starts FIRST (before camera)
   - This prevents race condition where frames were dropped before session was ready
   - Camera starts AFTER Agora session is established

4. **Audio**: Phone microphone is used via `engine.enableAudio()`

### Demo Mode vs Android Emulator

- **Demo Mode**: App feature for testing WITHOUT real glasses (uses phone hardware)
- **Android Emulator**: The Android Studio emulator running the app

These are independent - you can run demo mode on a real phone OR on the Android emulator.

## Key Files

### Android (Publisher)

| File | Purpose |
|------|---------|
| `StreamingCameraManager.kt` | Captures camera frames using CameraX ImageAnalysis, converts YUV_420_888 to NV21 |
| `AgoraStreamManager.kt` | Manages Agora RTC engine, pushes frames, handles connection |
| `StreamQuality.kt` | Quality presets (LOW_LATENCY, BALANCED, HIGH_QUALITY) |
| `XRGlassesService.kt` | Orchestrates streaming, manages lifecycle |

### Web Viewer (Subscriber)

| File | Purpose |
|------|---------|
| `viewer.js` | Agora client, subscribes to stream, displays video |
| `index.html` | Viewer page structure |
| `styles.css` | Viewer styling |

### Token Server (Cloudflare Worker)

| File | Purpose |
|------|---------|
| `cloudflare-workers/index.js` | Generates Agora RTC tokens |

## Video Format Pipeline

```
Camera (YUV_420_888) → StreamingCameraManager → NV21 → Agora → H.264 → Web
```

### YUV to NV21 Conversion

The camera provides YUV_420_888 format with separate Y, U, V planes. NV21 format is:
- Full Y plane (width × height bytes)
- Interleaved VU plane (width × height / 2 bytes)

Key considerations:
- Handle different row strides (some devices have padding)
- Handle different pixel strides (planes may or may not be interleaved)
- NV21 has VU order (not UV)

## Quality Presets

| Preset | Resolution | FPS | Bitrate |
|--------|------------|-----|---------|
| LOW_LATENCY | 480×640 | 15 | 400 kbps |
| BALANCED | 720×1280 | 15 | 800 kbps |
| HIGH_QUALITY | 720×1280 | 30 | 1200 kbps |

## Troubleshooting

### Grey/Black Video

**Symptoms**: Viewer shows grey or black instead of camera content

**Potential Causes**:
1. **Camera not providing real frames**: Check logcat for "GREY/EMPTY" warnings
2. **YUV conversion issue**: Incorrect stride/pixel stride handling
3. **Wrong video format**: Must use `FORMAT_NV21` in AgoraVideoFrame
4. **CSS display issue**: Video element exists but not visible (check computed styles)

**Debug Steps**:
1. Check Android logs: `adb logcat | grep -iE "StreamingCameraManager|AgoraStreamManager"`
2. Look for frame stats (avg, min, max values) - low variance = grey frames
3. Verify NV21 buffer size matches expected: `width × height × 1.5`

### Video Shows in Thumbnails but Not Main Display

**Cause**: CSS issue with Agora's video element rendering

**Solution**: Ensure CSS forces video element visibility:
```css
.video-player video,
.video-player canvas {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
}
```

### Agora Error 101 (Invalid App ID)

**Symptoms**: RTC engine fails to initialize with error code 101

**Cause**: Kotlin nested `apply` blocks can corrupt the `mAppId` field in `RtcEngineConfig`

**Solution**: Use explicit property assignments instead of nested `apply`:
```kotlin
// BAD - nested apply corrupts mAppId
val config = RtcEngineConfig().apply {
    mContext = context
    mAppId = appId
    mEventHandler = object : IRtcEngineEventHandler() { ... }
}

// GOOD - explicit assignments
val config = RtcEngineConfig()
config.mContext = context
config.mAppId = appId
config.mEventHandler = object : IRtcEngineEventHandler() { ... }
```

### Connection Failures

**Token errors**:
- Check Cloudflare Worker is deployed and secrets are set
- Verify AGORA_APP_ID matches in all places

**Network issues**:
- Check internet connectivity
- Agora requires specific ports (see Agora firewall docs)

### Camera Access Issues

**ProjectedContext errors**:
- Streaming must run in main process (not :xr_process)
- Camera permissions must be granted
- In emulation mode, uses phone camera instead

## Configuration

### Environment Variables (.env)

```
AGORA_APP_ID=your_app_id
SPEX_VIEWER_URL_BASE=https://REDACTED_VIEWER_URL/view/
```

### Cloudflare Worker Secrets

```bash
wrangler secret put AGORA_APP_ID
wrangler secret put AGORA_APP_CERTIFICATE
```

## URLs

| Service | URL |
|---------|-----|
| Web Viewer | https://REDACTED_VIEWER_URL/view/{channelId} |
| Token Server | https://REDACTED_TOKEN_SERVER/ |

## Audio Streaming

Audio is enabled via `engine.enableAudio()` in AgoraStreamManager. The web viewer supports audio playback via `remoteAudioTrack.play()`.

### Audio Routing Behavior

| Mode | Camera Source | Audio Source | Notes |
|------|---------------|--------------|-------|
| Real glasses (Bluetooth) | Glasses camera (ProjectedContext) | Glasses mic (Bluetooth HFP) | Should route automatically when glasses are paired as Bluetooth audio device |
| Demo mode (real phone) | Phone camera | Phone mic | ✅ WORKING - phone camera + mic streams to viewers |
| Android XR Emulator | Glasses camera (ProjectedContext) | Speakerphone | Emulator limitation - no real Bluetooth |

### Emulator Audio Limitation

**Issue**: In the Android XR emulator, audio routes to SPEAKERPHONE instead of Bluetooth, even though glasses are "paired".

**Cause**: The emulator's phone-glasses connection uses a special XR communication channel for camera/display, not standard Bluetooth HFP/A2DP audio profiles that Agora expects.

**Symptoms**:
- `onAudioRouteChanged` logs show `SPEAKERPHONE` instead of `BLUETOOTH HEADSET`
- System logs show `bluetooth-a2dp` activity but Agora doesn't detect it

**Workaround**: Test audio in emulation mode on a real phone (uses phone mic), or wait for real AI glasses hardware for full Bluetooth audio testing.

**Future TODO**: When AI glasses hardware is available, verify that:
1. Glasses pair as Bluetooth audio device (HFP profile)
2. `onAudioRouteChanged` shows `BLUETOOTH HEADSET` (route 5)
3. Audio from glasses mic transmits to web viewers
4. Audio from web viewers plays through glasses speakers

If Bluetooth routing doesn't work on real hardware, implement external audio source/sink using ProjectedContext (similar to how camera uses `createProjectedDeviceContext()`).

## Logs to Monitor

```bash
# Android streaming logs
adb logcat | grep -iE "StreamingCameraManager|AgoraStreamManager|XRGlassesService"

# Watch frame push rate
adb logcat | grep "Streaming:"

# Monitor audio route
adb logcat | grep "AUDIO ROUTE"
```

## Common Fixes

| Issue | Fix |
|-------|-----|
| Grey video | Switch to NV21 format, check YUV conversion |
| Video not visible | Add `!important` CSS overrides for video element |
| Token errors | Verify Cloudflare Worker secrets |
| No camera frames | Check ProjectedContext and camera permissions |
| High latency | Use LOW_LATENCY quality preset |
