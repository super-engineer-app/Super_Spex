# XR Glasses Reference

## Key Code Files

### Kotlin (Native Module)

**Main Process (phone):**
| File | Purpose |
|------|---------|
| `modules/xr-glasses/android/.../XRGlassesModule.kt` | Expo module bridge to React Native |
| `modules/xr-glasses/android/.../XRGlassesService.kt` | Core XR service, connection management |
| `modules/xr-glasses/android/.../GlassesCameraManager.kt` | Image capture (uses ProjectedContext) |
| `modules/xr-glasses/android/.../GlassesBroadcastReceiver.kt` | IPC from :xr_process |

**:xr_process (phone process, displays to glasses):**
| File | Purpose |
|------|---------|
| `modules/xr-glasses/android/.../ProjectionLauncherActivity.kt` | XR SDK setup |
| `modules/xr-glasses/android/.../glasses/GlassesActivity.kt` | Glasses UI, speech, streaming |
| `modules/xr-glasses/android/.../glasses/GlassesScreen.kt` | Compose UI for glasses display |
| `modules/xr-glasses/android/.../stream/AgoraStreamManager.kt` | Agora RTC engine wrapper |
| `modules/xr-glasses/android/.../stream/TextureCameraProvider.kt` | Camera frames for streaming (uses ProjectedContext) |
| `modules/xr-glasses/android/.../stream/StreamQuality.kt` | Quality presets enum |
| `modules/xr-glasses/android/.../stream/StreamSession.kt` | Session/viewer data classes |

### TypeScript (React Native)
| File | Purpose |
|------|---------|
| `modules/xr-glasses/index.ts` | Native module interface & event types |
| `modules/xr-glasses/src/XRGlassesModule.ts` | Platform service abstraction |
| `src/hooks/useXRGlasses.ts` | Main React hook for glasses state |
| `src/hooks/useSpeechRecognition.ts` | Speech recognition hook |
| `src/hooks/useGlassesCamera.ts` | Camera capture hook |
| `src/hooks/useRemoteView.ts` | Remote view streaming hook |
| `src/services/backendApi.ts` | AI backend integration |
| `src/components/QualitySelector.tsx` | Stream quality UI component |
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

## Related Repositories

| Repository | Location | Description |
|------------|----------|-------------|
| **spex** (this repo) | `~/coding/spex` | Main React Native app + native modules |
| **spex-web-viewer** | `~/coding/spex-web-viewer` | Cloudflare Workers (web viewer + token server) |
| **superspex-backend** | `~/coding/superspex-backend` | AI backend (Fly.dev) |

---

## Notes

- Jetpack XR library versions may change - check Maven for latest
- Android XR requires API 30+ minimum, API 36 for full features
- See `CLAUDE.md` for emulator setup instructions
- See `docs/maintenance/` for troubleshooting guides
