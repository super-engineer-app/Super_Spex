# SUPER SPEX

Super Spex is an AI-powered glasses companion app built with **React Native (Expo)** and **Kotlin native modules** for **Android XR**. The phone is the hub; glasses are the display.

The app includes ‘modes’ built around workflows designed specifically for use by tradespeople / field technicians - enabling them to do handsfree work using AI Glasses powered by the Android XR toolset + AI.

AI answers are streamed via [SuperEngineer](https://www.superengineer.app) – an Gemini-based multi-agent RAG wrapper focused on providing technical answers - inc data sourced from 1000’s of technical instruction manuals.

Open-sourced by [SuperEngineer](https://github.com/super-engineer-app) to showcase the **Jetpack XR SDK** and help developers build their own XR glasses applications.

## Features

- **XR Glasses Projection** — Display content on connected XR glasses via Jetpack XR SDK
- **AI-Powered Modes** — Speech recognition, camera capture, tagging, and AI generation
- **Remote View Streaming** — Stream glasses view to web viewers via Agora RTC (two-way audio/video)
- **Web Demo** — Same app runs in the browser via platform-split files (`.web.ts` / `.ts`)
- **Parking Timer** — Timer with glasses display and phone notifications

## Demo

### Setup
Connect the phone to XR glasses and pair the devices.


https://github.com/user-attachments/assets/73d9e9bc-1cea-4528-bd9b-ed22e29044f4


<!-- setup.mp4 -->

### Help Mode
Take a photo and ask a question about it — AI streams back an answer via speech and text.


https://github.com/user-attachments/assets/b233342f-4695-4a9d-a9a0-2970046633ae


<!-- help.mp4 -->

### Identify Mode
Snap a photo and AI identifies what's in frame, streaming results to the glasses display.


https://github.com/user-attachments/assets/b174ea32-4c11-4c27-a996-7e167565c01b


<!-- identify.mp4 -->

### Photo Note
Capture a photo while dictating — speech and image are tagged and saved as a note.


https://github.com/user-attachments/assets/ea00aa60-4f07-4758-889c-e72d8eeaed54


<!-- photo-note.mp4 -->

### Video Note
Record video with continuous speech transcription — everything is saved as a timestamped note.


https://github.com/user-attachments/assets/9d548a3a-d34f-4f69-ba52-6cefe6508b2d


<!-- video-note.mp4 -->

### Timer
Set a parking timer with glasses display and phone notifications.


https://github.com/user-attachments/assets/c901b700-7126-4bc7-b9d8-a069bb193c09


<!-- timer.mp4 -->

### Live Stream
Stream the glasses camera and audio to a shareable web link via Agora RTC, with live viewer count.



https://github.com/user-attachments/assets/9a4c8076-a3d3-45f4-9701-011bc3425792



### Projection on glasses
Project the view to glasses emulation.


https://github.com/user-attachments/assets/131e0761-01f5-4e0b-be71-4b8c876652cc



### Tea Mode
Make the perfect cup of tea for your colleague - using the magic of AI Glasses! (Trades are powered by tea!)


https://github.com/user-attachments/assets/6b0b360d-be69-4cdd-a269-9a9ba4d2cea3


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

- Website: [superengineer.app](https://www.superengineer.app)
- Email: team@superengineer.app

## License

This project is open source and under the Apache License 2.0 [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt).  See [LICENSE](LICENSE) for details.  This repository includes code that interfaces with Agora RTC and Android Jetpack XR. Use of these SDKs is subject to their respective terms of service. You must obtain your own API keys and ensure compliance with their licenses when building this application.


