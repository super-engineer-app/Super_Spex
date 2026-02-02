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
│  ├── GlassesCameraManager.kt (image capture)                │
│  └── GlassesBroadcastReceiver.kt (receives IPC)             │
└─────────────────────────────────────────────────────────────┘
                              │ Intent (IPC)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              :xr_process (on phone, DISPLAYS to glasses)     │
│  ├── ProjectionLauncherActivity.kt (XR SDK setup)           │
│  ├── GlassesActivity.kt (glasses UI, speech, streaming)     │
│  ├── AgoraStreamManager.kt (Agora RTC)                      │
│  └── TextureCameraProvider.kt (camera frames for streaming) │
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
│  │              XRGlassesModule (Expo Native Module)           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│   ANDROID (Current)     │       │   iOS (Future)          │
│                         │       │                         │
│  Main Process:          │       │  Expo Module (Swift)    │
│  - XRGlassesService     │       │         │               │
│  - XRGlassesModule      │       │         ▼               │
│                         │       │  C++ Protocol Core      │
│  :xr_process:           │       │  (reverse engineered)   │
│  - GlassesActivity      │       │         │               │
│  - ProjectionLauncher   │       │         ▼               │
│         │               │       │  CoreBluetooth          │
│         ▼               │       │                         │
│  Jetpack XR SDK         │       │                         │
└─────────────────────────┘       └─────────────────────────┘
```

---

## File Structure

```
modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/
├── XRGlassesModule.kt              # Expo module bridge (main process)
├── XRGlassesService.kt             # Connection & state management (main process)
├── GlassesBroadcastReceiver.kt     # Receives IPC from :xr_process
├── GlassesCameraManager.kt         # Camera capture logic
├── StreamingCameraManager.kt       # Video streaming frame capture
├── ProjectionLauncherActivity.kt   # XR SDK setup (:xr_process)
├── stream/                         # Remote View (Agora streaming)
│   ├── AgoraStreamManager.kt       # Agora RTC engine wrapper (:xr_process)
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

### Capabilities Validation Only
Device capabilities are checked internally before connecting but not displayed in UI.

### Remote View (Agora Streaming)
Real-time video streaming from glasses camera to web viewers via Agora RTC.

**Why Agora runs in :xr_process:**
- Keeps streaming logic separate from React Native main process
- AgoraStreamManager handles RTC engine lifecycle

**Camera Access from :xr_process:**
Since `:xr_process` runs on the phone but doesn't have direct hardware access,
`TextureCameraProvider` must use `ProjectedContext.createProjectedDeviceContext()`
to access the glasses camera. This is the same approach used by `GlassesCameraManager`
in the main process for image capture.

**Architecture:**
```
:xr_process (on phone)                Cloud                    Browser
┌─────────────────────────┐   ┌─────────────────┐      ┌──────────────────┐
│ GlassesActivity         │   │ Cloudflare      │      │ Web Viewer       │
│   ↓                     │   │ Workers         │      │                  │
│ TextureCameraProvider   │   │ - Token server  │      │ Agora Web SDK    │
│   ↓ (via ProjectedCtx)  │   │ - Static viewer │      │ - Subscribe      │
│ CameraX → NV21 frames   │   │                 │      │ - Display video  │
│   ↓                     │   │                 │      │                  │
│ AgoraStreamManager      │──►│                 │◄─────│                  │
│ - pushVideoFrame()      │   └─────────────────┘      └──────────────────┘
│ - Token auth            │
└─────────────────────────┘
```

---

## Related Repositories

| Repository | Location | Description |
|------------|----------|-------------|
| **spex** (this repo) | `~/coding/spex` | Main React Native app + native modules |
| **spex-web-viewer** | `~/coding/spex-web-viewer` | Cloudflare Workers for Remote View (web viewer + token server) |
| **superspex-backend** | `~/coding/superspex-backend` | AI backend (Fly.dev) |

**Web Viewer Deployment:**
- Viewer: `https://REDACTED_VIEWER_URL/view/{channelId}`
- Token server: `https://REDACTED_TOKEN_SERVER/`

---

## Detailed Documentation

For implementation details and troubleshooting:
- [maintenance/xr-glasses-projection.md](maintenance/xr-glasses-projection.md) - Process separation
- [maintenance/speech-recognition.md](maintenance/speech-recognition.md) - Speech architecture
- [maintenance/camera-capture.md](maintenance/camera-capture.md) - Camera system
- [maintenance/remote-view-streaming.md](maintenance/remote-view-streaming.md) - Remote View (Agora streaming)
