# Maintenance Documentation

This folder contains troubleshooting guides and maintenance documentation for each module/feature of the XR Glasses app.

## Quick Links

| Document | Description | When to Read |
|----------|-------------|--------------|
| [xr-glasses-projection.md](xr-glasses-projection.md) | **CRITICAL** - How projection works with separate process | Phone UI broken after connecting |
| [speech-recognition.md](speech-recognition.md) | Speech recognition architecture & troubleshooting | Speech not working |
| [camera-capture.md](camera-capture.md) | Camera capture system & issues | Camera not capturing |
| [emulator-testing.md](emulator-testing.md) | Emulator setup, pairing, known issues | Emulator problems |
| [build-deploy.md](build-deploy.md) | Build process, installation, dependencies | Build failing |

## Critical Knowledge

### The Most Important Thing to Know

**XR activities MUST run in a separate Android process** (`:xr_process`). Without this, the Android XR SDK corrupts React Native's rendering.

```xml
<!-- In AndroidManifest.xml -->
<activity android:name=".ProjectionLauncherActivity" android:process=":xr_process" ... />
<activity android:name=".glasses.GlassesActivity" android:process=":xr_process" ... />
```

See [xr-glasses-projection.md](xr-glasses-projection.md) for full details.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                             │
│  React Native App + XRGlassesModule + XRGlassesService      │
│  (Phone UI - must stay isolated from XR SDK)                │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Intent (IPC)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    :xr_process (SEPARATE)                    │
│  ProjectionLauncherActivity + GlassesActivity               │
│  (All XR SDK calls happen here)                             │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting Quick Reference

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Phone UI text missing | XR process isolation broken | Check `android:process=":xr_process"` in manifest |
| Glasses not projecting | Display not woken | Press glasses button in emulator |
| Speech not working | Emulator limitation | Use real glasses or phone emulator |
| Camera stopped working | Emulator resource leak | Restart phone emulator |
| Connect fails | Pairing lost | Re-pair in Glasses companion app |
| Build fails | Stale cache | Run `./gradlew clean` |

## Adding New Maintenance Docs

When adding a new feature or module, create a maintenance doc with:

1. **Overview** - What the feature does
2. **Architecture** - How it works (diagram if complex)
3. **Key Files** - Where the code lives
4. **Common Issues & Fixes** - Troubleshooting guide
5. **Testing Checklist** - How to verify it works

Use the existing docs as templates.
