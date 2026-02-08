# SPEX - Claude Code Instructions

## What This Is

React Native (Expo) app for Android that communicates with AI glasses via the Jetpack XR SDK. The phone is the hub; glasses are the display. Also runs as a web demo.

Before risky or large-scale changes, commit the current working state as a save point. Don't commit routinely after every small change.

## Critical Architecture Rules

**1. All XR features MUST be native Kotlin modules.**
The Jetpack XR SDK is Android-native and cannot be called from JavaScript.
- XR code lives in: `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/`
- React Native receives data via events emitted from Kotlin
- Never import Jetpack XR classes in TypeScript

**2. XR activities MUST run in a separate Android process (`:xr_process`).**
The XR SDK corrupts React Native rendering if they share a process. This is non-negotiable.
- Read `docs/maintenance/xr-glasses-projection.md` before touching ANY projection code

## Code Standards

**Quality over speed.** Never take shortcuts that sacrifice correctness, safety, or maintainability. When facing a design choice with trade-offs, ask the user before proceeding.

- **TypeScript**: Never use `any`. Avoid `as` assertions unless necessary with a comment.
- **Kotlin**: Never use `!!` — use `?.` or `?:`. Use sealed classes for exhaustive `when`.
- **Both**: No race conditions. Handle all errors explicitly. No silent failures, no resource leaks.
- Code should be self-documenting. Keep files focused and modular.
- Always write new code in TypeScript. Migrate existing JS to TS if scope allows.
- Always run `npx tsc --noEmit` after changes — deploy only after zero type errors.
- When fixing React Native issues, never use web-only APIs (Blob, FormData with Blob, etc.).
- Never modify working code paths without confirming they're actually broken.

## Research Before Implementation

- Read official docs before implementing new features or integrating libraries
- If official docs contradict existing code patterns, flag it to the user
- On any significant design choice, verify the approach with the user first

## Build & Deploy

**Android:** See `docs/maintenance/build-deploy.md` for full build commands. Quick reference:
```bash
export ANDROID_HOME=~/Android/Sdk
cd android && ./gradlew clean && ./gradlew assembleRelease
```

**Web demo:** See `docs/maintenance/web-deployment.md` for full deployment guide. Quick reference:
```bash
./scripts/deploy-web.sh
```

**Cloudflare Worker:** Source at `cloudflare-workers/`. Deploy with `cd cloudflare-workers && npm run deploy`.

## Documentation

Read these when relevant — don't load them all upfront:

| When | Read |
|------|------|
| System overview | `docs/architecture.md` |
| Key files, commands, repos | `docs/reference.md` |
| Something broken | `docs/maintenance/README.md` (troubleshooting matrix) |
| XR/projection code | `docs/maintenance/xr-glasses-projection.md` |
| Speech issues | `docs/maintenance/speech-recognition.md` |
| Camera issues | `docs/maintenance/camera-capture.md` |
| Streaming issues | `docs/maintenance/remote-view-streaming.md` |
| Recording/transcription | `docs/maintenance/video-recording.md` |
| Tagging system | `docs/maintenance/tagging-system.md` |
| Web platform (dev) | `docs/maintenance/web-platform.md` |
| Web deployment (prod) | `docs/maintenance/web-deployment.md` |
| Emulator setup | `docs/maintenance/emulator-testing.md` |
| Android build failures | `docs/maintenance/build-deploy.md` |
| Android XR SDK links | `docs/xr-glasses-resources.md` |
| Service URLs & env vars | `docs/maintenance/web-deployment.md` (Services table) |
| Backend source & API | `~/coding/backend-with-testing-frontend/SuperSpexWins` |
| Cloudflare Worker source | `cloudflare-workers/src/index.ts` |
| Error reporting setup | `src/services/errorReporting.ts` (native), `errorReporting.web.ts` (web) |
