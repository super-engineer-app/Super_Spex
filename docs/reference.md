# XR Glasses Reference

## Key Code Files

### Kotlin (Native Module)
| File | Purpose |
|------|---------|
| `modules/xr-glasses/android/.../XRGlassesService.kt` | Core XR service, connection, speech |
| `modules/xr-glasses/android/.../XRGlassesModule.kt` | Expo module bridge to React Native |
| `modules/xr-glasses/android/.../glasses/GlassesActivity.kt` | Runs on glasses, ASR |

### TypeScript (React Native)
| File | Purpose |
|------|---------|
| `modules/xr-glasses/src/XRGlassesModule.ts` | Platform service abstraction (IXRGlassesService) |
| `src/hooks/useXRGlasses.ts` | Main React hook for glasses state |
| `src/hooks/useSpeechRecognition.ts` | Speech recognition hook |
| `src/hooks/useGlassesCamera.ts` | Camera capture hook |
| `app/connect.tsx` | Connection screen |
| `app/glasses/index.tsx` | Glasses dashboard UI |

---

## Quick Commands

```bash
# Build release APK
export ANDROID_HOME=~/Android/Sdk
cd android && ./gradlew clean && ./gradlew assembleRelease

# APK location
android/app/build/outputs/apk/release/app-release.apk

# List emulators
~/Android/Sdk/platform-tools/adb devices -l

# Install on phone emulator (replace 5556 with actual port)
~/Android/Sdk/platform-tools/adb -s emulator-5556 install -r android/app/build/outputs/apk/release/app-release.apk

# Watch logs
~/Android/Sdk/platform-tools/adb -s emulator-5556 logcat | grep XRGlassesService
```

---

## Research Findings

Research conducted 2026-01-29 to determine audio capture approach:

| Question | Answer |
|----------|--------|
| Built-in transcription? | YES - `SpeechRecognizer.createOnDeviceSpeechRecognizer()` works offline |
| Audio routing? | Glasses connect as Bluetooth audio (A2DP/HFP), ~100-200ms latency |
| WiFi audio streaming? | NO - Jetpack XR only supports Bluetooth for audio |
| Best approach? | On-device SpeechRecognizer - avoids latency, sends text not audio |

**Sources:**
- https://developer.android.com/develop/xr/jetpack-xr-sdk/asr
- https://developer.android.com/develop/xr/jetpack-xr-sdk/access-hardware-projected-context

---

## Emulator Testing Notes (2026-01-30)

### Glasses emulator (emulator-5554):
- Does NOT have SpeechRecognizer available
- `SpeechRecognizer.isRecognitionAvailable()` returns false
- `SpeechRecognizer.isOnDeviceRecognitionAvailable()` returns false
- This is expected - glasses emulator is minimal image without Google services
- GlassesActivity works but speech recognition fails with "not available"

### Phone emulator (emulator-5556):
- Has network-based SpeechRecognizer (via Google app)
- On-device ASR fails with error 13 (language pack not available)
- Fallback to network ASR works correctly
- Must have microphone enabled in emulator settings
- Uses phone mic (not glasses mic) in emulator environment

### Production behavior:
- Real AI glasses have on-device ASR with glasses microphone
- GlassesActivity will run speech recognition locally on glasses
- Only text results sent to phone (no audio streaming)
- Expected latency: ~100ms for on-device ASR

### Audio streaming alternative (if needed):
- Would add ~100-600ms latency vs on-device ASR
- Complex implementation (Opus encoding, streaming, decoding)
- Jetpack XR may not expose raw audio streaming APIs
- Not recommended unless on-device ASR unavailable

---

## Emulator Stability Issues

**Symptom:** Camera/connection works initially, then stops working after several uses.

**Fix:** Fully close and restart the phone emulator. No need to create new AVD.

**Root cause (suspected):**
- NOT hot module reloading (release APK has no Metro bundler)
- Likely CameraX/Camera2 resource leak in emulator's camera HAL
- Or Jetpack XR Projected service binding gets stuck (alpha SDK)
- Or emulator's glasses↔phone pairing state corrupts in memory

**Key insight:** Restart fixes it → runtime state corruption, not image corruption.

**Workaround:** If camera stops working, restart the phone emulator.

---

## Notes

- Jetpack XR library versions may change - check Maven for latest
- Android XR requires API 28+ minimum
- See `CLAUDE.md` for emulator setup and testing instructions
