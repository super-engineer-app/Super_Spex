# XR Glasses App - Progress & Next Steps

## Current Status (2026-01-29)

### Completed
- [x] React Native app with Expo
- [x] Native Android module (Kotlin) with Jetpack XR SDK
- [x] Event system working (Expo EventEmitter)
- [x] Emulation mode for UI testing
- [x] Brightness controls
- [x] Input event simulation
- [x] SDK detection working (ProjectedActivityCompat found)

### Current Blocker
**Phone emulator lacks XR system service**

Error: `System doesn't include a service supporting Projected XR devices`

The Pixel phone emulator is a regular phone - it doesn't have the XR companion service needed to connect to glasses.

---

## Is This App Useless?

**No.** The app follows the standard Android XR companion app pattern:

1. **Target users**: People who buy Android XR glasses (Samsung, Google partners)
2. **These glasses come with**: Phones that have the XR companion service pre-installed, OR manufacturer companion apps that provide this service
3. **Similar to**: Smartwatch companion apps - you need both the watch AND a compatible phone

The app works correctly - it just needs the right hardware/emulator combination.

---

## Next Steps to Verify Real XR Connection

### Option 1: Correct Phone AVD Setup (RECOMMENDED)
**You have Android Studio Canary - but need the right phone system image!**

**The Problem:**
Your Pixel_8 AVD uses `android-36/google_apis_playstore` - a regular phone image.
You need **API CANARY Preview** system image which includes the Glasses companion app.

**Steps in Android Studio Panda Canary 2:**

1. **Open SDK Manager**
   - `Tools → SDK Manager`
   - Go to **SDK Platforms** tab
   - Check **"Show Package Details"** (bottom right checkbox)

2. **Find API CANARY Preview**
   - Look for **"Android V (CANARY Preview)"** or similar bleeding-edge API
   - If not visible, go to `File → Settings → Appearance & Behavior → System Settings → Android SDK`
   - Check the "Early Access Preview" checkbox if available

3. **Download the system image**
   - Under CANARY Preview, expand it
   - Download: **Google Play Intel x86_64 Atom System Image**

4. **Create new phone AVD**
   - `Tools → Device Manager → Create Virtual Device`
   - Select **Phone** → **Pixel 9 Pro** (or any phone)
   - Click **Next**
   - **CRITICAL:** In "Select a system image", choose **CANARY Preview** from dropdown (NOT android-36)
   - Select the **Google Play x86_64** image
   - Click **Finish**

5. **Pair emulators**
   - Start AI Glasses emulator first (emulator-5554)
   - Start the NEW phone emulator (not Pixel_8)
   - On phone, look for **Glasses** app in app drawer
   - Open it → Accept pairing requests

**Pairing process:**
1. Start AI glasses emulator
2. Start new phone emulator (with Glasses companion app)
3. Open **Glasses** app on phone
4. Accept association requests for "Glasses" and "Glasses Core"
5. Emulators are now paired

### Option 2: Run App ON the Glasses Emulator
Instead of phone→glasses, run the app directly on the AI glasses emulator:
- [ ] Install APK on AI glasses emulator (emulator-5554)
- [ ] Test if the glasses emulator has full XR capabilities
- [ ] This would test the Jetpack XR APIs directly

### Option 3: Real Hardware Testing
- [ ] Acquire Android XR glasses (when available)
- [ ] Test with a compatible companion phone
- [ ] This is the ultimate verification

### Option 4: Research Alternative Approaches
- [ ] Check if glasses emulator can pair with phone emulator via adb networking
- [ ] Look into Android XR developer documentation for emulator setup
- [ ] Consider if there's a way to mock the XR system service

---

## Code Status

### Working
- `XRGlassesService.kt` - Detects SDK, attempts connection via ProjectedActivityCompat
- `XRGlassesModule.ts` - Expo EventEmitter integration
- `useXRGlasses.ts` - React hook with capability refresh on emulation toggle
- UI screens - All functional with emulation mode

### Needs Real Hardware/Emulator to Test
- `ProjectedActivityCompat.create()` - Works but returns "no system service"
- Glasses capability querying
- Real engagement mode changes
- Real input events from glasses hardware

---

## Quick Commands

```bash
# Build release APK
export ANDROID_HOME=~/Android/Sdk
cd android && ./gradlew clean && ./gradlew assembleRelease

# APK location
android/app/build/outputs/apk/release/app-release.apk

# Install on phone emulator
adb -s emulator-5556 install -r android/app/build/outputs/apk/release/app-release.apk

# Install on glasses emulator
adb -s emulator-5554 install -r android/app/build/outputs/apk/release/app-release.apk

# Check logs
adb -s emulator-5556 logcat | grep XRGlassesService
```

---

## Architecture Reminder

```
┌─────────────────┐     ┌─────────────────┐
│  Phone App      │────▶│  XR Glasses     │
│  (React Native) │     │  (Emulator)     │
│                 │     │                 │
│  Needs XR       │     │  Has full XR    │
│  companion      │     │  capabilities   │
│  service        │     │                 │
└─────────────────┘     └─────────────────┘
        │                       │
        └───────────────────────┘
          ProjectedContext API
          (requires system service on phone)
```

The phone needs a system service to bridge to the glasses. Regular phone emulators don't have this.
