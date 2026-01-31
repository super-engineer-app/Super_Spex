# XR Glasses Projection Fix - Session Continuation Prompt

## Project Overview

This is a React Native (Expo) app for Android that connects to XR AI Glasses via Jetpack XR SDK. The app has two parallel UIs:
1. **Phone UI** - React Native app running on the phone (controls, audio capture, image capture, send to AI)
2. **Glasses UI** - Native Kotlin/Compose activity (`GlassesActivity`) that should project onto the glasses display

## The Problem We're Solving

When connecting to real XR glasses (not emulation), we need BOTH:
1. The phone UI to render correctly (React Native)
2. The glasses UI to project onto the glasses display (GlassesActivity)

**Current Issue:** We cannot get both working simultaneously. Either:
- Phone UI works but glasses show nothing (current state)
- Glasses projection works but phone UI is completely broken (text doesn't render in buttons)

## What We Discovered

### Root Cause Identified
The `launchGlassesActivity()` method was using `createProjectedDeviceContext(activity)` with the React Native MainActivity. This was **corrupting React Native's display/rendering context**, causing all Text components inside buttons to not render (only backgrounds visible).

### Test Results

1. **Emulation Mode** - Phone UI works perfectly ✅
2. **Real Connection WITHOUT launching GlassesActivity** - Phone UI works perfectly ✅
3. **Real Connection WITH original launchGlassesActivity()** - Phone UI broken ❌ (but glasses projection worked)
4. **Real Connection WITH simplified launchGlassesActivity()** - Phone UI works ✅, but glasses show nothing ❌

## What We Tried

### Original Launch Method (broke phone UI):
```kotlin
private fun launchGlassesActivity() {
    val projectedContextClass = Class.forName("androidx.xr.projected.ProjectedContext")
    val createDeviceContextMethod = projectedContextClass.methods.find {
        it.name == "createProjectedDeviceContext"
    }
    val createOptionsMethod = projectedContextClass.methods.find {
        it.name == "createProjectedActivityOptions"
    }

    // THIS BREAKS REACT NATIVE:
    val projectedDeviceContext = createDeviceContextMethod.invoke(null, activity)
    val options = createOptionsMethod.invoke(null, projectedDeviceContext)

    val intent = Intent(activity, GlassesActivity::class.java)
    val bundle = options.toBundle()
    activity.startActivity(intent, bundle)  // Projection works, but phone UI broken
}
```

### Simplified Launch Method (phone UI works, no projection):
```kotlin
private fun launchGlassesActivity() {
    val intent = Intent(context, GlassesActivity::class.java).apply {
        action = "expo.modules.xrglasses.LAUNCH_GLASSES"
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)  // Phone UI works, but no projection
}
```

## Key Files

### Phone UI (React Native)
- `app/index.tsx` - Home screen with "Connect Glasses" and "Connect Emulation" buttons
- `app/glasses/index.tsx` - Dashboard with audio capture, image capture, send to AI, disconnect

### Native Module (Kotlin)
- `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/XRGlassesService.kt` - Main service handling connection and launching GlassesActivity
- `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/glasses/GlassesActivity.kt` - The activity that should render on glasses

### Manifest Declaration
```xml
<activity
    android:name=".glasses.GlassesActivity"
    android:exported="true"
    android:requiredDisplayCategory="xr_projected"
    android:theme="@style/Theme.Glasses">
    <intent-filter>
        <action android:name="expo.modules.xrglasses.LAUNCH_GLASSES" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
</activity>
```

## Documentation Resources

Read these files for official Android XR projection documentation:
- `docs/xr-glasses-resources.md` - Contains official Jetpack XR SDK documentation and examples
- `docs/architecture.md` - Current architecture decisions
- `docs/reference.md` - API reference

## Next Steps - What Needs Research

1. **Read the projection documentation** in `docs/xr-glasses-resources.md` thoroughly

2. **Find the correct way to launch a projected activity** that:
   - Does NOT use the main React Native activity for `createProjectedDeviceContext()`
   - Still properly routes the GlassesActivity to the glasses display (Display 7)

3. **Possible solutions to investigate:**
   - Can we create the projected device context from APPLICATION context instead of activity?
   - Can we have GlassesActivity configure itself for projection after launch?
   - Is there a way to use `android:requiredDisplayCategory="xr_projected"` alone without explicit options?
   - Can we launch via a separate non-React-Native activity that handles the projection setup?
   - Is there a different API pattern for projected activities in the SDK?

4. **Test emulator setup:**
   - Phone emulator: emulator-5554 (sdk_gphone64_x86_64) - CANARY image with Glasses companion app
   - Glasses emulator: emulator-5556 (sdk_glasses_x86_64)
   - They are paired and working

## Build & Test Commands

```bash
# Set Android SDK
export ANDROID_HOME=~/Android/Sdk

# Clean build
cd android && ./gradlew clean && ./gradlew assembleRelease

# Uninstall and install fresh
~/Android/Sdk/platform-tools/adb -s emulator-5554 uninstall com.xrglasses.app
~/Android/Sdk/platform-tools/adb -s emulator-5554 install android/app/build/outputs/apk/release/app-release.apk

# Watch logs
~/Android/Sdk/platform-tools/adb -s emulator-5554 logcat | grep -iE "XRGlassesService|GlassesActivity|Projected"
```

## Success Criteria

The fix is successful when:
1. ✅ Phone UI renders correctly (all text visible in buttons)
2. ✅ Glasses display shows the GlassesActivity UI when connected
3. ✅ Audio capture works on phone
4. ✅ Image capture works (from glasses camera ideally, or phone as fallback)
5. ✅ Both UIs work simultaneously

## Constraints

- All Android XR features MUST be in native Kotlin (not JavaScript)
- React Native runs on phone display only
- GlassesActivity uses Jetpack Compose (Glimmer) for glasses display
- Cannot modify how React Native handles its main activity
- Must use Jetpack XR SDK patterns (not deprecated APIs)

## Current Git Status

Branch: `dev-main`
Recent commits show progression through getting projection working initially, then breaking it while fixing phone UI.

---

## Key Insight from Official Docs

The official sample pattern (from `docs/xr-glasses-resources.md` lines 45-52) is:
```kotlin
val projectedContext = ProjectedContext.createProjectedDeviceContext(activity)
val options = ProjectedContext.createProjectedActivityOptions(projectedContext)
val intent = Intent(activity, GlassesActivity::class.java).apply {
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
activity.startActivity(intent, options.toBundle())
```

**THE PROBLEM:** This pattern works in pure native Android apps, but when the `activity` is React Native's MainActivity, it corrupts React Native's rendering context.

**POSSIBLE APPROACHES TO RESEARCH:**

1. **Intermediate Activity Approach** - Create a lightweight native Android activity that:
   - React Native navigates to it
   - It creates the projected context from itself (not React Native)
   - It launches GlassesActivity with proper options
   - Then finishes itself or stays as a bridge

2. **Application Context** - Can we use `createProjectedDeviceContext()` with application context instead of activity context?

3. **Self-Configuring GlassesActivity** - Can GlassesActivity detect it's on the projected display and configure itself without needing launch options?

4. **Different Launch Pattern** - The manifest has:
   ```xml
   <category android:name="androidx.xr.projected.CATEGORY_PROJECTED"/>
   ```
   Maybe there's a way to use this category to auto-route without explicit options?

5. **Delayed Context Creation** - What if we delay creating the projected context until after React Native has finished its initial render?

---

**START HERE:**
1. Read `docs/xr-glasses-resources.md` thoroughly
2. Fetch the official documentation URLs listed there (especially "First Activity for AI Glasses")
3. Find a way to launch GlassesActivity onto the projected display that doesn't corrupt React Native's MainActivity
