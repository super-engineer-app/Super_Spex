# Video Recording System

## Overview

The video recording system captures video from the phone or glasses camera with real-time on-device speech transcription. CameraX records video with audio enabled (CAMCORDER source), while Android's SpeechRecognizer runs concurrently for live transcription using the higher-priority VOICE_RECOGNITION source.

## Architecture

```
React Native (useVideoRecording.ts + NotesMode.tsx)
  │
  ├─ startRecording(source) ──► XRGlassesModule ──► VideoRecordingManager.kt
  │                                                    └─ CameraX VideoCapture (MP4 video+audio)
  │
  ├─ speech.startListening() ──► SpeechRecognizer (VOICE_RECOGNITION source)
  │                               └─ Real-time on-device ASR → partial/final transcripts
  │
  ├─ stopRecording() ──► stops CameraX recording
  │
  └─ saveVideo() / downloadTranscript() ──► expo-sharing (Android share sheet)
```

### Microphone Priority System

CameraX and SpeechRecognizer both access the microphone simultaneously:

| Consumer | Audio Source | Priority | Gets clear audio? |
|----------|-------------|----------|-------------------|
| SpeechRecognizer | VOICE_RECOGNITION | Higher | Yes — real-time transcription works |
| CameraX VideoCapture | CAMCORDER | Lower | Device-dependent (may be degraded) |

On some devices (e.g. Samsung), the higher-priority consumer gets clear audio while the lower-priority one may receive degraded/silent audio. The video file always has a valid audio track container regardless.

**Important**: No separate MediaRecorder is started during recording. On tested Samsung devices, MediaRecorder blocks SpeechRecognizer from accessing the mic entirely, preventing real-time transcription. CameraX's CAMCORDER source (lower priority) does not block SpeechRecognizer.

## Native Layer: VideoRecordingManager.kt

**Location:** `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/VideoRecordingManager.kt`

### State Machine

Recording follows a strict state machine to prevent race conditions:

```
IDLE → PREPARING → RECORDING → STOPPING → STOPPED → IDLE
```

Only one recording can be active at a time. `startRecording()` guards against non-IDLE state.

### Recording System

CameraX VideoCapture records video with audio enabled:
- Built via `buildVideoCapture()` with HD quality selector
- Bound to camera lifecycle via CameraX `ProcessCameraProvider`
- Output: `spex-recording-{timestamp}.mp4` in app cache dir
- Audio enabled via `withAudioEnabled()` (CAMCORDER source)

A separate `startAudioRecording()` method exists for WebM/Opus audio-only recording (used by server-side transcription), but it is **not called during video recording** to avoid blocking SpeechRecognizer.

### Lifecycle Methods

| Method | Description |
|--------|-------------|
| `buildVideoCapture()` | Creates the CameraX VideoCapture use case with HD quality |
| `startRecording()` | Starts CameraX video+audio recording, emits `RecordingEvent.Started` |
| `stopRecording()` | Stops CameraX recording. Triggers finalize event |
| `dismiss()` | Stops recording, deletes temp files, resets state to IDLE |
| `release()` | Full resource cleanup on destruction |

### Events Emitted to React Native

| Event | Data | When |
|-------|------|------|
| `RecordingEvent.Started` | — | CameraX recording confirmed active |
| `RecordingEvent.Finalize` | `{duration, videoUri}` | Recording fully stopped and file ready |
| `RecordingEvent.Status` | `{durationMs}` | Periodic status during recording |
| `RecordingEvent.Pause/Resume` | — | Logged but not actively used |

### Mutual Exclusion

Recording is mutually exclusive with:
- **Streaming** (Agora RTC) - Camera can only be bound to one use case
- **Tagging** (image capture) - Both compete for camera resources

Speech recognition is **NOT stopped** during recording — it runs concurrently for real-time transcription.

## React Native Layer: useVideoRecording.ts

**Location:** `src/hooks/useVideoRecording.ts`

### State

| Field | Type | Description |
|-------|------|-------------|
| `recordingState` | `'idle' \| 'recording' \| 'stopping' \| 'stopped'` | Current recording state from native events |
| `transcriptionState` | `'idle' \| 'loading' \| 'done' \| 'error'` | Transcription processing state |
| `transcriptionResult` | `TranscriptionResult \| null` | Parsed diarized segments (server-side) |
| `cameraSource` | `'phone' \| 'glasses'` | Which camera to record from (defaults to `'glasses'`) |
| `duration` | `number` | Recording duration in seconds (JS timer, ticks every 500ms) |

### Key Functions

- **`startRecording()`** - Calls native `startVideoRecording(cameraSource)`, starts JS duration timer
- **`stopRecording()`** - Calls native `stopVideoRecording()`, stops JS timer
- **`transcribe(language)`** - Calls native `sendRecordingForTranscription(language)`, validates response with `isValidTranscriptionResult()`. Requires a separate audio file (WebM/Opus) to be recorded.
- **`saveVideo()`** - Gets file path from native, shares via `expo-sharing`
- **`downloadTranscript()`** - Formats segments as text, writes to temp file via `expo-file-system/next`, shares via Android share sheet (falls back to clipboard)
- **`dismiss()`** - Calls native `dismissRecording()`, resets all state

### Native Event Subscriptions

- `onRecordingStateChanged` - Updates `recordingState` and `duration` from native
- `onRecordingError` - Logs error and resets state to idle

## Real-Time Transcription (NotesMode.tsx)

**Location:** `src/components/modes/NotesMode.tsx`

The Notes mode video tab provides real-time on-device transcription during recording:

```
1. User taps "Record note"
   ├─ startRecording() → CameraX begins (video+audio, CAMCORDER source)
   └─ speech.startListening(true) → SpeechRecognizer begins (VOICE_RECOGNITION, higher priority)

2. During recording
   └─ speech.partialTranscript / speech.transcript updates in real-time
   └─ useEffect populates videoNoteText with live transcript
   └─ isVideoSession flag gates the effect (not speech.isListening, which can be stale)

3. User taps "Stop"
   ├─ stopRecording() → CameraX stops
   └─ speech.stopListening() → SpeechRecognizer stops
   └─ videoNoteText already contains the transcription

4. User taps "Save"
   └─ saveVideo() → shares the MP4 file via Android share sheet
```

### Key Design Decisions

- **`isVideoSession` state** replaces `speech.isListening` for guarding effects, because native speech events can arrive after `stopListening()` leaving `speech.isListening` stale
- **`photoTranscriptBaseRef`** breaks the infinite re-render loop in photo mode (reading and writing `taggingTranscript` in the same effect dependency array)
- **No server-side auto-transcribe** during video recording — on-device ASR provides the transcript in real-time

## Server-Side Transcription (Optional)

Server-side transcription via `/transcribe-dia` is available but requires a separate WebM/Opus audio file. This is used:
- By the `transcribe()` function in `useVideoRecording`
- When a separate audio recording has been made (e.g. via `startAudioRecording()`)

The flow when available:
```
1. Audio file (WebM/Opus) sent via native POST /transcribe-dia
2. SSE response with diarized segments:
   { "speaker": "Speaker 1", "text": "...", "start": 0.0, "end": 2.5 }
3. Result validated and stored as transcriptionResult
```

### Transcription Types

Defined at `src/services/transcriptionApi.ts:8–18` — `TranscriptionSegment` (speaker, text, start, end) and `TranscriptionResult` (segments array).

## Web Platform Differences

On web, video recording uses a single `MediaRecorder` (no CameraX) that captures video+audio as WebM directly. No separate audio-only track is needed since the web MediaRecorder output can be sent to `/transcribe-dia` as-is.

- Recording setup: `modules/xr-glasses/src/XRGlassesModule.web.ts:797`
- Codec negotiation (prefers vp9, falls back to vp8/webm): `:805–815`
- Transcription submission: `:892` (FormData with Blob, not file URI)
- File saving: triggers browser download via `formDataHelper.web.ts:21`

## Known Limitations

1. **Device-dependent audio quality**: On Samsung devices, CameraX's audio track may be silent/degraded when SpeechRecognizer has priority. The video file still has a valid audio container.

2. **No concurrent MediaRecorder + SpeechRecognizer**: On tested Samsung devices, MediaRecorder (any AudioSource) blocks SpeechRecognizer from accessing the mic entirely. This is why no separate MediaRecorder runs during video recording.

3. **Camera exclusivity**: CameraX can only bind one recording use case at a time. Recording, streaming, and tagging are mutually exclusive.

4. **Emulator limitations**: Video recording works in emulator but audio quality may differ from real hardware.

5. **File cleanup**: Temp files are cleaned up on `dismiss()` but may persist if the app crashes during recording. Files are stored in the app cache directory which the OS can clean.

6. **Duration tracking**: Duration is tracked by a JS timer (500ms interval) rather than from the native recorder, so it may drift slightly from actual recording duration. The native `RecordingEvent.Finalize` provides the accurate duration.

## File Locations

| File | Purpose |
|------|---------|
| `modules/xr-glasses/android/.../VideoRecordingManager.kt` | Native recording logic |
| `modules/xr-glasses/android/.../XRGlassesService.kt` | Service layer: starts/stops recording + speech |
| `src/hooks/useVideoRecording.ts` | React hook for recording lifecycle |
| `src/components/modes/NotesMode.tsx` | UI: video/photo notes with real-time transcription |
| `src/services/transcriptionApi.ts` | Types, validation, and formatting for transcription results |
