# Speech Recognition - Maintenance Guide

## Overview

Speech recognition runs **ON THE GLASSES** using Android's `SpeechRecognizer` API. This is critical for low latency - audio never leaves the glasses device.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI GLASSES (GlassesActivity)                  │
│                                                                  │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────┐   │
│  │ Microphone  │───▶│ SpeechRecognizer│───▶│ Broadcast to   │   │
│  │ (hardware)  │    │ (local ASR)     │    │ Phone process  │   │
│  └─────────────┘    └─────────────────┘    └───────┬────────┘   │
│                                                     │            │
└─────────────────────────────────────────────────────│────────────┘
                                                      │ text only
                                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PHONE (Main Process)                          │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │ GlassesBroadcast    │───▶│ XRGlassesModule                 │ │
│  │ Receiver            │    │ (emits to React Native)         │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Location | Purpose |
|------|----------|---------|
| `GlassesActivity.kt` | `:xr_process` | Creates and manages SpeechRecognizer |
| `GlassesBroadcastReceiver.kt` | Main process | Receives speech results via broadcast |
| `XRGlassesModule.kt` | Main process | Emits events to React Native |
| `useSpeechRecognition.ts` | React Native | Hook for speech state/results |

## How It Works

1. **User taps MIC button** on phone → calls `XRGlassesService.startSpeechRecognition()`
2. **Routing decision** (`XRGlassesService.kt:997`):
   - If glasses connected and not in emulation mode → glasses-side ASR
   - Otherwise → phone-side ASR directly
3. **Glasses path**: Broadcast to GlassesActivity → SpeechRecognizer on glasses → results broadcast back
4. **Phone path**: Phone's SpeechRecognizer runs directly in the main process
5. **Results** sent via broadcast: `ACTION_SPEECH_RESULT`, `ACTION_SPEECH_PARTIAL`
6. **GlassesBroadcastReceiver** receives in main process (glasses path only)
7. **XRGlassesModule** emits events to React Native
8. **useSpeechRecognition hook** updates UI

### Glasses-First Routing with Phone Fallback

When glasses are connected, `XRGlassesService` uses a **glasses-first strategy** with automatic phone fallback (`XRGlassesService.kt:1014`):

1. Sends `ACTION_START_LISTENING` broadcast to GlassesActivity
2. Starts a **5-second timeout** — if glasses don't confirm they're listening, falls back to phone ASR
3. On glasses confirmation (`handleGlassesSpeechEvent` at `:1085`), cancels the timeout
4. On non-recoverable glasses ASR error, immediately falls back to phone ASR
5. `SpeechSource` enum tracks the active source: `NONE`, `GLASSES`, or `PHONE`

## Speech Recognizer Modes

### On-Device (Preferred)
```kotlin
SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
```
- No network required
- Lower latency (~100ms)
- Requires language pack installed

### Network-Based (Fallback)
```kotlin
SpeechRecognizer.createSpeechRecognizer(context)
```
- Requires network connection
- Higher latency (~300-500ms)
- Falls back automatically if on-device fails

## Concurrent Use with Video Recording

Speech recognition runs **concurrently** with CameraX video recording in Notes mode:

- SpeechRecognizer uses `VOICE_RECOGNITION` source (higher priority)
- CameraX uses `CAMCORDER` source (lower priority)
- SpeechRecognizer gets clear mic access for real-time transcription
- No separate MediaRecorder is started during recording (it blocks SpeechRecognizer on Samsung devices)

The native `XRGlassesService.startVideoRecording()` does **NOT** stop speech recognition. The JS side (`NotesMode.tsx`) starts speech recognition after starting the video recording.

See `docs/maintenance/video-recording.md` for full details on the microphone priority system.

## Common Issues & Fixes

### Issue: Speech recognition not available

**Symptoms**: `SpeechRecognizer.isRecognitionAvailable()` returns false

**Causes**:
1. Glasses emulator doesn't have Google services
2. Language pack not installed on device

**Fix for emulator**: This is expected - use phone emulator or real glasses for testing

**Fix for real device**: Ensure Google app is installed and language pack downloaded

### Issue: Error 13 - Language pack not available

**Symptoms**: On-device ASR fails with error code 13

**Fix**: Code automatically falls back to network-based recognition:
```kotlin
if (isLanguagePackError && !useNetworkRecognizer) {
    useNetworkRecognizer = true
    speechRecognizer?.destroy()
    initSpeechRecognizer()  // Reinit with network
}
```

### Issue: Speech results not reaching React Native

**Symptoms**: GlassesActivity logs show results but RN doesn't receive them

**Causes**:
1. Broadcast not crossing process boundary
2. GlassesBroadcastReceiver not registered

**Fix**: Ensure broadcasts use `setPackage(packageName)`:
```kotlin
val intent = Intent(ACTION_SPEECH_RESULT).apply {
    putExtra(EXTRA_TEXT, text)
    setPackage(packageName)  // Required!
}
sendBroadcast(intent)
```

### Issue: Microphone permission denied

**Symptoms**: Error "Microphone permission required"

**Fix**:
1. GlassesActivity uses `ProjectedPermissionsResultContract` to request permissions
2. Permission dialog appears on PHONE (not glasses)
3. User must grant permission on phone

## Broadcast Actions

| Action | Data | Purpose |
|--------|------|---------|
| `SPEECH_RESULT` | `text`, `confidence` | Final transcription |
| `SPEECH_PARTIAL` | `text` | Interim transcription |
| `SPEECH_ERROR` | `error_code`, `error_message` | Recognition errors |
| `SPEECH_STATE` | `is_listening` | Listening state changes |

## Testing Checklist

- [ ] Tap MIC → "Listening..." appears on glasses
- [ ] Speak → partial results show in real-time
- [ ] Stop speaking → final result appears
- [ ] Result reaches phone UI
- [ ] Error handling works (no crash on network error)
- [ ] Continuous mode restarts after each result

## Emulator Limitations

| Environment | On-Device ASR | Network ASR |
|-------------|---------------|-------------|
| Glasses emulator | ❌ No | ❌ No |
| Phone emulator | ❌ No | ✅ Yes (needs Google app) |
| Real glasses | ✅ Yes | ✅ Yes |
| Real phone | ✅ Yes | ✅ Yes |

**Note**: For full testing, use real glasses hardware or test network ASR on phone emulator.
