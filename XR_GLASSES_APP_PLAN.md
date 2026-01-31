# XR Glasses React Native App - Implementation Plan

## Status Summary (2026-01-31)

| Phase | Description | Status |
|-------|-------------|--------|
| 1.1 | Project Setup | ✅ COMPLETE |
| 1.2 | Native Module Structure | ✅ COMPLETE |
| 1.3 | Jetpack XR Integration | ✅ COMPLETE |
| 1.4 | React Native Bridge | ✅ COMPLETE |
| 1.5 | Connection Flow | ✅ COMPLETE |
| 2.1 | GlassesActivity + SpeechRecognizer | ✅ COMPLETE |
| 2.2 | React Native Speech Hook | ✅ COMPLETE |
| 2.3 | Speech Recognition Testing | ✅ COMPLETE |
| 2.4 | Camera Capture | ✅ COMPLETE |
| **3** | **Glasses Display Rendering** | ✅ COMPLETE |
| 3.1 | Projected Activity Configuration | ✅ COMPLETE |
| 3.2 | Projected Permissions API | ✅ COMPLETE |
| 3.3 | Auto-wake Display | ⚠️ SDK LIMITATION |
| 3.4 | Phone UI Update | ✅ COMPLETE |
| **3.5** | **Phone UI + Projection Coexistence** | ✅ COMPLETE |
| **4** | **Backend Integration** | ✅ COMPLETE |
| 5 | End-to-End Testing | 🔄 IN PROGRESS |
| 6 | iOS Implementation | ⏳ FUTURE |

**Approach:** On-device SpeechRecognizer running ON THE GLASSES (not phone) for minimal latency

---

## Current Status Notes (2026-01-31)

### Major Milestone: Phone UI + Glasses Projection Working Together!

**SOLVED**: The Android XR SDK was corrupting React Native's rendering. Fixed by running XR activities in a separate Android process.

**The Fix (Critical!):**
```xml
<!-- In AndroidManifest.xml - XR activities MUST have separate process -->
<activity android:name=".ProjectionLauncherActivity" android:process=":xr_process" ... />
<activity android:name=".glasses.GlassesActivity" android:process=":xr_process" ... />
```

See `/docs/maintenance/xr-glasses-projection.md` for full details.

**UI Components (app/glasses/index.tsx):**
- **Engagement Mode Card** - Visuals (V) and Audio (A) toggles with ON/OFF state
- **Quick Actions Card** - Display (D) and Input (I) buttons (placeholder)
- **Voice Input Card** - MIC button with transcript display and "Send to AI" action
- **Camera Capture Card** - CAM button with image preview and release control
- **Disconnect Button** - Clean exit flow

**What's working:**
- Phone UI renders correctly (text visible in all buttons)
- GlassesActivity.kt renders UI on glasses display (Display 7)
- Both work simultaneously!
- Projected permissions dialog shows on phone when glasses need mic access
- Speech recognition works with permissions granted
- Camera capture working with image preview
- Engagement mode toggles work in emulation mode

**Known Issues:**
- Auto-wake display doesn't work reliably - user needs to press glasses button once (SDK limitation)

### Backend Integration (2026-01-31) ✅

**Endpoint:** `POST https://REDACTED_BACKEND_URL/generate_temp`

**Implementation:** `src/services/backendApi.ts`
- Sends captured images and speech transcripts to AI backend
- Uses multipart form data with session UUID (`user_id`)
- Supports conversation continuity via `conversation_id`
- Images saved to temp file via `expo-file-system/legacy` before upload

**Form Fields:**
- `user_id` (string) - Auto-generated UUID per session
- `conversation_id` (string, optional) - For multi-turn conversations
- `text` (string, optional) - Speech transcript
- `image` (file, optional) - Captured image as JPEG

**Testing:** See [docs/maintenance/emulator-testing.md](docs/maintenance/emulator-testing.md) for emulator setup and troubleshooting.

---

## Next Steps

1. ~~**🔴 PRIORITY: Verify Projection** - SOLVED via separate process architecture~~
2. ~~**Backend Integration** - COMPLETE (2026-01-31)~~
3. **Quick Actions** - Implement Display and Input button functionality
4. **Auto-wake Display** - Monitor SDK updates for improved display wake support
5. **End-to-End Testing** - Full flow testing with real glasses when available

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/architecture.md](docs/architecture.md) | System architecture, diagrams, constraints |
| [docs/reference.md](docs/reference.md) | Key files, quick commands, research findings |
| [docs/xr-glasses-resources.md](docs/xr-glasses-resources.md) | Official samples, API references |
| [CLAUDE.md](CLAUDE.md) | Build instructions, emulator setup, testing |

### Maintenance Guides (Troubleshooting)

| Document | Description |
|----------|-------------|
| **[docs/maintenance/README.md](docs/maintenance/README.md)** | **Maintenance docs index, quick troubleshooting** |
| [docs/maintenance/xr-glasses-projection.md](docs/maintenance/xr-glasses-projection.md) | **CRITICAL** - Projection + React Native coexistence |
| [docs/maintenance/speech-recognition.md](docs/maintenance/speech-recognition.md) | Speech recognition architecture & issues |
| [docs/maintenance/camera-capture.md](docs/maintenance/camera-capture.md) | Camera capture system & issues |
| [docs/maintenance/emulator-testing.md](docs/maintenance/emulator-testing.md) | Emulator setup, pairing, known issues |
| [docs/maintenance/build-deploy.md](docs/maintenance/build-deploy.md) | Build process, installation, dependencies |
| [docs/PROJECTION_FIX_ATTEMPTS.md](docs/PROJECTION_FIX_ATTEMPTS.md) | Log of all projection fix attempts |

---

## Overview

Build a React Native (Expo) app that communicates with Android XR glasses using Jetpack XR APIs, with architecture designed for future iOS cross-platform support via C++ protocol implementation.

**Current Goal:** ✅ ACHIEVED - Speech recognition and camera capture send data to AI backend and display response.

---

## Timeline Summary

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | Project Setup | Expo project, native module structure, TypeScript interfaces |
| 1-2 | Android Implementation | Kotlin module with Jetpack XR, hooks, basic UI |
| 2 | Testing | Test on Android device with glasses |
| 3 | Protocol Capture | Bluetooth/WiFi packet captures, initial documentation |
| 4+ | C++ Core | Shared protocol implementation |
| 5+ | iOS Implementation | Swift platform layer, CoreBluetooth integration |
