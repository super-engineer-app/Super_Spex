# Maintenance Documentation

This folder contains troubleshooting guides and maintenance documentation for each module/feature of the XR Glasses app.

## Quick Links

| Document | Description | When to Read |
|----------|-------------|--------------|
| [xr-glasses-projection.md](xr-glasses-projection.md) | **CRITICAL** - How projection works with separate process | Phone UI broken after connecting |
| [speech-recognition.md](speech-recognition.md) | Speech recognition architecture & troubleshooting | Speech not working |
| [camera-capture.md](camera-capture.md) | Camera capture system & issues | Camera not capturing |
| [remote-view-streaming.md](remote-view-streaming.md) | Remote View (Agora) streaming & troubleshooting | Video streaming grey/black |
| [video-recording.md](video-recording.md) | Video recording + transcription pipeline | Recording or transcription issues |
| [tagging-system.md](tagging-system.md) | Voice-activated tagging with GPS & images | Tagging workflow issues |
| [web-platform.md](web-platform.md) | Web platform — browser APIs, `.web.ts` files, responsive layout | Web version issues |
| [emulator-testing.md](emulator-testing.md) | Emulator setup, pairing, known issues | Emulator problems |
| [build-deploy.md](build-deploy.md) | Build process, installation, dependencies | Build failing |

## Critical Knowledge

### The Most Important Thing to Know

**XR activities MUST run in a separate Android process** (`:xr_process`). Without this, the Android XR SDK corrupts React Native's rendering.

```xml
<!-- In AndroidManifest.xml -->
<activity android:name=".ProjectionLauncherActivity" android:process=":xr_process" ... />
<activity android:name=".glasses.GlassesActivity" android:process=":xr_process" ... />
```

See [xr-glasses-projection.md](xr-glasses-projection.md) for full details.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                             │
│  React Native App + XRGlassesModule + XRGlassesService      │
│  (Phone UI - must stay isolated from XR SDK)                │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Intent (IPC)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    :xr_process (SEPARATE)                    │
│  ProjectionLauncherActivity + GlassesActivity               │
│  (All XR SDK calls happen here)                             │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting Quick Reference

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Phone UI text missing | XR process isolation broken | Check `android:process=":xr_process"` in manifest |
| Glasses not projecting | Display not woken | Press glasses button in emulator |
| Speech not working | Emulator limitation | Use real glasses or phone emulator |
| Camera stopped working | Emulator resource leak | Restart phone emulator |
| Remote view grey/black | CSS issue or wrong format | Use NV21 format, check video CSS |
| Connect fails | Pairing lost | Re-pair in Glasses companion app |
| Build fails | Stale cache | Run `./gradlew clean` |
| Glasses show UI after disconnect | Close broadcast not received | Check `CLOSE_GLASSES` broadcast in GlassesActivity |
| UI corrupted on first cold start | XR permission overlay | `onUiRefreshNeeded` event triggers re-render (deferred during active operations) |
| Transcription "Missing channel parameter" | Request sent to Cloudflare Worker instead of backend | Set `TRANSCRIPTION_API_URL` in `.env` (emulator: `http://10.0.2.2:8000`) |
| Save Transcript fails | `expo-file-system` v19 deprecated old API | Use `File`/`Paths` from `expo-file-system/next` |
| Recording killed by UI refresh | `onUiRefreshNeeded` fires during recording | Refresh is auto-deferred while recording/streaming/tagging is active |
| Web: speech "not available" | Firefox lacks Web Speech API | Network fallback activates; set `EXPO_PUBLIC_BACKEND_URL` |
| Web: white screen | React version mismatch | `react` + `react-dom` must be 19.1.0 (match `react-native` 0.81.5) |
| Web: `.web.ts` not picked up | `"main"` field has file extension | Use `"main": "index"` (no `.ts`) in module `package.json` |
| Web: camera black | Browser blocked getUserMedia | Check permissions; use HTTPS or localhost |

## Adding New Maintenance Docs

When adding a new feature or module, create a maintenance doc with:

1. **Overview** - What the feature does
2. **Architecture** - How it works (diagram if complex)
3. **Key Files** - Where the code lives
4. **Common Issues & Fixes** - Troubleshooting guide
5. **Testing Checklist** - How to verify it works

Use the existing docs as templates.
