# XR Glasses Reference

## Key Code Files

### Kotlin (Native Module)

**Main Process (phone):**
| File | Purpose |
|------|---------|
| `modules/xr-glasses/android/.../XRGlassesModule.kt` | Expo module bridge to React Native |
| `modules/xr-glasses/android/.../XRGlassesService.kt` | Core XR service, connection management |
| `modules/xr-glasses/android/.../SharedCameraProvider.kt` | CameraX singleton with ref counting |
| `modules/xr-glasses/android/.../GlassesCameraManager.kt` | Image capture (uses SharedCameraProvider) |
| `modules/xr-glasses/android/.../GlassesBroadcastReceiver.kt` | IPC from :xr_process |
| `modules/xr-glasses/android/.../StreamingCameraManager.kt` | Video streaming (uses SharedCameraProvider) |
| `modules/xr-glasses/android/.../stream/AgoraStreamManager.kt` | Agora RTC engine wrapper |
| `modules/xr-glasses/android/.../stream/StreamQuality.kt` | Quality presets enum |
| `modules/xr-glasses/android/.../stream/StreamSession.kt` | Session/viewer data classes |
| `modules/xr-glasses/android/.../VideoRecordingManager.kt` | CameraX video recording + audio extraction |

**:xr_process (phone process, displays to glasses):**
| File | Purpose |
|------|---------|
| `modules/xr-glasses/android/.../ProjectionLauncherActivity.kt` | XR SDK setup |
| `modules/xr-glasses/android/.../glasses/GlassesActivity.kt` | Glasses UI, speech |
| `modules/xr-glasses/android/.../glasses/GlassesScreen.kt` | Compose UI for glasses display |

### TypeScript (React Native)
| File | Purpose |
|------|---------|
| `modules/xr-glasses/index.ts` | Native module interface & event types |
| `modules/xr-glasses/src/XRGlassesModule.ts` | Platform service interface (`IXRGlassesService`) + Android/iOS implementations |
| `modules/xr-glasses/types.ts` | Shared event type definitions (all platforms) |
| `src/hooks/useXRGlasses.ts` | Main React hook for glasses state |
| `src/hooks/useSpeechRecognition.ts` | Speech recognition hook |
| `src/hooks/useGlassesCamera.ts` | Camera capture hook |
| `src/hooks/useRemoteView.ts` | Remote view streaming hook |
| `src/hooks/useVideoRecording.ts` | Video recording + transcription hook |
| `src/hooks/useParkingTimer.ts` | Parking countdown timer hook |
| `src/hooks/useTaggingSession.ts` | Voice-activated tagging session hook |
| `src/hooks/useGlassesInput.ts` | Input event tracking hook |
| `src/services/backendApi.ts` | AI backend (send text/image, SSE response) |
| `src/services/taggingApi.ts` | Tagging backend + GPS location cache |
| `src/services/transcriptionApi.ts` | Transcription types & formatting |
| `src/services/errorReporting.ts` | Discord webhook error reporting |
| `src/components/QualitySelector.tsx` | Stream quality UI component |
| `src/components/TaggingMode.tsx` | Tagging session UI (transcript, images, capture buttons) |
| `src/components/TimePicker.tsx` | Scrollable wheel time picker for parking timer |
| `src/components/dashboard/DashboardLayout.tsx` | Root dashboard wrapper (connection guard + providers) |
| `src/components/dashboard/DashboardContext.tsx` | Context provider for dashboard state (active mode, glasses, speech, camera) |
| `src/components/dashboard/DashboardSidebar.tsx` | Responsive sidebar navigation (6 mode buttons) |
| `src/components/dashboard/ContentArea.tsx` | Routes active mode to the correct mode component |
| `src/components/modes/IdentifyMode.tsx` | Take photo → AI identifies object (SSE streaming) |
| `src/components/modes/HelpMode.tsx` | Photo + voice/text → AI help response |
| `src/components/modes/NotesMode.tsx` | Two tabs: photo tagging session, video recording + transcription |
| `src/components/modes/LiveStreamMode.tsx` | Stream glasses camera to web viewers via Agora |
| `src/components/modes/TeaCheckerMode.tsx` | Tea analysis mode (placeholder) |
| `src/components/modes/ConfigMode.tsx` | Parking timer + disconnect button |
| `src/components/shared/ModeHeader.tsx` | Title + subtitle header for each mode |
| `src/components/shared/CameraPreview.tsx` | Displays base64 captured image or placeholder |
| `src/components/shared/AIResponseDisplay.tsx` | Shows AI response with status, error, and clear button |
| `src/components/shared/RecordingIndicator.tsx` | Red dot + "Recording..." label |
| `src/components/shared/ActionButton.tsx` | Reusable button (primary, secondary, danger, success variants) |
| `src/types/dashboard.ts` | `DashboardMode` type definition |
| `src/types/tagging.ts` | TaggedImage type + keyword detection functions |
| `src/types/reactNativeFile.ts` | Interface for React Native FormData file objects |
| `src/utils/formDataHelper.ts` | Native FormData file handling (expo-file-system) |
| `src/utils/logger.ts` | Development-gated logging utility |
| `app/index.tsx` | Home screen (connect or demo mode) |
| `app/connect.tsx` | Connection management screen |
| `app/glasses/index.tsx` | Glasses dashboard wrapper (loading screen → mounts `DashboardLayout`) |
| `app/glasses/display.tsx` | Display settings (brightness, always-on) |
| `app/glasses/input.tsx` | Input event monitor + emulation controls |

### Web Platform-Split Files
| File | Native Counterpart | What Changes |
|------|-------------------|-------------|
| `modules/xr-glasses/index.web.ts` | `index.ts` | Stubs native module |
| `modules/xr-glasses/src/XRGlassesModule.web.ts` | `XRGlassesModule.ts` | `WebXRGlassesService` (browser APIs) |
| `src/utils/formDataHelper.web.ts` | `formDataHelper.ts` | Blob + download instead of expo-file-system |
| `src/services/errorReporting.web.ts` | `errorReporting.ts` | `window` event listeners instead of RN polyfill |

---

## Quick Commands

```bash
# Build release APK (Android)
export ANDROID_HOME=~/Android/Sdk
cd android && ./gradlew clean && ./gradlew assembleRelease

# APK location
android/app/build/outputs/apk/release/app-release.apk

# List emulators
~/Android/Sdk/platform-tools/adb devices -l

# Install on phone emulator (phone is usually 5556, glasses is 5554)
~/Android/Sdk/platform-tools/adb -s emulator-5556 install -r android/app/build/outputs/apk/release/app-release.apk

# Watch XR logs
~/Android/Sdk/platform-tools/adb -s emulator-5556 logcat | grep -iE "XRGlassesService|GlassesActivity|ProjectionLauncher"

# Run web dev server
npm run web   # or: npx expo start --web
# Opens at http://localhost:8081

# Deploy web demo to production (see docs/maintenance/web-deployment.md)
./scripts/deploy-web.sh

# Deploy Cloudflare Worker
cd cloudflare-workers && npm run deploy

# Type check (all platforms)
npx tsc --noEmit
```

---

## Troubleshooting

For detailed troubleshooting, see the maintenance docs:

| Issue | See |
|-------|-----|
| Phone UI broken after connect | [maintenance/xr-glasses-projection.md](maintenance/xr-glasses-projection.md) |
| Speech recognition not working | [maintenance/speech-recognition.md](maintenance/speech-recognition.md) |
| Camera issues | [maintenance/camera-capture.md](maintenance/camera-capture.md) |
| Remote view grey/black video | [maintenance/remote-view-streaming.md](maintenance/remote-view-streaming.md) |
| Emulator problems | [maintenance/emulator-testing.md](maintenance/emulator-testing.md) |
| Build failures | [maintenance/build-deploy.md](maintenance/build-deploy.md) |
| Web platform issues | [maintenance/web-platform.md](maintenance/web-platform.md) |

---

## Related Repositories

| Repository | Location | Description |
|------------|----------|-------------|
| **spex** (this repo) | `~/coding/spex` | Main React Native app + native modules |
| **spex-web-viewer** | `~/coding/spex-web-viewer` | Vite + TS web viewer (Cloudflare Pages) — lobby, participant grid, recording, transcription |
| **SuperSpexWins** | `~/coding/backend-with-testing-frontend/SuperSpexWins` | FastAPI backend (transcription, tagging, AI) — runs locally during dev |
| **cloudflare-workers** | `~/coding/spex/cloudflare-workers` | Agora token server + viewer presence (NOT transcription) |

---

## Notes

- Jetpack XR library versions may change - check Maven for latest
- Android XR requires API 30+ minimum, API 36 for full features
- See `CLAUDE.md` for emulator setup instructions
- See `docs/maintenance/` for troubleshooting guides
