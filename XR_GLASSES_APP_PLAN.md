# XR Glasses React Native App - Implementation Plan

## Status Summary (2026-01-30)

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
| 4 | Backend Integration | ⏳ PENDING |
| 5 | End-to-End Testing | 🔄 IN PROGRESS |
| 6 | iOS Implementation | ⏳ FUTURE |

**Approach:** On-device SpeechRecognizer running ON THE GLASSES (not phone) for minimal latency

---

## Current Status Notes (2026-01-30)

### Major Milestone: Phone UI Redesigned

The phone app UI has been completely updated with a clean card-based design.

**UI Components (app/glasses/index.tsx):**
- **Engagement Mode Card** - Visuals (V) and Audio (A) toggles with ON/OFF state
- **Quick Actions Card** - Display (D) and Input (I) buttons (placeholder)
- **Voice Input Card** - MIC button with transcript display and "Send to AI" action
- **Camera Capture Card** - CAM button with image preview and release control
- **Disconnect Button** - Clean exit flow

**What's working:**
- GlassesActivity.kt renders UI on glasses display (Display 7)
- Projected permissions dialog shows on phone when glasses need mic access
- Speech recognition works with permissions granted
- Camera capture working with image preview
- Phone app has polished card-based UI
- Engagement mode toggles work in emulation mode

**Known Issues:**
- Auto-wake display doesn't work reliably - user needs to press glasses button once
- This is a known SDK limitation: "Launching a projected activity does not automatically turn on the AI glasses' display (planned for future releases)"

**🔴 Current Investigation:**
- After UI updates, glasses button press no longer wakes device
- Previously worked on Pixel Pro Fold
- Testing on different phone now - need to isolate if phone-specific or code regression
- Action: Check logcat when pressing glasses button to see what's happening

**Testing Setup:**
- Phone emulator: Pixel 9 Flip (CANARY image) - emulator-5554
- Glasses emulator: AI_Glasses - emulator-5556
- To wake glasses display: Press the glasses button in emulator (icon above 3 dots menu)

---

## Next Steps

1. **🔴 PRIORITY: Verify Projection** - Glasses button press not waking device with new APK after UI updates
   - Worked before on Pixel Pro Fold
   - Now testing on different phone - need to determine if phone-specific or update regression
   - Check logcat output when pressing glasses button
2. **Backend Integration** - Implement actual API call in "Send to AI" button (currently simulated)
3. **Quick Actions** - Implement Display and Input button functionality
4. **Auto-wake Display** - Monitor SDK updates for improved display wake support

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/architecture.md](docs/architecture.md) | System architecture, diagrams, constraints |
| [docs/reference.md](docs/reference.md) | Key files, quick commands, research findings |
| [docs/xr-glasses-resources.md](docs/xr-glasses-resources.md) | Official samples, API references |
| [CLAUDE.md](CLAUDE.md) | Build instructions, emulator setup, testing |

---

## Overview

Build a React Native (Expo) app that communicates with Android XR glasses using Jetpack XR APIs, with architecture designed for future iOS cross-platform support via C++ protocol implementation.

**Current Goal:** Use on-device speech recognition from glasses microphone → Send transcribed text to backend → Return AI response to user.

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
