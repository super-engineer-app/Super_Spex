# Web Platform

## Overview

The demo version of the app runs on web via Expo's Metro bundler with `.web.ts` platform-split files. All core features (speech recognition, camera capture, video recording, remote streaming, parking timer, tagging) work in the browser using Web APIs.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WEB BUNDLE (Metro)                        │
│                                                             │
│  App Screens (app/*.tsx)                                    │
│    └─ Hooks (src/hooks/*.ts)                                │
│       └─ IXRGlassesService interface                        │
│          └─ WebXRGlassesService (browser APIs)              │
│                                                             │
│  Platform-split files selected automatically:               │
│    *.web.ts  →  used when bundler target = web              │
│    *.ts      →  used when bundler target = android/ios      │
└─────────────────────────────────────────────────────────────┘
```

The hooks are platform-agnostic — they call `IXRGlassesService` methods. On web, `WebXRGlassesService` implements those methods using browser APIs. On Android, `AndroidXRGlassesService` delegates to the native Kotlin module.

## Platform-Split Files

| Web File | Native File | What Changes |
|----------|-------------|-------------|
| `modules/xr-glasses/index.web.ts` | `modules/xr-glasses/index.ts` | Stubs `XRGlassesNative = null`, no-op event listeners |
| `modules/xr-glasses/src/XRGlassesModule.web.ts` | `modules/xr-glasses/src/XRGlassesModule.ts` | `WebXRGlassesService` using browser APIs |
| `src/utils/formDataHelper.web.ts` | `src/utils/formDataHelper.ts` | Blob + `<a>` download instead of expo-file-system/expo-sharing |
| `src/services/errorReporting.web.ts` | `src/services/errorReporting.ts` | `window.addEventListener('unhandledrejection')` instead of RN polyfill |

**Enabling platform splitting:** The `"main"` field in `modules/xr-glasses/package.json` must be `"index"` (no extension). Adding `.ts` disables Metro's platform resolution. See `package.json:3`.

## WebXRGlassesService — Browser API Mapping

**Definition:** `modules/xr-glasses/src/XRGlassesModule.web.ts:128`

| Feature | Browser API | Key Lines | Fallback |
|---------|------------|-----------|----------|
| Speech Recognition | `webkitSpeechRecognition` / `SpeechRecognition` | `:360–484` | Network-based: MediaRecorder → POST `/transcribe-dia` (`:528–660`) |
| Camera Capture | `getUserMedia` + Canvas `drawImage` → `toDataURL` | `:666–760` | None (requires camera permission) |
| Video Recording | `MediaRecorder` (vp9 preferred, vp8/webm fallback) | `:797–939` | Codec negotiation at `:805–815` |
| Remote View | Agora Web SDK (`agora-rtc-sdk-ng`, dynamic import) | `:961–1162` | Error handled if SDK unavailable |
| Parking Timer | `setTimeout` / `clearTimeout` | `:1167–1301` | Pure JS, no fallback needed |

### Speech Recognition Fallback Chain

1. Try `webkitSpeechRecognition` (Chrome, Edge, Safari) — `:360`
2. If unavailable (Firefox), fall back to network-based: MediaRecorder captures audio chunks → POST to `/transcribe-dia` — `:528`
3. Network fallback cycles every 3s, sending accumulated audio for transcription — `:558`

### Event Model

`WebXRGlassesService` uses `Set<Function>` for each event type (`:130–220`). The `emit<T>()` helper broadcasts to all registered callbacks. Each subscription returns `{ remove: () => void }` for cleanup.

## Cross-Platform Differences

### FormData File Handling

- **Native:** `formData.append('file', { uri, type, name })` — RN-specific object pattern
- **Web:** `formData.append('file', blob, 'filename')` — standard Blob pattern
- **Solution:** `src/utils/formDataHelper.ts` vs `formDataHelper.web.ts`

Consumers: `backendApi.ts` (AI image upload) and `taggingApi.ts` (tagging images) both use `formDataHelper` for cross-platform FormData handling — no platform-split needed in the service files themselves.

See `formDataHelper.web.ts:34` (`appendImageFileToFormData`) and `formDataHelper.web.ts:72` (`shareFileFromUri` triggers browser download).

### Tagging — Phone Camera on Web

On native, `captureFromPhone()` uses `expo-image-picker` with `launchCameraAsync()`.
On web, it delegates to `getUserMedia` (same as glasses capture) since expo-image-picker camera is unavailable in browsers.

See `src/hooks/useTaggingSession.ts:356` — platform check at `:363`.

### Video Recording on Web

On native, dual recording: CameraX VideoCapture (MP4) + MediaRecorder (WebM audio).
On web, single `MediaRecorder` captures both video+audio as WebM directly.

See `modules/xr-glasses/src/XRGlassesModule.web.ts:797` for web recording setup.

### Environment Variables

Web requires `EXPO_PUBLIC_` prefix for env vars to be embedded in the bundle:

| Variable | Native | Web |
|----------|--------|-----|
| Backend URL | `TRANSCRIPTION_API_URL` (`.env` → `buildConfigField`) | `EXPO_PUBLIC_BACKEND_URL` |
| Agora App ID | `AGORA_APP_ID` | `EXPO_PUBLIC_AGORA_APP_ID` |
| Agora Token Server | `AGORA_TOKEN_SERVER_URL` | `EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL` |
| Viewer URL Base | `SPEX_VIEWER_URL_BASE` | `EXPO_PUBLIC_SPEX_VIEWER_URL_BASE` |
| Discord Webhook | — | `EXPO_PUBLIC_DISCORD_WEBHOOK_URL` |

### Responsive Web Layout

The home and connect screens use `useWindowDimensions()` for responsive scaling on web:

- Content width: `Math.min(screenWidth * 0.9, 720)` — see `app/index.tsx:63` and `app/connect.tsx:23`
- The glasses dashboard (`app/glasses/index.tsx`) is a loading wrapper that mounts `DashboardLayout` (`src/components/dashboard/DashboardLayout.tsx`)
- `DashboardLayout` contains a responsive sidebar (160px wide on >600px screens, 56px narrow on mobile) + content area
- Mode components handle their own scrolling within the content area

## Running the Web Version

```bash
npm run web          # or: npx expo start --web
# Opens at http://localhost:8081
```

## Browser Requirements

| API | Required By | Browser Support |
|-----|------------|-----------------|
| `getUserMedia` | Camera, Recording | All modern browsers |
| `MediaRecorder` | Recording, Speech fallback | All modern browsers |
| `SpeechRecognition` | Speech | Chrome, Edge, Safari (Firefox uses network fallback) |
| `Canvas 2D` | Image capture | All modern browsers |
| `WebSocket` | Viewer count (Agora) | All modern browsers |

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Speech recognition not available" | Firefox without network fallback URL | Set `EXPO_PUBLIC_BACKEND_URL` in `.env` |
| Camera shows black | Browser blocked `getUserMedia` | Check browser permissions, use HTTPS or localhost |
| Recording fails to start | No supported codec | Check `MediaRecorder.isTypeSupported()` in console |
| Streaming fails | Agora SDK not loaded | Check network, `agora-rtc-sdk-ng` dynamic import at `:963` |
| White screen on web | React version mismatch | Ensure `react`, `react-dom` = 19.1.0 (must match `react-native` 0.81.5) |
| `.web.ts` files not picked up | `"main"` field has extension | Remove `.ts` from `"main"` in `package.json` |

## File Locations

| File | Purpose |
|------|---------|
| `modules/xr-glasses/src/XRGlassesModule.web.ts` | WebXRGlassesService — all browser API implementations |
| `modules/xr-glasses/index.web.ts` | Web entry point, stubs native module |
| `src/utils/formDataHelper.web.ts` | Blob/download helpers for web FormData |
| `src/services/backendApi.ts` | AI backend service — cross-platform (uses formDataHelper) |
| `src/services/errorReporting.web.ts` | Web error reporting (Discord webhook) |
| `app/glasses/index.tsx` | Loading wrapper (mounts `DashboardLayout` after XR permissions) |
| `src/components/dashboard/DashboardLayout.tsx` | Dashboard with sidebar + content area |
