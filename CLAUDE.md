# SPEX

## Why

Android app for AI-powered glasses. The phone is the hub; glasses are the display. Also runs as a web demo.

## What

React Native (Expo) + Kotlin native modules. Two languages, one codebase:

- **TypeScript** — UI, services, hooks. Platform-split files (`.web.ts` / `.ts`) for cross-platform.
- **Kotlin** — XR glasses integration via Jetpack XR SDK. Lives in `modules/xr-glasses/android/`.

## How

Verify after every change:
```bash
npx tsc --noEmit   # Zero errors required before any deploy
```

Kotlin verification (after touching `.kt` files):
```bash
cd android && ./gradlew ktlintCheck detekt
```

Build and deploy — read the relevant doc first:
- Android: `docs/maintenance/build-deploy.md`
- Web demo: `docs/maintenance/web-deployment.md`
- Cloudflare Worker: `cd cloudflare-workers && npm run deploy`
- Web Viewer (separate repo): `~/coding/spex-web-viewer/` — see its own `CLAUDE.md`

## Hard Rules

These prevent real breakage. Non-negotiable:

1. **XR code is Kotlin-only.** The Jetpack XR SDK cannot be called from JavaScript. Never import XR classes in TypeScript.
2. **XR activities run in `:xr_process`.** The XR SDK corrupts React Native rendering if they share a process. Read `docs/maintenance/xr-glasses-projection.md` before touching projection code.
3. **No web-only APIs in React Native code.** `Blob`, `FormData` with Blob, etc. don't work. Use platform-split files when behavior must differ.
4. **Commit a save point before risky or large-scale changes.** Don't commit routinely after small changes.

## Linting

- **TypeScript/JS**: Biome runs automatically via PostToolUse hook — no manual step needed.
- **Kotlin**: Run `cd android && ./gradlew ktlintCheck detekt` after changes. Use `./gradlew ktlintFormat` to auto-fix.

## Context

Read the relevant doc before working in an area — don't load them all:

| Area | Doc |
|------|-----|
| System overview | `docs/architecture.md` |
| Key files & commands | `docs/reference.md` |
| Troubleshooting | `docs/maintenance/README.md` |
| XR / projection | `docs/maintenance/xr-glasses-projection.md` |
| Speech | `docs/maintenance/speech-recognition.md` |
| Camera | `docs/maintenance/camera-capture.md` |
| Streaming | `docs/maintenance/remote-view-streaming.md` |
| Recording | `docs/maintenance/video-recording.md` |
| Tagging | `docs/maintenance/tagging-system.md` |
| Web platform | `docs/maintenance/web-platform.md` |
| Web deployment | `docs/maintenance/web-deployment.md` |
| Emulator setup | `docs/maintenance/emulator-testing.md` |
| Build failures | `docs/maintenance/build-deploy.md` |
| Service URLs & env vars | `docs/maintenance/web-deployment.md` |
