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
│  ┌──────────────────┐                                            │
│  │ ProjectedContext │ (Glasses camera access)                    │
│  └──────────────────┘                                            │
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
SPEX_VIEWER_URL_BASE=https://spex-viewer.pages.dev/view/
```

### Cloudflare Worker Secrets

```bash
wrangler secret put AGORA_APP_ID
wrangler secret put AGORA_APP_CERTIFICATE
```

## URLs

| Service | URL |
|---------|-----|
| Web Viewer | https://spex-viewer.pages.dev/view/{channelId} |
| Token Server | https://agora-token.spex-remote.workers.dev/ |

## Logs to Monitor

```bash
# Android streaming logs
adb logcat | grep -iE "StreamingCameraManager|AgoraStreamManager|XRGlassesService"

# Watch frame push rate
adb logcat | grep "Streaming:"
```

## Common Fixes

| Issue | Fix |
|-------|-----|
| Grey video | Switch to NV21 format, check YUV conversion |
| Video not visible | Add `!important` CSS overrides for video element |
| Token errors | Verify Cloudflare Worker secrets |
| No camera frames | Check ProjectedContext and camera permissions |
| High latency | Use LOW_LATENCY quality preset |
