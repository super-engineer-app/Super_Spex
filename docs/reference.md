# XR Glasses Reference

## Key Code Files

### Kotlin (Native Module)
| File | Purpose |
|------|---------|
| `modules/xr-glasses/android/.../XRGlassesService.kt` | Core XR service, connection management |
| `modules/xr-glasses/android/.../XRGlassesModule.kt` | Expo module bridge to React Native |
| `modules/xr-glasses/android/.../ProjectionLauncherActivity.kt` | XR SDK setup (runs in :xr_process) |
| `modules/xr-glasses/android/.../glasses/GlassesActivity.kt` | Runs on glasses, speech recognition |
| `modules/xr-glasses/android/.../GlassesCameraManager.kt` | Camera capture logic |
| `modules/xr-glasses/android/.../GlassesBroadcastReceiver.kt` | IPC from glasses to phone |

### TypeScript (React Native)
| File | Purpose |
|------|---------|
| `modules/xr-glasses/src/XRGlassesModule.ts` | Platform service abstraction |
| `src/hooks/useXRGlasses.ts` | Main React hook for glasses state |
| `src/hooks/useSpeechRecognition.ts` | Speech recognition hook |
| `src/hooks/useGlassesCamera.ts` | Camera capture hook |
| `app/index.tsx` | Home/connection screen |
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

# Install on phone emulator
~/Android/Sdk/platform-tools/adb -s emulator-5554 install -r android/app/build/outputs/apk/release/app-release.apk

# Watch XR logs
~/Android/Sdk/platform-tools/adb -s emulator-5554 logcat | grep -iE "XRGlassesService|GlassesActivity|ProjectionLauncher"
```

---

## Troubleshooting

For detailed troubleshooting, see the maintenance docs:

| Issue | See |
|-------|-----|
| Phone UI broken after connect | [maintenance/xr-glasses-projection.md](maintenance/xr-glasses-projection.md) |
| Speech recognition not working | [maintenance/speech-recognition.md](maintenance/speech-recognition.md) |
| Camera issues | [maintenance/camera-capture.md](maintenance/camera-capture.md) |
| Emulator problems | [maintenance/emulator-testing.md](maintenance/emulator-testing.md) |
| Build failures | [maintenance/build-deploy.md](maintenance/build-deploy.md) |

---

## Notes

- Jetpack XR library versions may change - check Maven for latest
- Android XR requires API 30+ minimum, API 36 for full features
- See `CLAUDE.md` for emulator setup instructions
- See `docs/maintenance/` for troubleshooting guides
