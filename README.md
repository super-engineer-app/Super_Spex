# SPEX

AI-powered glasses companion app. The phone is the hub; glasses are the display.

## Repository Focus

This repo is the **standalone native app** (React Native + Expo + Kotlin native modules). It targets Android with XR glasses support and includes a web demo. Going forward, this repo focuses primarily on the **native Android/XR version**.

A **web-only port** of the Spex features also lives in the EngineersGambit repo (`~/coding/EngineersGambit`) under `frontend/components/spex/`. That port uses browser APIs only (no native modules) and is plain JS. See the EngineersGambit README for details.

## Shared Infrastructure

Both this repo and EngineersGambit share the following services:

| Service | URL | Source | Owner |
|---------|-----|--------|-------|
| Agora Token Worker | Set in `.env` as `AGORA_TOKEN_SERVER_URL` | `cloudflare-workers/` (this repo) | Dima |
| Web Viewer | Set in `.env` as `SPEX_VIEWER_URL_BASE` | `~/coding/spex-web-viewer/` (separate repo) | Dima |
| Spex Backend | Set in `.env` as `EXPO_PUBLIC_BACKEND_URL` | `~/coding/superspex-backend/` (separate repo) | - |

### Agora Token Worker

The Cloudflare Worker that generates Agora RTC tokens and manages real-time viewer tracking lives in **this repo** at `cloudflare-workers/`. It is deployed to Cloudflare under Dima's account.

Both the native app (this repo) and the EngineersGambit web integration use this same worker. If you redeploy or change the worker, both apps are affected.

```bash
# Deploy the worker
cd cloudflare-workers && npm run deploy

# Set secrets (first time or rotation)
cd cloudflare-workers
npx wrangler secret put AGORA_APP_ID
npx wrangler secret put AGORA_APP_CERTIFICATE
npx wrangler secret put DISCORD_WEBHOOK_URL
```

## Tech Stack

- **TypeScript** -- UI, services, hooks. Platform-split files (`.web.ts` / `.ts`) for cross-platform.
- **Kotlin** -- XR glasses integration via Jetpack XR SDK. Lives in `modules/xr-glasses/android/`.

## Quick Start

```bash
npm install
npx expo start          # Dev server
npx expo run:android    # Build and run on Android
```

## Verification

```bash
npx tsc --noEmit                              # TypeScript -- zero errors required
cd android && ./gradlew ktlintCheck detekt    # Kotlin (after touching .kt files)
```

## Documentation

| Area | Doc |
|------|-----|
| System overview | `docs/architecture.md` |
| Key files & commands | `docs/reference.md` |
| Troubleshooting | `docs/maintenance/README.md` |
| XR / projection | `docs/maintenance/xr-glasses-projection.md` |
| Streaming (Agora) | `docs/maintenance/remote-view-streaming.md` |
| Web deployment | `docs/maintenance/web-deployment.md` |
| Build & deploy | `docs/maintenance/build-deploy.md` |

## Related Repositories

| Repository | Location | Description |
|------------|----------|-------------|
| **spex** (this repo) | `~/coding/spex` | Native app + Cloudflare Worker |
| **EngineersGambit** | `~/coding/EngineersGambit` | Web platform -- Spex features ported as JS under `frontend/components/spex/` |
| **spex-web-viewer** | `~/coding/spex-web-viewer` | Standalone web viewer for Remote View streams |
| **superspex-backend** | `~/coding/superspex-backend` | AI backend (Render) |
