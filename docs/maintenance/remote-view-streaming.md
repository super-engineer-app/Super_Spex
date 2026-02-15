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
│  viewer.ts                                                       │
│  - Lobby: camera/mic setup, name entry                          │
│  - Participant grid with host priority                           │
│  - Fetches token from Cloudflare Worker                         │
│  - Two-way audio/video streaming                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Demo Mode

Demo mode allows testing Remote View streaming without real XR glasses by using the phone's camera and microphone instead.

### How Demo Mode Works

1. **Activation**: User taps "Demo Mode" on home screen, setting `emulationMode = true` in `XRGlassesService`

2. **Camera Selection** (`SharedCameraProvider.kt:getCameraContext()`):
   ```kotlin
   if (isEmulationMode) {
       cameraSource = "PHONE CAMERA (Demo Mode)"
       return context  // Use phone camera
   }
   // Otherwise use ProjectedContext.createProjectedDeviceContext() for glasses camera
   ```

3. **Stream Initialization Order** (`XRGlassesService.kt:startRemoteView()`):
   - Agora stream starts FIRST (before camera)
   - This prevents race condition where frames were dropped before session was ready
   - Camera starts AFTER Agora session is established

4. **Audio**: Phone microphone is used via `engine.enableAudio()`

5. **Keep-Awake**: Screen stays on during streaming via `FLAG_KEEP_SCREEN_ON` (automatic)

### Demo Mode vs Android Emulator

- **Demo Mode**: App feature for testing WITHOUT real glasses (uses phone hardware)
- **Android Emulator**: The Android Studio emulator running the app

These are independent - you can run demo mode on a real phone OR on the Android emulator.

## Real-time Viewer Tracking

Viewer count is tracked in real-time using WebSockets and Cloudflare Durable Objects.

### Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────────────┐
│   Phone App     │◄──────────────────►│  Cloudflare Worker       │
│  (host role)    │                    │  + Durable Objects       │
└─────────────────┘                    │  (ChannelRoom per channel)│
                                       └──────────────────────────┘
┌─────────────────┐    HTTP + KV TTL              ▲
│   Web Viewer    │───────────────────────────────┘
│  (heartbeat)    │   /heartbeat every 45s
└─────────────────┘   TTL: 60s in KV
```

### How It Works

**Phone App (Publisher):**
- Opens WebSocket to `wss://<AGORA_TOKEN_SERVER_URL>/ws/{channelId}?role=host`
- Receives real-time `viewer_count` updates when viewers join/leave
- Auto-reconnects on disconnect

**Web Viewer (Subscriber):**
- Registers via token fetch with `viewerId` parameter
- Sends heartbeat every 45s to `/heartbeat?channel=X&viewerId=Y`
- KV entry expires after 60s if no heartbeat (viewer left)
- Calls `/leave` on page unload for immediate removal

**Durable Object (ChannelRoom):**
- One instance per channel
- Tracks WebSocket connections (phone app)
- Tracks KV-based viewers (web browsers)
- Broadcasts `viewer_count` updates to all WebSocket clients

### Token Server Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /?channel=X&role=subscriber&viewerId=Y` | Get token + register viewer |
| `GET /heartbeat?channel=X&viewerId=Y` | Keep viewer alive (call every 45s) |
| `GET /leave?channel=X&viewerId=Y` | Remove viewer immediately |
| `GET /viewers?channel=X` | Get current viewer count |
| `WS /ws/{channelId}?role=host` | Real-time WebSocket for publisher |

### Future: Chat Support

The WebSocket infrastructure supports chat messages. Send:
```json
{"type": "chat", "text": "Hello!"}
```

All connected clients receive:
```json
{"type": "chat", "from": "Name", "role": "viewer", "text": "Hello!", "timestamp": 123456}
```

## Idle Channel Auto-Stop

Prevents orphaned Agora sessions from burning minutes when the host forgets to stop streaming.

### Behavior

1. Host starts streaming with **0 viewers** → 5-minute idle timer starts
2. After 5 minutes → amber warning banner appears: "Still streaming? No viewers for 5 minutes. Stream will auto-stop in 60s."
3. **Keep Streaming** → dismisses warning, restarts the 5-min timer
4. **Stop Stream** → stops the stream immediately
5. No action → stream auto-stops after the 60s countdown
6. A viewer joins at any point → all idle timers are cleared

### Constants (`useRemoteView.ts`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `IDLE_TIMEOUT_MS` | 5 min | Time with 0 viewers before warning |
| `IDLE_AUTO_STOP_S` | 60s | Countdown before auto-stop |

### Edge Cases

| Case | Handling |
|------|----------|
| Viewers: 0→1→0 | Timers clear on 0→1, fresh 5-min on 1→0 |
| Dismiss with 0 viewers | Clears timers, effect restarts 5-min timer |
| Stream stops during warning | `onStreamStopped` clears everything |
| Unmount during warning | Effect cleanup clears all timers |

### Host Disconnect Auto-Leave (Web Viewer)

When the host leaves, the web viewer starts a 30-second countdown and then auto-leaves (returns to lobby). If other remote participants are still present, the countdown is skipped. If the host rejoins before the countdown expires, the timer is cleared.

## Key Files

### Android (Publisher)

| File | Purpose |
|------|---------|
| `StreamingCameraManager.kt` | Captures camera frames using CameraX ImageAnalysis, converts YUV_420_888 to NV21 |
| `AgoraStreamManager.kt` | Manages Agora RTC engine, pushes frames, handles connection |
| `StreamQuality.kt` | Quality presets (LOW_LATENCY, BALANCED, HIGH_QUALITY) |
| `XRGlassesService.kt` | Orchestrates streaming, manages lifecycle |

### Web Viewer (Subscriber)

Separate repo: `~/coding/spex-web-viewer/` — see its own `CLAUDE.md` and `docs/architecture.md`.

| File | Purpose |
|------|---------|
| `src/viewer.ts` | Agora client, lobby, participant grid, controls, two-way media, auto-hide |
| `src/recorder.ts` | Local WebM recording with multi-track audio mixing |
| `src/transcription.ts` | Audio transcription via backend API |
| `index.html` | Viewer page: lobby screen, participant grid, modals |
| `styles.css` | Styling: Google Meet-inspired layout, grid, controls |

### Web Viewer Features

- **Lobby**: Pre-join screen with camera preview, mic/camera toggles, name entry, permission badges
- **Participant Grid**: Google Meet-style uniform grid (all tiles equal size, host top-left)
- **Two-Way Audio/Video**: Viewers can publish mic and camera back to host
- **Display Names**: Shown at bottom-left of each tile (persisted in localStorage)
- **Mute Indicators**: Mic-off icon on tiles when participant has no audio
- **Recording**: Local WebM recording of host video + mixed audio from all participants
- **Transcription**: Post-recording transcription with speaker diarization via backend API
- **Auto-Hide Controls**: Floating pill-shaped control bar fades after 3s of inactivity
- **Keyboard Shortcuts**: `m` (speaker mute), `d` (mic), `e` (camera), `f` (fullscreen)
- **Stats**: Real-time video quality and latency display (bottom-right)
- **Host Disconnect Auto-Leave**: 30s countdown when host leaves (see above)

### Token Server (Cloudflare Worker) -- Shared Infrastructure

The Agora Token Worker lives in **this repo** at `cloudflare-workers/` and is deployed to Cloudflare under Dima's account. It is **shared between this app and the EngineersGambit web integration** -- changes affect both.

| File | Purpose |
|------|---------|
| `cloudflare-workers/src/index.ts` | Token generation, viewer tracking, WebSocket handling (TypeScript) |
| `cloudflare-workers/wrangler.toml` | Worker config with Durable Objects and KV bindings |

```bash
# Deploy
cd cloudflare-workers && npm run deploy

# Secrets
npx wrangler secret put AGORA_APP_ID
npx wrangler secret put AGORA_APP_CERTIFICATE
```

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
| LOW_LATENCY | 640×480 | 10 | 300 kbps |
| BALANCED | 640×480 | 15 | 500 kbps |
| HIGH_QUALITY | 640×480 | 30 | 800 kbps |

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
SPEX_VIEWER_URL_BASE=https://your-viewer.pages.dev/view/
```

### Cloudflare Worker Secrets

```bash
wrangler secret put AGORA_APP_ID
wrangler secret put AGORA_APP_CERTIFICATE
```

## URLs

| Service | URL |
|---------|-----|
| Web Viewer | Set in `.env` as `SPEX_VIEWER_URL_BASE` + `{channelId}` |
| Token Server | Set in `.env` as `AGORA_TOKEN_SERVER_URL` |

## Audio Streaming

Audio is enabled via `engine.enableAudio()` in AgoraStreamManager. The system supports **two-way audio**:

### Two-Way Audio Architecture

```
Web Viewer (Browser)                    SPEX App (Phone/Glasses)
─────────────────────                   ────────────────────────
Mic → LocalAudioTrack → Agora Cloud → onRemoteAudioStateChanged → Speaker
                                   ↓
Speaker ← RemoteAudioTrack ← Agora Cloud ← Glasses/Phone Mic
```

### How It Works

**Phone/Glasses → Web Viewer:**
- `enableAudio()` enables the device microphone
- Audio is automatically published with the video stream
- Web viewer receives via `remoteAudioTrack.play()`

**Web Viewer → Phone/Glasses:**
- Web viewer joins as `host` role (not `audience`)
- Viewer requests `publisher` token (not `subscriber`)
- Microphone track is created and published when user unmutes
- Android receives via `onRemoteAudioStateChanged` callback
- Audio auto-plays through device speaker or Bluetooth (glasses)

### Web Viewer Configuration (Two-Way Audio)

The web viewer (`spex-web-viewer`) is configured for two-way audio:

| Setting | Value | Purpose |
|---------|-------|---------|
| Token role | `publisher` | Allows publishing audio back |
| Client role | `host` | Can send and receive media |
| Mic default | Muted | Privacy - user must click to enable |

### Browser Autoplay Handling

Browsers block audio autoplay. The web viewer:
1. Attempts to play incoming audio immediately
2. If blocked, shows "Click anywhere to enable audio" prompt
3. On first user interaction, retries playback

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
4. **Two-way audio**: Audio from web viewers plays through glasses speakers

If Bluetooth routing doesn't work on real hardware, implement external audio source/sink using ProjectedContext (similar to how camera uses `createProjectedDeviceContext()`).

## Two-Way Video

The system supports **two-way video**, allowing web viewers to share their camera back to the host.

### Two-Way Video Architecture

```
Web Viewer (Browser)                    SPEX App (Phone/Glasses)
─────────────────────                   ────────────────────────
Camera → LocalVideoTrack → Agora Cloud → onRemoteVideoStateChanged → Display
                                     ↓
Display ← RemoteVideoTrack ← Agora Cloud ← Glasses Camera
```

### How It Works

**Web Viewer → Phone/Glasses:**
- Web viewer joins as `host` role (allows publishing media)
- Camera track created with privacy-first defaults (starts disabled)
- When user clicks camera button, track is enabled and published
- Android receives via `onRemoteVideoStateChanged` callback
- `ViewerInfo.isStreaming` tracks which viewers have camera on

### Web Viewer Camera Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Resolution | 640×480 | Optimized for remote viewing |
| Frame rate | 15 fps | Balance quality/bandwidth |
| Bitrate | 200-500 kbps | Adaptive quality |
| Default state | OFF | Privacy - user must click to enable |

### Android Callbacks

The `AgoraStreamManager` tracks viewer video state via:

```kotlin
override fun onRemoteVideoStateChanged(uid: Int, state: Int, reason: Int, elapsed: Int) {
    val isStreaming = state == Constants.REMOTE_VIDEO_STATE_DECODING
    viewers[uid]?.let { viewer ->
        val updatedViewer = viewer.copy(isStreaming = isStreaming)
        viewers[uid] = updatedViewer
        onViewerUpdate(viewerCountAtomic.get(), updatedViewer)
    }
}
```

### ViewerInfo Fields

| Field | Type | Description |
|-------|------|-------------|
| `uid` | Int | Agora user ID |
| `displayName` | String? | Optional display name |
| `isSpeaking` | Boolean | True when viewer's mic is active |
| `isStreaming` | Boolean | True when viewer's camera is active |

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
