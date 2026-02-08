# SPEX - Claude Code Instructions

## What This Is

React Native (Expo) app for Android that communicates with AI glasses via the Jetpack XR SDK. The phone is the hub; glasses are the display.

Before risky or large-scale changes, commit the current working state as a save point. Don't commit routinely after every small change.

## Critical Architecture Rules

**1. All XR features MUST be native Kotlin modules.**
The Jetpack XR SDK is Android-native and cannot be called from JavaScript.
```
React Native (TypeScript) → Expo Native Module (Kotlin) → Jetpack XR SDK → AI Glasses
```
- XR code lives in: `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/`
- React Native receives data via events emitted from Kotlin
- Never import Jetpack XR classes in TypeScript

**2. XR activities MUST run in a separate Android process (`:xr_process`).**
The XR SDK corrupts React Native rendering if they share a process. This is non-negotiable.
- `ProjectionLauncherActivity` and `GlassesActivity` → `:xr_process`
- `XRGlassesService`, `XRGlassesModule`, camera managers, Agora → main process
- IPC uses broadcasts with `setPackage(packageName)`
- `SharedCameraProvider` (main process) is the `ProjectedContext` camera accessor — both `GlassesCameraManager` (image capture) and `StreamingCameraManager` (video streaming) delegate to it
- Read `docs/maintenance/xr-glasses-projection.md` before touching ANY projection code

## Code Standards

**Quality over speed.** Never take shortcuts that sacrifice correctness, safety, or maintainability. When facing a design choice with trade-offs, ask the user before proceeding.

**Strict type & runtime safety:**
- **TypeScript**: Never use `any` — use proper types, `unknown`, or generics. Avoid `as` assertions unless necessary with a comment.
- **Kotlin**: Never use `!!` — use `?.` or `?:`. Use sealed classes for exhaustive `when`.
- **Both**: No race conditions (use synchronization/mutex/atomic). Handle all errors explicitly. No silent failures, no resource leaks.

**Clear, self-documenting code:** Use descriptive names for variables, functions, and types. Code should read without needing comments. Keep files focused and modular — split when responsibilities diverge.

Before deploying, trace through the complete code path from user action to network response. Verify every API call exists, every type is correct, and test with `npx tsc --noEmit`. Only deploy after zero type errors.

When fixing React Native issues, never use web-only APIs (Blob, FormData with Blob, etc.). Always use RN-specific patterns like `{uri, type, name}` for FormData file uploads.
Never modify working code paths to debug an issue without confirming the code path is actually broken. If the user says something is already working, stop and revert immediately.
This project uses TypeScript as the primary language. Always write new code in TypeScript. When touching existing JS files, migrate them to TS if scope allows.
Always run a build (`npx tsc --noEmit` or the project's build command) after making changes to catch type errors before deploying or committing.

## Research Before Implementation

- Read official documentation (via WebFetch/WebSearch) before implementing new features or integrating libraries
- If official docs contradict existing code patterns, flag it to the user
- On any significant design choice, verify the approach with the user first

## Build & Deploy

```bash
export ANDROID_HOME=~/Android/Sdk
cd android && ./gradlew clean && ./gradlew assembleRelease
```
- **Always** build release (never debug — it requires Metro bundler)
- **Always** clean before building to include JS changes
- APK: `android/app/build/outputs/apk/release/app-release.apk`
- Install to **phone** device (not glasses emulator `sdk_glasses_x86_64`):
  ```bash
  ~/Android/Sdk/platform-tools/adb -s <phone-device> install -r android/app/build/outputs/apk/release/app-release.apk
  ```

## Documentation (Progressive Disclosure)

Read these when relevant — don't load them all upfront:

| When | Read |
|------|------|
| System overview | `docs/architecture.md` |
| Key files & commands | `docs/reference.md` |
| Something broken | `docs/maintenance/README.md` (troubleshooting matrix) |
| XR/projection code | `docs/maintenance/xr-glasses-projection.md` |
| Speech issues | `docs/maintenance/speech-recognition.md` |
| Camera issues | `docs/maintenance/camera-capture.md` |
| Streaming issues | `docs/maintenance/remote-view-streaming.md` |
| Emulator setup | `docs/maintenance/emulator-testing.md` |
| Build failures | `docs/maintenance/build-deploy.md` |
| Android XR SDK links | `docs/xr-glasses-resources.md` |

## Key Services

| Service | URL / Location |
|---------|---------------|
| Agora token server | `https://agora-token.spex-remote.workers.dev/` (handles `/token`, `/ws/`, `/heartbeat`, `/leave`, `/viewers` only) |
| Web viewer | `https://spex-viewer.pages.dev/view/{channelId}` |
| Local backend | `http://0.0.0.0:8000` — transcription (`/transcribe-dia`), tagging, AI. NOT on the Cloudflare Worker. |
| Backend source | `~/coding/backend-with-testing-frontend/SuperSpexWins` |
| Web viewer source | `~/coding/spex-web-viewer/` |

## API Gotchas
- **Error reporting**: Discord webhook via `EXPO_PUBLIC_DISCORD_WEBHOOK_URL` in `.env`. Use `reportError(error, 'warning', { context })` for manual reports.
