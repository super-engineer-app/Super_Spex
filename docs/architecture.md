# XR Glasses Architecture

## Critical Architecture Constraint

> **All Android XR features MUST be implemented in native Kotlin modules.**
>
> The Jetpack XR SDK (`androidx.xr.projected`, `androidx.xr.runtime`, etc.) is Android-native
> and cannot be accessed directly from React Native/JavaScript.
>
> **This means:**
> - `SpeechRecognizer`, `ProjectedContext`, `ProjectedActivityCompat` → Kotlin only
> - React Native receives data via events emitted from Kotlin
> - All XR-related logic lives in `modules/xr-glasses/android/`

---

## Process Separation (CRITICAL!)

**XR activities MUST run in a separate Android process to avoid corrupting React Native.**

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS (on phone)                  │
│  React Native App                                            │
│  ├── XRGlassesModule.kt (Expo bridge)                       │
│  ├── XRGlassesService.kt (connection management)            │
│  ├── SharedCameraProvider.kt (CameraX singleton)            │
│  ├── GlassesCameraManager.kt (image capture)                │
│  ├── StreamingCameraManager.kt (video frame capture)        │
│  ├── AgoraStreamManager.kt (Agora RTC streaming)            │
│  └── GlassesBroadcastReceiver.kt (receives IPC)             │
└─────────────────────────────────────────────────────────────┘
                              │ Intent (IPC)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              :xr_process (on phone, DISPLAYS to glasses)     │
│  ├── ProjectionLauncherActivity.kt (XR SDK setup)           │
│  └── GlassesActivity.kt (glasses UI, speech recognition)    │
└─────────────────────────────────────────────────────────────┘
```

**IMPORTANT:** `:xr_process` runs on the **phone** but its UI displays on the **glasses**.
This means code in `:xr_process` doesn't have direct access to phone OR glasses hardware.
To access glasses hardware (camera, mic), you MUST use `ProjectedContext.createProjectedDeviceContext()`.

See [maintenance/xr-glasses-projection.md](maintenance/xr-glasses-projection.md) for why this is required.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         REACT NATIVE (Expo)                         │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │   Screens   │  │ Components  │  │  Hooks (useXRGlasses, etc)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │             IXRGlassesService (platform interface)          │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  ANDROID         │  │  WEB (Demo)      │  │  iOS (Future)    │
│                  │  │                  │  │                  │
│  Main Process:   │  │  WebXRGlasses-   │  │  IOSXRGlasses-   │
│  - XRGlassesModule│  │  Service         │  │  Service (stub)  │
│  - XRGlassesService│ │                  │  │                  │
│                  │  │  Browser APIs:   │  │                  │
│  :xr_process:    │  │  - Web Speech    │  │                  │
│  - GlassesActivity│  │  - getUserMedia  │  │                  │
│  - ProjectionLauncher│ │  - MediaRecorder│  │                  │
│        │         │  │  - Agora Web SDK │  │                  │
│        ▼         │  │                  │  │                  │
│  Jetpack XR SDK  │  │  .web.ts files   │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Platform abstraction:** All hooks call `IXRGlassesService` methods (defined at `modules/xr-glasses/src/XRGlassesModule.ts:62`). Metro's `.web.ts` convention selects the right implementation at bundle time.

---

## File Structure

```
modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/
├── XRGlassesModule.kt              # Expo module bridge (main process)
├── XRGlassesService.kt             # Connection & state management (main process)
├── GlassesBroadcastReceiver.kt     # Receives IPC from :xr_process (main process)
├── SharedCameraProvider.kt         # CameraX singleton with ref counting (main process)
├── GlassesCameraManager.kt         # Image capture logic (main process)
├── StreamingCameraManager.kt       # Video streaming frame capture (main process)
├── NativeErrorHandler.kt           # Error reporting to Discord (main process)
├── NetworkSpeechRecognizer.kt     # Network-based speech recognition fallback (main process)
├── CameraPreviewView.kt          # Native camera preview view component (main process)
├── ProjectionLauncherActivity.kt   # XR SDK setup (:xr_process)
├── stream/                         # Remote View (Agora streaming)
│   ├── AgoraStreamManager.kt       # Agora RTC engine wrapper (main process)
│   ├── StreamQuality.kt            # Quality presets enum
│   └── StreamSession.kt            # Session & ViewerInfo data classes
└── glasses/
    ├── GlassesActivity.kt          # Runs on glasses display (:xr_process)
    └── GlassesScreen.kt            # Compose UI for glasses
```

---

## Architecture Decisions

### Separate Process for XR
The Android XR SDK corrupts React Native's rendering context when called from the same process. Solution: Run all XR SDK code in `:xr_process`.

### On-Device Speech Recognition
ASR runs on the glasses hardware, not the phone. This avoids Bluetooth audio latency and works offline. Only text results are sent to the phone.

### Broadcast-Based IPC
Communication between processes uses Android broadcasts with `setPackage(packageName)` for security.

### Glasses-First Camera Selection
Video recording and photo capture default to the glasses camera (via `ProjectedContext`). If unavailable (e.g. emulator, no glasses connected), they fall back to the phone camera automatically. See [maintenance/camera-capture.md](maintenance/camera-capture.md).

### Mode State Persistence
`ContentArea.tsx` keeps `IdentifyMode`, `HelpMode`, and `NotesMode` permanently mounted (hidden with `display: "none"` when another mode is active). This preserves AI responses, captured photos, question text, transcript text, and the active sub-tab across mode switches. LiveStreamMode, TeaCheckerMode, and ConfigMode use standard conditional rendering (unmount/remount).

### Phone-First Layout
All mode screens use a vertical (top-to-bottom) layout designed for regular smartphone widths: preview/content area on top, action buttons in a horizontal row underneath, then additional content (text inputs, AI responses) below. The sidebar is 64px (icon-only) on narrow screens and 280px with labels on screens wider than 600px.

### Capabilities Validation Only
Device capabilities are checked internally before connecting but not displayed in UI.

### Remote View (Agora Streaming)
Real-time video streaming from glasses camera to web viewers via Agora RTC.

**Why Agora runs in main process:**
- `StreamingCameraManager` needs `ProjectedContext.createProjectedDeviceContext()` to access glasses camera
- ProjectedContext only works from the main process (verified by testing)
- Running both camera capture and Agora in main process avoids IPC overhead for video frames

**Camera Access:**
`StreamingCameraManager` uses `ProjectedContext.createProjectedDeviceContext()` to access the glasses camera.
This is the same approach used by `GlassesCameraManager` for image capture.

**Architecture:**
```
Main Process (on phone)               Cloud                    Browser
┌─────────────────────────┐   ┌─────────────────┐      ┌──────────────────┐
│ XRGlassesService        │   │ Cloudflare      │      │ Web Viewer       │
│   ↓                     │   │ Workers (TS)    │      │                  │
│ StreamingCameraManager  │   │ - Token server  │      │ Agora Web SDK    │
│   ↓ (via ProjectedCtx)  │   │ - Static viewer │      │ - Subscribe      │
│ CameraX → NV21 frames   │   │                 │      │ - Display video  │
│   ↓                     │   │                 │      │                  │
│ AgoraStreamManager      │──►│                 │◄─────│                  │
│ - pushVideoFrameBuffer()│   └─────────────────┘      └──────────────────┘
│ - Token auth            │
└─────────────────────────┘
```

---

## Related Repositories

| Repository | Location | Description |
|------------|----------|-------------|
| **spex** (this repo) | `~/coding/spex` | Native app + Cloudflare Worker (`cloudflare-workers/`) |
| **EngineersGambit** | `~/coding/EngineersGambit` | Web platform -- Spex features ported as JS under `frontend/components/spex/` |
| **spex-web-viewer** | `~/coding/spex-web-viewer` | Vite + TS web viewer for Remote View (Cloudflare Pages) |
| **superspex-backend** | `~/coding/superspex-backend` | AI backend (Render) |

### Shared Infrastructure

The Agora Token Worker (`cloudflare-workers/` in this repo) is shared between the native app and the EngineersGambit web integration. Both apps use the same worker for token generation and viewer tracking. Changes affect both.

| Service | Configuration |
|---------|---------------|
| Token server | Set in `.env` as `AGORA_TOKEN_SERVER_URL` |
| Web Viewer | Set in `.env` as `SPEX_VIEWER_URL_BASE` |

---

## Web Platform

The demo version of the app runs cross-platform (Android, web, future iOS). On web, `WebXRGlassesService` implements the same `IXRGlassesService` interface using browser APIs (Web Speech, getUserMedia, MediaRecorder, Agora Web SDK).

Key differences from native:
- No separate process — everything runs in the browser
- Camera uses `getUserMedia` instead of CameraX/ProjectedContext
- Speech falls back to network-based transcription on Firefox
- FormData uses Blob instead of RN's `{uri, type, name}` convention
- Platform-split files (`.web.ts`) are selected automatically by Metro

See [maintenance/web-platform.md](maintenance/web-platform.md) for full details.

---

## Detailed Documentation

For implementation details and troubleshooting:
- [maintenance/xr-glasses-projection.md](maintenance/xr-glasses-projection.md) - Process separation
- [maintenance/speech-recognition.md](maintenance/speech-recognition.md) - Speech architecture
- [maintenance/camera-capture.md](maintenance/camera-capture.md) - Camera system
- [maintenance/remote-view-streaming.md](maintenance/remote-view-streaming.md) - Remote View (Agora streaming)
- [maintenance/web-platform.md](maintenance/web-platform.md) - Web platform (browser APIs, `.web.ts` files)
