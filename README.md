# SUPER SPEX

AI-powered glasses companion app built with **React Native (Expo)** and **Kotlin native modules** for **Android XR**. The phone is the hub; glasses are the display.

Open-sourced by [SuperEngineer](https://github.com/super-engineer-app) to showcase the **Jetpack XR SDK** and help developers build their own XR glasses applications.

## Features

- **XR Glasses Projection** — Display content on connected XR glasses via Jetpack XR SDK
- **AI-Powered Modes** — Speech recognition, camera capture, tagging, and AI generation
- **Remote View Streaming** — Stream glasses view to web viewers via Agora RTC (two-way audio/video)
- **Web Demo** — Same app runs in the browser via platform-split files (`.web.ts` / `.ts`)
- **Parking Timer** — Timer with glasses display and phone notifications

## Demo

<table>
  <tr>
    <td align="center"><b>Help Mode</b></td>
    <td align="center"><b>Identify Mode</b></td>
    <td align="center"><b>Photo Note</b></td>
  </tr>
  <tr>
    <td><video src="videos/help-mode.mp4" controls width="250"></video></td>
    <td><video src="videos/identify-mode.mp4" controls width="250"></video></td>
    <td><video src="videos/photo-note.mp4" controls width="250"></video></td>
  </tr>
  <tr>
    <td>Take a photo and ask a question about it — AI streams back an answer via speech and text. <br><code>src/components/modes/HelpMode.tsx</code></td>
    <td>Snap a photo and AI identifies what's in frame, streaming results to the glasses display. <br><code>src/components/modes/IdentifyMode.tsx</code></td>
    <td>Capture a photo while dictating — speech and image are tagged and saved as a note. <br><code>src/components/modes/NotesMode.tsx</code></td>
  </tr>
  <tr>
    <td align="center"><b>Video Note</b></td>
    <td align="center"><b>Live Stream</b></td>
    <td></td>
  </tr>
  <tr>
    <td><video src="videos/video-note.mp4" controls width="250"></video></td>
    <td><video src="videos/live-stream.mp4" controls width="250"></video></td>
    <td></td>
  </tr>
  <tr>
    <td>Record video with continuous speech transcription — everything is saved as a timestamped note. <br><code>src/components/modes/NotesMode.tsx</code></td>
    <td>Stream the glasses camera and audio to a shareable web link via Agora RTC, with live viewer count. <br><code>src/components/modes/LiveStreamMode.tsx</code></td>
    <td></td>
  </tr>
</table>

## Tech Stack

- **TypeScript** — UI, services, hooks. Platform-split files (`.web.ts` / `.ts`) for cross-platform.
- **Kotlin** — XR glasses integration via Jetpack XR SDK. Lives in `modules/xr-glasses/android/`.
- **Cloudflare Workers** — Agora token server and viewer tracking (`cloudflare-workers/`).

## Prerequisites

- Node.js 18+
- Android SDK (API 36 for full XR features, API 30 minimum)
- Java 17
- An [Agora](https://www.agora.io/) account (for streaming features)

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template and fill in your values
cp .env.example .env

# Start development server
npx expo start

# Build and run on Android device/emulator
npx expo run:android
```

## Building a Release APK

```bash
# Generate the Android project (if not already done)
npx expo prebuild --platform android

# Clean and build
cd android && ./gradlew clean && ./gradlew assembleRelease

# APK output location:
# android/app/build/outputs/apk/release/app-release.apk

# Install on connected device/emulator
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## Deploying the Cloudflare Worker

The Agora token server lives at `cloudflare-workers/`:

```bash
cd cloudflare-workers
npm install
npm run deploy

# Set secrets (first time or rotation)
npx wrangler secret put AGORA_APP_ID
npx wrangler secret put AGORA_APP_CERTIFICATE
npx wrangler secret put API_KEY
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. See the example file for all required variables.

## Verification

```bash
npx tsc --noEmit                              # TypeScript — zero errors required
cd android && ./gradlew ktlintCheck detekt    # Kotlin (after touching .kt files)
```

## Project Structure

```
├── app/                    # Expo Router screens
├── src/
│   ├── components/         # React components (modes, UI)
│   ├── hooks/              # Custom hooks (useXRGlasses, useSpeech, etc.)
│   ├── services/           # API clients, platform services
│   └── types/              # TypeScript type definitions
├── modules/xr-glasses/     # Expo native module
│   └── android/src/main/java/expo/modules/xrglasses/
│       ├── XRGlassesModule.kt        # Expo bridge
│       ├── XRGlassesService.kt       # Connection management
│       ├── glasses/                   # Compose UI for glasses display
│       ├── stream/                    # Agora RTC streaming
│       └── projection/               # Jetpack XR projection
├── cloudflare-workers/     # Agora token server (Cloudflare Worker)
└── docs/                   # Architecture and maintenance docs
```

## Documentation

| Area | Doc |
|------|-----|
| System overview | `docs/architecture.md` |
| Key files & commands | `docs/reference.md` |
| Troubleshooting | `docs/maintenance/README.md` |
| XR / projection | `docs/maintenance/xr-glasses-projection.md` |
| Streaming (Agora) | `docs/maintenance/remote-view-streaming.md` |
| Build & deploy | `docs/maintenance/build-deploy.md` |
| Camera system | `docs/maintenance/camera-capture.md` |
| Speech recognition | `docs/maintenance/speech-recognition.md` |

## Architecture Highlights

- **Process separation**: XR activities run in `:xr_process` to avoid corrupting React Native rendering
- **Platform-split files**: `.web.ts` / `.ts` for cross-platform (browser vs native)
- **Expo native module**: Kotlin native module bridges XR SDK to React Native via events
- **CameraX integration**: Shared camera provider for photo capture and video streaming

See `docs/architecture.md` for the full system design.

## Contact

- Website: [superengineer.app](https://www.superengineer.app/about)
- Email: team@superengineer.app

## License

This project is open source. See [LICENSE](LICENSE) for details.
