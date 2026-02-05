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

All image sources produce `TaggedImage` objects:

```typescript
interface TaggedImage {
  base64: string;       // JPEG base64-encoded image data
  timestamp: number;    // Unix timestamp of capture
  source: 'glasses' | 'phone' | 'gallery';
  coordinates: {
    lat: number;
    long: number;
  };
}
```

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

Each image gets GPS coordinates via `createTaggedImage()`:

1. Calls `getCurrentLocation()` which uses `expo-location`
2. Requests foreground location permission if not already granted
3. Falls back to `{lat: 0, long: 0}` if permission denied or location unavailable

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

Images are attached using the React Native FormData convention:
```typescript
formData.append('images', {
  uri: `data:image/jpeg;base64,${image.base64}`,
  type: 'image/jpeg',
  name: `tag-image-${index}.jpg`,
} as ReactNativeFile as unknown as Blob);
```

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

**Currently in DEV MODE** with hardcoded values:

```typescript
const DEV_USER_ID = 1;
const DEV_ORG_ID = 1;

function getTaggingUserId(): number {
  return DEV_USER_ID; // TODO: Replace with proper authentication
}
```

A proper auth system is not yet implemented. This is tracked as out-of-scope (W5 in the audit).

## Known Limitations

1. **No authentication**: User and org IDs are hardcoded. Backend accepts any request without auth tokens.

2. **GPS accuracy**: Falls back to `{0, 0}` silently if location permission is denied. No retry logic.

3. **Image size**: Base64 images are sent in full resolution (quality 0.7 compression for phone camera). Large galleries could hit memory limits or timeout on upload.

4. **Gallery limit**: Multi-select capped at 10 images per capture action, but no limit on total images per session.

5. **Keyword false positives**: Simple substring matching for start/end keywords could trigger on normal speech containing "note", "tag", "done", or "save".

6. **Camera exclusivity**: Glasses camera capture during tagging is mutually exclusive with recording and streaming.

## File Locations

| File | Purpose |
|------|---------|
| `src/hooks/useTaggingSession.ts` | Main tagging session hook |
| `src/services/taggingApi.ts` | Backend API client for tagging |
| `src/hooks/useGlassesCamera.ts` | Glasses camera capture hook |
