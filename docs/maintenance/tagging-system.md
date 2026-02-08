# Tagging System

## Overview

The tagging system allows users to create tagged notes with text and images. It supports voice-activated start/stop keywords, multi-source image capture (glasses camera, phone camera, photo gallery), and GPS coordinates attached to each image.

## Architecture

```
Voice Input (speech recognition)
  │
  ├─ Start keyword detected ("note", "tag")
  │   └─ useTaggingSession.startTagging()
  │
  ├─ Transcript accumulation (speech-to-text)
  │   └─ addTranscript() appends text
  │
  ├─ Image capture (any source)
  │   ├─ captureFromGlasses() → useGlassesCamera hook
  │   ├─ captureFromPhone() → expo-image-picker camera
  │   └─ captureFromGallery() → expo-image-picker library
  │   Each image → createTaggedImage() → GPS + timestamp + base64
  │
  ├─ End keyword detected ("done", "save")
  │   └─ pendingSaveRef triggers saveTaggingSessionInternal()
  │
  └─ Backend submission
      └─ POST /tagging-sessions (multipart form-data)
          └─ SSE response with status updates
```

## React Native Layer: useTaggingSession.ts

**Location:** `src/hooks/useTaggingSession.ts`

### Voice-Activated Keywords

Speech results from the XR glasses speech recognizer are processed through `processSpeechResult()`:

**Start keywords** (case-insensitive, detected anywhere in transcript):
- "note", "tag" (and variations)
- Detected by `detectTaggingStartKeyword()`
- The keyword itself is removed from the transcript via `removeStartKeyword()`
- Transitions state to active tagging session

**End keywords** (case-insensitive, detected anywhere in transcript):
- "done", "save" (and variations)
- Detected by `detectTaggingEndKeyword()`
- The keyword is removed from transcript via `removeEndKeyword()`
- Sets `pendingSaveRef.current = true` to trigger async save

### Session Lifecycle

| Function | Description |
|----------|-------------|
| `startTagging()` | Clears previous state, initializes empty session |
| `addTranscript(text)` | Appends speech text to `taggingTranscript` |
| `editTranscript(text)` | Replaces transcript entirely (manual edit mode) |
| `captureFromGlasses()` | Captures image from glasses camera via native module |
| `captureFromPhone()` | Opens phone camera via `ImagePicker.launchCameraAsync()` |
| `captureFromGallery()` | Opens gallery picker, supports multi-select (up to 10) |
| `saveTaggingSession()` | Submits to backend, fires status callbacks |
| `cancelTagging()` | Discards session, releases glasses camera |

### Multi-Source Image Capture

All image sources produce `TaggedImage` objects (defined at `src/types/tagging.ts:12`).

**Glasses camera:**
- Uses `useGlassesCamera()` hook
- Camera initialized on demand (first glasses capture in session)
- Camera released on session cancel/complete
- Image returned as base64 from native event

**Phone camera:**
- Uses `expo-image-picker` with `launchCameraAsync()`
- Requests camera permission first via `requestCameraPermissionsAsync()`
- Returns base64 with quality 0.7 compression

**Gallery:**
- Uses `expo-image-picker` with `launchImageLibraryAsync()`
- Supports `allowsMultipleSelection` (up to 10 images)
- Returns base64 for each selected image

### GPS Tagging

Each image gets GPS coordinates instantly via `createTaggedImageSync()` (`src/services/taggingApi.ts:375`):

1. On app launch, `prefetchLocation()` caches GPS coords with a 5-minute TTL (`taggingApi.ts:294`)
2. `getCachedLocation()` provides instant retrieval — no async wait (`taggingApi.ts:344`)
3. `refreshLocationCache()` runs in background if cache is stale (>1 min) (`taggingApi.ts:352`)
4. Falls back to `{lat: 0, long: 0}` if permission denied or location unavailable

The older async `createTaggedImage()` (`taggingApi.ts:399`) is deprecated — `createTaggedImageSync()` is used for responsive captures.

### Async Save Pattern

The save flow uses refs to avoid stale closure bugs:

1. End keyword detected → `pendingSaveRef.current = true`
2. `useEffect` watches `taggingTranscript` and `isTaggingActive`
3. When pending flag is set and state is updated, calls `saveTaggingSessionInternal()`
4. This ensures the save captures the final transcript state, not a stale closure value

### State

| Field | Type | Description |
|-------|------|-------------|
| `isTaggingActive` | `boolean` | Whether a tagging session is in progress |
| `taggingTranscript` | `string` | Accumulated text for the session |
| `taggingImages` | `TaggedImage[]` | Collected images with metadata |
| `isSaving` | `boolean` | Whether backend submission is in progress |
| `error` | `string \| null` | Error message from last operation |
| `statusMessage` | `string \| null` | Status updates from SSE response |

## Backend Layer: taggingApi.ts

**Location:** `src/services/taggingApi.ts`

### Endpoint

```
POST {BACKEND_URL}/tagging-sessions
Content-Type: multipart/form-data
```

**Base URL:** `process.env.EXPO_PUBLIC_TAGGING_API_URL || 'http://10.0.2.2:8000'`

### Request Format (multipart form-data)

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | number | User ID (currently hardcoded dev value) |
| `org_id` | number | Organization ID (currently hardcoded dev value) |
| `transcript` | string | Trimmed transcript text |
| `local_date` | string | Date in YYYY-MM-DD format |
| `coordinates` | string | JSON stringified array of `{lat, long}` |
| `images` | file[] | Image files via React Native FormData pattern |

Images are attached using the platform-specific FormData convention — see `src/services/taggingApi.ts:173` (native) and `src/utils/formDataHelper.web.ts:34` (web).

### SSE Response Format

The backend responds with Server-Sent Events:

```
data: {"type": "tagging_status", "message": "Processing images..."}

data: {"type": "tagging_status", "message": "Saving session..."}

data: {"type": "done", "session_id": 123}

data: {"type": "error", "message": "Failed to process"}
```

Event types and callbacks:
- `tagging_status` → `onStatus(message)` callback
- `done` → `onComplete(data)` callback
- `error` → `onError(message)` callback

### Authentication Status

**Currently in DEV MODE** with hardcoded user/org IDs at `src/services/taggingApi.ts:27–28`. A proper auth system is not yet implemented.

## Web Platform Differences

On web, `captureFromPhone()` delegates to `getUserMedia` (same as glasses capture) instead of `expo-image-picker`, since `launchCameraAsync()` is unavailable in browsers. See `src/hooks/useTaggingSession.ts:383` for the platform check.

Gallery picking via `expo-image-picker` works on web (browser file dialog).

## Known Limitations

1. **No authentication**: User and org IDs are hardcoded. Backend accepts any request without auth tokens.

2. **GPS accuracy**: Falls back to `{0, 0}` silently if location permission is denied. No retry logic.

3. **Image size**: Base64 images are sent in full resolution (quality 0.7 compression for phone camera). Large galleries could hit memory limits or timeout on upload.

4. **Gallery limit**: Multi-select capped at 10 images per capture action, but no limit on total images per session.

5. **Keyword false positives**: Word-boundary regex matching for start/end keywords. Uses `\b` boundaries to reduce false positives (see `src/types/tagging.ts:99`).

6. **Camera exclusivity**: Glasses camera capture during tagging is mutually exclusive with recording and streaming.

## File Locations

| File | Purpose |
|------|---------|
| `src/hooks/useTaggingSession.ts` | Main tagging session hook |
| `src/services/taggingApi.ts` | Backend API client for tagging |
| `src/hooks/useGlassesCamera.ts` | Glasses camera capture hook |
