# Video Recording System

## Overview

The video recording system captures video from the phone or glasses camera with separate audio recording for transcription. It uses CameraX VideoCapture for video and MediaRecorder for a parallel audio-only track.

## Architecture

```
React Native (useVideoRecording.ts)
  │
  ├─ startRecording(source) ──► XRGlassesModule ──► VideoRecordingManager.kt
  │                                                    ├─ CameraX VideoCapture (MP4 video+audio)
  │                                                    └─ MediaRecorder (WebM/Opus audio-only)
  │
  ├─ stopRecording() ──► stops audio first, then video
  │
  ├─ transcribe(language) ──► native bridge ──► POST /transcribe-dia
  │                                              └─ SSE response ──► diarized segments
  │
  └─ saveVideo() / downloadTranscript() ──► expo-sharing (Android share sheet)
```

## Native Layer: VideoRecordingManager.kt

**Location:** `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/VideoRecordingManager.kt`

### State Machine

Recording follows a strict state machine to prevent race conditions:

```
IDLE → PREPARING → RECORDING → STOPPING → STOPPED → IDLE
```

Only one recording can be active at a time. `startRecording()` guards against non-IDLE state.

### Dual Recording System

Two independent recordings run simultaneously:

1. **CameraX VideoCapture** - Produces MP4 with video and audio
   - Built via `buildVideoCapture()` with HD quality selector
   - Bound to camera lifecycle via CameraX `ProcessCameraProvider`
   - Output: `spex-recording-{timestamp}.mp4` in app cache dir

2. **MediaRecorder** - Produces WebM/Opus audio-only
   - Required because the transcription backend expects an audio file, not video
   - Output format: WebM container with Opus codec
   - Output: `spex-audio-{timestamp}.webm` in app cache dir
   - Started after CameraX recording begins, stopped before CameraX stops

### Lifecycle Methods

| Method | Description |
|--------|-------------|
| `buildVideoCapture()` | Creates the CameraX VideoCapture use case with HD quality |
| `startRecording()` | Starts both video and audio recording, emits `RecordingEvent.Started` |
| `stopRecording()` | Stops audio (MediaRecorder) first, then video (CameraX). Triggers finalize event |
| `dismiss()` | Stops recording, deletes temp files, resets state to IDLE |
| `release()` | Full resource cleanup on destruction |

### Events Emitted to React Native

| Event | Data | When |
|-------|------|------|
| `RecordingEvent.Started` | — | Both recorders confirmed active |
| `RecordingEvent.Finalize` | `{duration, videoUri, audioUri}` | Recording fully stopped and files ready |
| `RecordingEvent.Status` | `{durationMs}` | Periodic status during recording |
| `RecordingEvent.Pause/Resume` | — | Logged but not actively used |

### Mutual Exclusion

Recording is mutually exclusive with:
- **Streaming** (Agora RTC) - Camera can only be bound to one use case
- **Tagging** (image capture) - Both compete for camera resources

The React Native layer (`app/glasses/index.tsx`) enforces this by checking recording/streaming/tagging state before allowing operations.

## React Native Layer: useVideoRecording.ts

**Location:** `src/hooks/useVideoRecording.ts`

### State

| Field | Type | Description |
|-------|------|-------------|
| `recordingState` | `'idle' \| 'recording'` | Current recording state from native events |
| `transcriptionState` | `'idle' \| 'loading' \| 'done' \| 'error'` | Transcription processing state |
| `transcriptionResult` | `TranscriptionResult \| null` | Parsed diarized segments |
| `cameraSource` | `'phone' \| 'glasses'` | Which camera to record from |
| `duration` | `number` | Recording duration in seconds (JS timer, ticks every 500ms) |

### Key Functions

- **`startRecording()`** - Calls native `startVideoRecording(cameraSource)`, starts JS duration timer
- **`stopRecording()`** - Calls native `stopVideoRecording()`, stops JS timer
- **`transcribe(language)`** - Calls native `sendRecordingForTranscription(language)`, validates response with `isValidTranscriptionResult()`
- **`saveVideo()`** - Gets file path from native, shares via `expo-sharing`
- **`downloadTranscript()`** - Formats segments as text, writes to temp file via `expo-file-system/next`, shares via Android share sheet (falls back to clipboard)
- **`dismiss()`** - Calls native `dismissRecording()`, resets all state

### Native Event Subscriptions

- `onRecordingStateChanged` - Updates `recordingState` and `duration` from native
- `onRecordingError` - Logs error and resets state to idle

## Transcription Flow

The full transcription pipeline after a recording is stopped:

```
1. User taps "Stop Recording"
   └─ stopRecording() → native stopVideoRecording()
      └─ MediaRecorder stops (audio file ready)
      └─ CameraX stops (video file ready)
      └─ Native emits RecordingEvent.Finalize with file URIs

2. User taps "Transcribe"
   └─ transcribe(language) → native sendRecordingForTranscription(language)
      └─ Native reads audio file (WebM/Opus)
      └─ POST multipart to /transcribe-dia endpoint
         ├─ Body: audio file + language param
         └─ Response: SSE stream

3. SSE Response Parsing (native side)
   └─ Each "data:" line contains JSON:
      { "speaker": "Speaker 1", "text": "...", "start": 0.0, "end": 2.5 }
   └─ Collected into TranscriptionResponse

4. Result returned to React Native
   └─ isValidTranscriptionResult() validates structure
   └─ Stored as transcriptionResult with typed segments

5. User can view/export
   └─ downloadTranscript() formats as:
      [00:00 - 00:02] Speaker 1: Hello world
      [00:03 - 00:05] Speaker 2: Hi there
   └─ Shared via Android share sheet or clipboard
```

### Transcription Types

Defined in `src/services/transcriptionApi.ts`:

```typescript
interface TranscriptionSegment {
  speaker: string;  // e.g., "Speaker 1"
  text: string;     // Transcribed text
  start: number;    // Start time in seconds
  end: number;      // End time in seconds
}

interface TranscriptionResult {
  segments: TranscriptionSegment[];
}
```

### Runtime Validation

`isValidTranscriptionResult()` is a type guard that checks:
- `data.segments` is an array
- Each segment has `speaker` (string), `text` (string), `start` (number), `end` (number)

This prevents runtime crashes from malformed backend responses.

## Known Limitations

1. **Audio format constraint**: The transcription backend requires WebM/Opus audio. This is why we run a separate MediaRecorder alongside CameraX - extracting audio from MP4 would add complexity.

2. **Camera exclusivity**: CameraX can only bind one recording use case at a time. Recording, streaming, and tagging are mutually exclusive.

3. **Emulator limitations**: Video recording works in emulator but audio quality may differ from real hardware.

4. **File cleanup**: Temp files are cleaned up on `dismiss()` but may persist if the app crashes during recording. Files are stored in the app cache directory which the OS can clean.

5. **Duration tracking**: Duration is tracked by a JS timer (500ms interval) rather than from the native recorder, so it may drift slightly from actual recording duration. The native `RecordingEvent.Finalize` provides the accurate duration.

## File Locations

| File | Purpose |
|------|---------|
| `modules/xr-glasses/android/.../VideoRecordingManager.kt` | Native recording logic |
| `src/hooks/useVideoRecording.ts` | React hook for recording lifecycle |
| `src/services/transcriptionApi.ts` | Types, validation, and formatting for transcription results |
