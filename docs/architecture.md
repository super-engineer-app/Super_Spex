# XR Glasses Architecture

## Critical Architecture Constraint

> **All Android XR features MUST be implemented in native Kotlin modules.**
>
> The Jetpack XR SDK (`androidx.xr.projected`, `androidx.xr.runtime`, etc.) is Android-native
> and cannot be accessed directly from React Native/JavaScript. The architecture is:
>
> ```
> React Native (TypeScript)
>        ↓ calls
> Expo Native Module (Kotlin)
>        ↓ uses
> Jetpack XR SDK (Android native)
>        ↓ communicates with
> AI Glasses Hardware
> ```
>
> **This means:**
> - `SpeechRecognizer`, `ProjectedContext`, `ProjectedActivityCompat` → Kotlin only
> - React Native receives data via events emitted from Kotlin
> - All XR-related logic lives in `modules/xr-glasses/android/`

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         REACT NATIVE (Expo)                         │
│                          TypeScript/JS                              │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │   Screens   │  │ Components  │  │  State Management (Zustand) │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              useXRGlasses() Hook                             │   │
│  │         (Platform-agnostic interface)                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              XRGlassesService                                │   │
│  │    if (Platform.OS === 'android') → AndroidXRModule          │   │
│  │    if (Platform.OS === 'ios')     → IOSXRModule (C++ later)  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│   ANDROID (Phase 1)     │       │   iOS (Phase 2+)        │
│                         │       │                         │
│  Expo Module (Kotlin)   │       │  Expo Module (Swift)    │
│         │               │       │         │               │
│         ▼               │       │         ▼               │
│  Jetpack XR Library     │       │  C++ Protocol Core      │
│  (androidx.xr.projected)│       │  (reverse engineered)   │
│         │               │       │         │               │
│         ▼               │       │         ▼               │
│  Android System Service │       │  CoreBluetooth +        │
│  (AIDL → Glasses)       │       │  Network.framework      │
└─────────────────────────┘       └─────────────────────────┘
```

---

## Speech Recognition Architecture

ASR runs ON THE GLASSES, not on the phone. This is critical for latency:
- No Bluetooth audio streaming required
- Audio captured and processed locally on glasses hardware
- Only text results are sent to phone via the Expo native module bridge
- Works offline (on-device models)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI GLASSES (on-device)                       │
│                                                                 │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│  │ Microphone  │───▶│ SpeechRecognizer│───▶│ GlassesActivity│  │
│  │ (hardware)  │    │ (local ASR)     │    │ (sends events) │  │
│  └─────────────┘    └─────────────────┘    └───────┬────────┘  │
│                                                     │           │
└─────────────────────────────────────────────────────│───────────┘
                                                      │ text only
                                                      │ (minimal latency)
                                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PHONE (React Native App)                     │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ XRGlassesModule │───▶│ useSpeechReco.. │───▶│ Backend API │ │
│  │ (receives text) │    │ (React hook)    │    │ (AI response)│ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why this architecture:**
- **No Bluetooth audio latency** - Audio never leaves the glasses
- **Works offline** - On-device ASR, no network for transcription
- **Battery efficient** - No audio streaming over Bluetooth
- **Lower bandwidth** - Only text sent to phone

---

## GlassesActivity Architecture

ASR must run in a **Glasses Activity** - an Android Activity that runs on the glasses
hardware itself, declared with `android:requiredDisplayCategory="xr_projected"`.

```
┌─────────────────────────────────────────────────────────────────┐
│                    GLASSES (GlassesActivity.kt)                 │
│                                                                 │
│  - SpeechRecognizer runs here                                   │
│  - Captures audio from glasses mic                              │
│  - Processes speech locally                                     │
│  - Sends text results via broadcast/binding to phone service    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (broadcast or bound service)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PHONE (XRGlassesModule.kt)                   │
│                                                                 │
│  - Receives text events from glasses activity                   │
│  - Emits events to React Native                                 │
│  - Controls start/stop via IPC to glasses                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/
├── XRGlassesModule.kt           # Expo module (phone-side)
├── XRGlassesService.kt          # Phone-side service
├── glasses/
│   ├── GlassesActivity.kt       # Runs on glasses
│   ├── SpeechRecognitionManager.kt  # ASR logic
│   └── GlassesBridge.kt         # IPC to phone
```

---

## Architecture Decisions

### Capabilities UI Removed
Cannot remotely query glasses system features from phone. Capabilities are used internally for **validation only**:
- Checks for `com.google.android.feature.XR_PROJECTED` before connecting
- Shows clear error if device is incompatible
- No capabilities displayed in UI
