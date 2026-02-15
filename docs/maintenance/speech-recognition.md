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
│  ┌─────────────────────┐    ┌──────────────────┐                │
│  │ GlassesBroadcast    │───▶│ XRGlassesService │                │
│  │ Receiver            │    │ (routes errors,  │                │
│  │ (results→JS,        │    │  decides fallback)│                │
│  │  errors→service)    │    └────────┬─────────┘                │
│  └─────────────────────┘             │                          │
│                                      ▼                          │
│  ┌─────────────────────┐    ┌──────────────────┐                │
│  │ On-device ASR       │ OR │ NetworkSpeech    │                │
│  │ (SpeechRecognizer)  │    │ Recognizer       │                │
│  │                     │    │ (HTTP /transcribe │                │
│  │                     │    │  -dia backend)   │                │
│  └─────────────────────┘    └──────────────────┘                │
│                                      │                          │
│                    ┌─────────────────┘                          │
│                    ▼                                            │
│           ┌──────────────────┐                                  │
│           │ XRGlassesModule  │                                  │
│           │ (emits to RN)    │                                  │
│           └──────────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Location | Purpose |
|------|----------|---------|
| `GlassesActivity.kt` | `:xr_process` | Creates and manages SpeechRecognizer |
| `GlassesBroadcastReceiver.kt` | Main process | Receives speech results via broadcast; routes errors through service |
| `XRGlassesModule.kt` | Main process | Emits events to React Native |
| `NetworkSpeechRecognizer.kt` | Main process | Backend HTTP fallback — records 3s audio chunks, POSTs to `/transcribe-dia` |
| `useSpeechRecognition.ts` | React Native | Hook for speech state/results |
| `DashboardContext.tsx` | React Native | Provides shared speech instance, clears transcript on mode switch |

## How It Works

1. **User taps MIC button** on phone → calls `XRGlassesService.startSpeechRecognition()`
2. **Routing decision** (`XRGlassesService.kt:1011`):
   - If glasses connected and not in emulation mode → glasses-side ASR
   - Otherwise → phone-side ASR directly
3. **Glasses path**: Broadcast to GlassesActivity → SpeechRecognizer on glasses → results broadcast back
4. **Phone path**: Phone's SpeechRecognizer runs directly in the main process
5. **Results** sent via broadcast: `ACTION_SPEECH_RESULT`, `ACTION_SPEECH_PARTIAL`
6. **GlassesBroadcastReceiver** receives in main process (glasses path only)
7. **XRGlassesModule** emits events to React Native
8. **useSpeechRecognition hook** updates UI

### Glasses-First Routing with Phone Fallback

When glasses are connected, `XRGlassesService` uses a **glasses-first strategy** with automatic phone fallback (`XRGlassesService.kt:1028`):

1. Sends `ACTION_START_LISTENING` broadcast to GlassesActivity
2. Starts a **5-second timeout** — if glasses don't confirm they're listening, falls back to phone ASR
3. On glasses confirmation (`handleGlassesSpeechEvent` at `:1106`), cancels the timeout
4. On non-recoverable glasses ASR error, immediately falls back to phone ASR
5. `SpeechSource` enum tracks the active source: `NONE`, `GLASSES`, or `PHONE`

## Speech Recognizer Fallback Chain

Two-tier fallback, fully transparent to the user (no errors shown during transitions):

### Tier 1: On-Device ASR (Preferred)
```kotlin
SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
```
- No network required
- Lower latency (~100ms)
- Requires language pack installed

### Tier 2: Backend HTTP Transcription (Fallback)
```kotlin
NetworkSpeechRecognizer(context, module)
```
- Records 3-second audio chunks as WebM/Opus via MediaRecorder
- POSTs each chunk to `TRANSCRIPTION_API_URL/transcribe-dia`
- Parses response: `{ "segments": [{ "text": "..." }] }`
- Continuous mode: starts next chunk while HTTP request is in flight
- Requires `TRANSCRIPTION_API_URL` set in `.env` (baked into APK at build time via BuildConfig)
- Requires `RECORD_AUDIO` permission

### Silent Fallback Logic

The fallback is designed to be invisible to the user:

- **`onDeviceEverReady` flag**: tracks whether on-device ASR ever fired `onReadyForSpeech`. If it hasn't (e.g. emulator), ANY error silently switches to backend — no error shown to the user.
- **Glasses error routing**: `GlassesBroadcastReceiver` sends speech errors ONLY to the service (not directly to JS). The service decides whether to forward or suppress. Non-recoverable errors trigger silent fallback; only recoverable errors (like "no speech detected") reach JS.
- **Stale error guard**: once `usingNetworkFallback` is true, all errors from the destroyed Android SpeechRecognizer are silently ignored.

**Note**: Google's network-based `SpeechRecognizer.createSpeechRecognizer()` was removed from the fallback chain because it added an unreliable middle step that still failed on emulators and caused error spam.

## Concurrent Use with Video Recording

Speech recognition runs **concurrently** with CameraX video recording in Notes mode:

- SpeechRecognizer uses `VOICE_RECOGNITION` source (higher priority)
- CameraX uses `CAMCORDER` source (lower priority)
- SpeechRecognizer gets clear mic access for real-time transcription
- No separate MediaRecorder is started during recording (it blocks SpeechRecognizer on Samsung devices)

The native `XRGlassesService.startVideoRecording()` does **NOT** stop speech recognition. The JS side (`NotesMode.tsx`) starts speech recognition after starting the video recording.

See `docs/maintenance/video-recording.md` for full details on the microphone priority system.

## useSpeechRecognition Hook Internals

**Location:** `src/hooks/useSpeechRecognition.ts`

The hook uses an `accumulatedTranscriptRef` to concatenate all final results within a single session:

- **`startListening()`** resets `accumulatedTranscriptRef` to `""` — each new session starts fresh
- **`onSpeechResult`** appends new text to the ref, then sets `transcript` to the full accumulated string
- **`onPartialResult`** combines accumulated text + current partial into `partialTranscript`
- **`clearTranscript()`** resets both the ref and all state

**Key implication:** Since `startListening()` clears accumulated results, modes that need to preserve text across recording sessions (stop → re-record) must save the current text themselves *before* calling `startListening()`. This is why:
- HelpMode uses `questionBaseRef` (saves `questionText` before each session)
- NotesMode photo tab uses `photoTranscriptBaseRef` (saves `taggingTranscript` before each session)

## Mode & Tab Isolation

Speech recognition state is shared via a single `useSpeechRecognition()` instance in `DashboardContext`. To prevent cross-contamination, two isolation mechanisms are in place:

### Cross-Mode Isolation (Help Mode vs Notes Mode)

`DashboardContext.setMode()` calls `speech.clearTranscript()` on every mode switch. Additionally, each mode's speech effects are gated on `activeMode`:
- HelpMode effects: `if (activeMode !== "help") return`
- NotesMode effects: `if (activeMode !== "notes") return`

HelpMode also uses a `questionBaseRef` to preserve text across recording sessions — only the "Reset" button clears it.

### Cross-Tab Isolation (Video Notes vs Photo Notes)

Within Notes mode, the video and photo tabs each have session flags that prevent speech from one tab leaking into the other:

| Tab | Session flag | What it gates |
|-----|-------------|---------------|
| Video | `isVideoSession` | Live transcription → `videoNoteText` |
| Photo | `isPhotoAudioRecording` | Final results → `editTranscript()`, partial results → `editTranscript()` |

**Rule**: Every speech effect in NotesMode must be gated on the session flag of the tab that started the recording. Without this, switching tabs mid-recording causes the new tab to pick up the other tab's transcript.

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

**Fix**: Code automatically falls back to backend HTTP transcription. Since `onDeviceEverReady` is false (ASR never started successfully), the error is suppressed and `switchToNetworkFallback()` activates the `NetworkSpeechRecognizer`.

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
- [ ] Help Mode: stop + re-record appends to existing text (doesn't clear)
- [ ] Help Mode: "Reset" clears all text
- [ ] Mode switch clears transcript (Help → Notes and back)
- [ ] Video tab transcription does NOT appear in Photo tab
- [ ] Photo tab transcription does NOT appear in Video tab
- [ ] Switching tabs mid-recording doesn't leak transcript

## Emulator Limitations

| Environment | On-Device ASR | Backend HTTP Fallback |
|-------------|---------------|----------------------|
| Glasses emulator | ❌ No | N/A (falls back to phone) |
| Phone emulator | ❌ No | ✅ Yes (needs `TRANSCRIPTION_API_URL` in `.env`) |
| Real glasses | ✅ Yes | N/A (falls back to phone if fails) |
| Real phone | ✅ Yes | ✅ Yes (automatic if on-device fails) |

**Note**: On emulators, the fallback chain is fully automatic and silent. On-device ASR fails immediately, and `NetworkSpeechRecognizer` takes over transparently. Ensure `TRANSCRIPTION_API_URL` is set in `.env` before building the APK.
