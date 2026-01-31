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
│                     MAIN PROCESS                             │
│  React Native App                                            │
│  ├── XRGlassesModule.kt (Expo bridge)                       │
│  ├── XRGlassesService.kt (connection management)            │
│  └── GlassesBroadcastReceiver.kt (receives IPC)             │
└─────────────────────────────────────────────────────────────┘
                              │ Intent (IPC)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    :xr_process (SEPARATE)                    │
│  ├── ProjectionLauncherActivity.kt (XR SDK setup)           │
│  └── GlassesActivity.kt (glasses UI, speech recognition)    │
└─────────────────────────────────────────────────────────────┘
```

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
├── ProjectionLauncherActivity.kt   # XR SDK setup (:xr_process)
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

---

## Detailed Documentation

For implementation details and troubleshooting:
- [maintenance/xr-glasses-projection.md](maintenance/xr-glasses-projection.md) - Process separation
- [maintenance/speech-recognition.md](maintenance/speech-recognition.md) - Speech architecture
- [maintenance/camera-capture.md](maintenance/camera-capture.md) - Camera system
