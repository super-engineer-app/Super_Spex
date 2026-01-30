# XR Glasses React Native App - Implementation Plan

## Status Summary (2026-01-30)

| Phase | Description | Status |
|-------|-------------|--------|
| 1.1 | Project Setup | ✅ COMPLETE |
| 1.2 | Native Module Structure | ✅ COMPLETE |
| 1.3 | Jetpack XR Integration | ✅ COMPLETE |
| 1.4 | React Native Bridge | ✅ COMPLETE |
| 1.5 | Connection Flow | ✅ COMPLETE |
| 2.1 | GlassesActivity + SpeechRecognizer | ✅ COMPLETE |
| 2.2 | React Native Speech Hook | ✅ COMPLETE |
| **2.3** | **Speech Recognition Testing** | 🔄 IN PROGRESS |
| 2.4 | Backend Integration | ⏳ PENDING |
| 2.5 | End-to-End Testing | ⏳ PENDING |
| 3 | Display Content on Glasses | ⏳ FUTURE |
| 4 | iOS Implementation | ⏳ FUTURE |

**Approach:** On-device SpeechRecognizer running ON THE GLASSES (not phone) for minimal latency

### Current Status Notes (2026-01-30)

**What's implemented:**
- GlassesActivity.kt - runs on glasses, handles speech recognition on glasses mic
- GlassesBroadcastReceiver.kt - receives speech events on phone
- XRGlassesService.kt - fallback phone-side speech recognition (for emulator testing)
- useSpeechRecognition.ts hook - React Native integration
- UI in app/glasses/index.tsx - Voice Input card with mic button

**Emulator limitations:**
- Glasses emulator does NOT have SpeechRecognizer available (no Google Speech Services)
- Phone-side fallback works: uses phone mic + network-based ASR
- On real AI glasses hardware, GlassesActivity will use on-device ASR with glasses mic

**Next step:** Test speech recognition on phone emulator (phone mic → network ASR → transcript displayed)
- Ensure emulator's microphone is enabled in Android Studio
- Test continuous listening mode
- Verify transcript appears in UI

---

## Overview

Build a React Native (Expo) app that communicates with Android XR glasses using Jetpack XR APIs, with architecture designed for future iOS cross-platform support via C++ protocol implementation.

**Current Goal:** Use on-device speech recognition from glasses microphone → Send transcribed text to backend → Return AI response to user.

---

## Critical Architecture Constraint

> **All Android XR features MUST be implemented in native Kotlin modules.**
>
> The Jetpack XR SDK (`androidx.xr.projected`, `androidx.xr.runtime`, etc.) is Android-native
> and cannot be accessed directly from React Native/JavaScript. The architecture is:
>
> ```
> React Native (TypeScript)
>        ↓ calls
> Expo Native Module (Kotlin)
>        ↓ uses
> Jetpack XR SDK (Android native)
>        ↓ communicates with
> AI Glasses Hardware
> ```
>
> **This means:**
> - `SpeechRecognizer`, `ProjectedContext`, `ProjectedActivityCompat` → Kotlin only
> - React Native receives data via events emitted from Kotlin
> - All XR-related logic lives in `modules/xr-glasses/android/`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         REACT NATIVE (Expo)                         │
│                          TypeScript/JS                              │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │   Screens   │  │ Components  │  │  State Management (Zustand) │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              useXRGlasses() Hook                             │   │
│  │         (Platform-agnostic interface)                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              XRGlassesService                                │   │
│  │    if (Platform.OS === 'android') → AndroidXRModule          │   │
│  │    if (Platform.OS === 'ios')     → IOSXRModule (C++ later)  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│   ANDROID (Phase 1)     │       │   iOS (Phase 2+)        │
│                         │       │                         │
│  Expo Module (Kotlin)   │       │  Expo Module (Swift)    │
│         │               │       │         │               │
│         ▼               │       │         ▼               │
│  Jetpack XR Library     │       │  C++ Protocol Core      │
│  (androidx.xr.projected)│       │  (reverse engineered)   │
│         │               │       │         │               │
│         ▼               │       │         ▼               │
│  Android System Service │       │  CoreBluetooth +        │
│  (AIDL → Glasses)       │       │  Network.framework      │
└─────────────────────────┘       └─────────────────────────┘
```

---

## Phase 1: Android Implementation (Weeks 1-2)

### Step 1.1: Project Setup

**Goal:** Create Expo project with native module support

```bash
# Create new Expo project with development build support
npx create-expo-app@latest xr-glasses-app --template expo-template-blank-typescript

cd xr-glasses-app

# Install Expo dev client for native module support
npx expo install expo-dev-client

# Install dependencies
npx expo install expo-modules-core
npm install zustand  # State management
```

**Directory Structure:**
```
xr-glasses-app/
├── app/                              # Expo Router screens
│   ├── _layout.tsx
│   ├── index.tsx                     # Home screen
│   ├── connect.tsx                   # Connection screen
│   └── glasses/
│       ├── _layout.tsx
│       ├── index.tsx                 # Glasses dashboard
│       ├── display.tsx               # Display controls
│       └── input.tsx                 # Input events
│
├── src/
│   ├── services/
│   │   ├── XRGlassesService.ts       # Platform-agnostic service
│   │   ├── types.ts                  # TypeScript interfaces
│   │   └── events.ts                 # Event emitter for glasses events
│   │
│   ├── hooks/
│   │   ├── useXRGlasses.ts           # Main hook
│   │   ├── useGlassesConnection.ts   # Connection state
│   │   ├── useGlassesDisplay.ts      # Display controls
│   │   └── useGlassesInput.ts        # Input events
│   │
│   ├── store/
│   │   └── glassesStore.ts           # Zustand store
│   │
│   └── components/
│       ├── ConnectionStatus.tsx
│       ├── DisplayControls.tsx
│       └── InputEventList.tsx
│
├── modules/                          # Expo native modules
│   └── xr-glasses/                   # Our native module
│       ├── index.ts                  # JS entry point
│       ├── src/
│       │   └── XRGlassesModule.ts    # Module definition
│       ├── android/
│       │   ├── build.gradle.kts
│       │   └── src/main/
│       │       ├── AndroidManifest.xml
│       │       └── java/expo/modules/xrglasses/
│       │           ├── XRGlassesModule.kt
│       │           ├── XRGlassesService.kt
│       │           ├── ProjectedContextWrapper.kt
│       │           ├── DisplayControllerWrapper.kt
│       │           └── InputEventHandler.kt
│       ├── ios/                      # Placeholder for Phase 2
│       │   └── XRGlassesModule.swift
│       └── expo-module.config.json
│
├── cpp/                              # Phase 2: Shared C++ code
│   └── .gitkeep
│
├── app.json
├── tsconfig.json
└── package.json
```

---

### Step 1.2: Create Expo Native Module

**Goal:** Set up the native module structure for Kotlin/Jetpack XR

**File: `modules/xr-glasses/expo-module.config.json`**
```json
{
  "platforms": ["android", "ios"],
  "android": {
    "modules": ["expo.modules.xrglasses.XRGlassesModule"]
  },
  "ios": {
    "modules": ["XRGlassesModule"]
  }
}
```

**File: `modules/xr-glasses/android/build.gradle.kts`**
```kotlin
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "expo.modules.xrglasses"
    compileSdk = 35

    defaultConfig {
        minSdk = 28  // Android XR requires recent API
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.22")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // Expo modules
    implementation("expo.modules:expo-modules-core:1.11.0")

    // Jetpack XR - Core
    implementation("androidx.xr:xr-runtime:1.0.0-alpha01")
    implementation("androidx.xr:xr-runtime-manifest:1.0.0-alpha01")

    // Jetpack XR - Projected
    implementation("androidx.xr:xr-projected:1.0.0-alpha01")
    implementation("androidx.xr:xr-projected-binding:1.0.0-alpha01")

    // AndroidX
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.core:core-ktx:1.12.0")
}
```

**File: `modules/xr-glasses/android/src/main/AndroidManifest.xml`**
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- XR Permissions -->
    <uses-permission android:name="android.permission.EYE_TRACKING_COARSE" />
    <uses-permission android:name="android.permission.EYE_TRACKING_FINE" />
    <uses-permission android:name="android.permission.HAND_TRACKING" />
    <uses-permission android:name="android.permission.HEAD_TRACKING" />
    <uses-permission android:name="android.permission.FACE_TRACKING" />
    <uses-permission android:name="android.permission.SCENE_UNDERSTANDING_COARSE" />
    <uses-permission android:name="android.permission.SCENE_UNDERSTANDING_FINE" />

    <!-- For packet capture debugging -->
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />

    <!-- Query for XR system services -->
    <queries>
        <intent>
            <action android:name="androidx.xr.projected.ACTION_BIND" />
        </intent>
        <intent>
            <action android:name="androidx.xr.projected.ACTION_ENGAGEMENT_BIND" />
        </intent>
    </queries>

</manifest>
```

---

### Step 1.3: Implement Kotlin Native Module

**File: `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/XRGlassesModule.kt`**
```kotlin
package expo.modules.xrglasses

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import kotlinx.coroutines.*

class XRGlassesModule : Module() {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var glassesService: XRGlassesService? = null

    override fun definition() = ModuleDefinition {
        Name("XRGlasses")

        // Events that can be sent to JS
        Events(
            "onConnectionStateChanged",
            "onInputEvent",
            "onEngagementModeChanged",
            "onDeviceStateChanged"
        )

        // Initialize the service
        Function("initialize") {
            val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "No context available", null)
            glassesService = XRGlassesService(context, this@XRGlassesModule)
        }

        // Check if this is a projected device context
        AsyncFunction("isProjectedDevice") { promise: Promise ->
            scope.launch {
                try {
                    val result = glassesService?.isProjectedDevice() ?: false
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject(CodedException("CHECK_FAILED", e.message, e))
                }
            }
        }

        // Check if glasses are connected
        AsyncFunction("isGlassesConnected") { promise: Promise ->
            scope.launch {
                try {
                    val result = glassesService?.isGlassesConnected() ?: false
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject(CodedException("CHECK_FAILED", e.message, e))
                }
            }
        }

        // Connect to glasses
        AsyncFunction("connect") { promise: Promise ->
            scope.launch {
                try {
                    glassesService?.connect()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("CONNECT_FAILED", e.message, e))
                }
            }
        }

        // Disconnect from glasses
        AsyncFunction("disconnect") { promise: Promise ->
            scope.launch {
                try {
                    glassesService?.disconnect()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("DISCONNECT_FAILED", e.message, e))
                }
            }
        }

        // Display controls
        AsyncFunction("isDisplayCapable") { promise: Promise ->
            scope.launch {
                try {
                    val result = glassesService?.isDisplayCapable() ?: false
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject(CodedException("CHECK_FAILED", e.message, e))
                }
            }
        }

        AsyncFunction("keepScreenOn") { enabled: Boolean, promise: Promise ->
            scope.launch {
                try {
                    glassesService?.setKeepScreenOn(enabled)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject(CodedException("DISPLAY_CONTROL_FAILED", e.message, e))
                }
            }
        }

        // Get current engagement mode
        AsyncFunction("getEngagementMode") { promise: Promise ->
            scope.launch {
                try {
                    val mode = glassesService?.getEngagementMode()
                    promise.resolve(mapOf(
                        "visualsOn" to (mode?.visualsOn ?: false),
                        "audioOn" to (mode?.audioOn ?: false)
                    ))
                } catch (e: Exception) {
                    promise.reject(CodedException("GET_MODE_FAILED", e.message, e))
                }
            }
        }

        // Get device capabilities
        AsyncFunction("getDeviceCapabilities") { promise: Promise ->
            scope.launch {
                try {
                    val caps = glassesService?.getDeviceCapabilities()
                    promise.resolve(caps)
                } catch (e: Exception) {
                    promise.reject(CodedException("GET_CAPS_FAILED", e.message, e))
                }
            }
        }

        // Cleanup on module destroy
        OnDestroy {
            scope.cancel()
            glassesService?.cleanup()
        }
    }

    // Helper to send events to JS
    fun sendEvent(eventName: String, data: Map<String, Any?>) {
        this@XRGlassesModule.sendEvent(eventName, data)
    }
}
```

**File: `modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/XRGlassesService.kt`**
```kotlin
package expo.modules.xrglasses

import android.content.Context
import android.view.WindowManager
import androidx.xr.projected.ProjectedContext
import androidx.xr.projected.ProjectedDisplayController
import androidx.xr.projected.ProjectedActivityCompat
import androidx.xr.projected.ProjectedInputEvent
import androidx.xr.projected.EngagementModeClient
import androidx.xr.runtime.XrDevice
import androidx.xr.runtime.manifest.ManifestFeature
import androidx.xr.runtime.manifest.ManifestPermission
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class EngagementMode(
    val visualsOn: Boolean,
    val audioOn: Boolean
)

class XRGlassesService(
    private val context: Context,
    private val module: XRGlassesModule
) {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private var displayController: ProjectedDisplayController? = null
    private var engagementModeClient: EngagementModeClient? = null
    private var isConnected = false

    // Check if running in projected device context
    suspend fun isProjectedDevice(): Boolean = withContext(Dispatchers.Main) {
        ProjectedContext.isProjectedDeviceContext(context)
    }

    // Check if glasses are connected
    suspend fun isGlassesConnected(): Boolean = withContext(Dispatchers.Main) {
        ProjectedContext.isProjectedDeviceConnected(context, Dispatchers.Main)
            .first()
    }

    // Connect to glasses services
    suspend fun connect() = withContext(Dispatchers.Main) {
        // Get projected device context
        val projectedContext = ProjectedContext.createProjectedDeviceContext(context)

        // Initialize display controller
        displayController = ProjectedDisplayController(projectedContext)

        // Initialize engagement mode client
        engagementModeClient = EngagementModeClient(projectedContext)

        // Start listening for connection state changes
        scope.launch {
            ProjectedContext.isProjectedDeviceConnected(context, Dispatchers.Main)
                .collect { connected ->
                    isConnected = connected
                    module.sendEvent("onConnectionStateChanged", mapOf(
                        "connected" to connected
                    ))
                }
        }

        // Start listening for engagement mode changes
        engagementModeClient?.let { client ->
            // Note: actual implementation depends on Jetpack XR API
            // This is a placeholder for the callback registration
        }

        isConnected = true
    }

    // Disconnect from glasses
    suspend fun disconnect() = withContext(Dispatchers.Main) {
        displayController?.close()
        displayController = null
        engagementModeClient = null
        isConnected = false

        module.sendEvent("onConnectionStateChanged", mapOf(
            "connected" to false
        ))
    }

    // Check if glasses can display visuals
    suspend fun isDisplayCapable(): Boolean = withContext(Dispatchers.Main) {
        // Use ProjectedDeviceController to check capability
        // This is based on the Jetpack XR API
        true // Placeholder - implement based on actual API
    }

    // Control screen on/off
    suspend fun setKeepScreenOn(enabled: Boolean) = withContext(Dispatchers.Main) {
        val flags = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        if (enabled) {
            displayController?.addLayoutParamsFlags(flags)
        } else {
            displayController?.removeLayoutParamsFlags(flags)
        }
    }

    // Get current engagement mode
    suspend fun getEngagementMode(): EngagementMode? = withContext(Dispatchers.Main) {
        val flags = engagementModeClient?.getEngagementModeFlags() ?: return@withContext null
        EngagementMode(
            visualsOn = (flags and EngagementModeClient.ENGAGEMENT_STATE_FLAG_VISUALS_ON) != 0,
            audioOn = (flags and EngagementModeClient.ENGAGEMENT_STATE_FLAG_AUDIO_ON) != 0
        )
    }

    // Get device capabilities
    suspend fun getDeviceCapabilities(): Map<String, Any> = withContext(Dispatchers.Main) {
        val pm = context.packageManager
        mapOf(
            "hasController" to pm.hasSystemFeature(ManifestFeature.FEATURE_XR_INPUT_CONTROLLER),
            "hasHandTracking" to pm.hasSystemFeature(ManifestFeature.FEATURE_XR_INPUT_HAND_TRACKING),
            "hasEyeTracking" to pm.hasSystemFeature(ManifestFeature.FEATURE_XR_INPUT_EYE_TRACKING),
            "hasSpatialApi" to pm.hasSystemFeature(ManifestFeature.FEATURE_XR_API_SPATIAL)
        )
    }

    fun cleanup() {
        scope.cancel()
        displayController?.close()
    }
}
```

---

### Step 1.4: TypeScript Interface Layer

**File: `modules/xr-glasses/index.ts`**
```typescript
import { NativeModule, requireNativeModule } from 'expo-modules-core';

// Define the native module interface
interface XRGlassesNativeModule extends NativeModule {
  initialize(): void;
  isProjectedDevice(): Promise<boolean>;
  isGlassesConnected(): Promise<boolean>;
  connect(): Promise<boolean>;
  disconnect(): Promise<boolean>;
  isDisplayCapable(): Promise<boolean>;
  keepScreenOn(enabled: boolean): Promise<boolean>;
  getEngagementMode(): Promise<{ visualsOn: boolean; audioOn: boolean }>;
  getDeviceCapabilities(): Promise<{
    hasController: boolean;
    hasHandTracking: boolean;
    hasEyeTracking: boolean;
    hasSpatialApi: boolean;
  }>;
}

// Export the native module
export const XRGlassesNative = requireNativeModule<XRGlassesNativeModule>('XRGlasses');

// Export event types
export type ConnectionStateEvent = { connected: boolean };
export type InputEvent = { action: string; timestamp: number };
export type EngagementModeEvent = { visualsOn: boolean; audioOn: boolean };
export type DeviceStateEvent = { state: 'INACTIVE' | 'ACTIVE' | 'DESTROYED' };
```

**File: `modules/xr-glasses/src/XRGlassesModule.ts`**
```typescript
import { EventEmitter, Subscription } from 'expo-modules-core';
import { Platform } from 'react-native';
import {
  XRGlassesNative,
  ConnectionStateEvent,
  InputEvent,
  EngagementModeEvent,
  DeviceStateEvent,
} from '../index';

// Event emitter for native events
const emitter = new EventEmitter(XRGlassesNative);

// XR Glasses Service Interface (platform-agnostic)
export interface IXRGlassesService {
  initialize(): Promise<void>;
  isProjectedDevice(): Promise<boolean>;
  isGlassesConnected(): Promise<boolean>;
  connect(): Promise<boolean>;
  disconnect(): Promise<boolean>;
  isDisplayCapable(): Promise<boolean>;
  keepScreenOn(enabled: boolean): Promise<boolean>;
  getEngagementMode(): Promise<{ visualsOn: boolean; audioOn: boolean }>;
  getDeviceCapabilities(): Promise<{
    hasController: boolean;
    hasHandTracking: boolean;
    hasEyeTracking: boolean;
    hasSpatialApi: boolean;
  }>;

  // Event subscriptions
  onConnectionStateChanged(callback: (event: ConnectionStateEvent) => void): Subscription;
  onInputEvent(callback: (event: InputEvent) => void): Subscription;
  onEngagementModeChanged(callback: (event: EngagementModeEvent) => void): Subscription;
  onDeviceStateChanged(callback: (event: DeviceStateEvent) => void): Subscription;
}

// Android implementation using Jetpack XR
class AndroidXRGlassesService implements IXRGlassesService {
  async initialize(): Promise<void> {
    XRGlassesNative.initialize();
  }

  async isProjectedDevice(): Promise<boolean> {
    return XRGlassesNative.isProjectedDevice();
  }

  async isGlassesConnected(): Promise<boolean> {
    return XRGlassesNative.isGlassesConnected();
  }

  async connect(): Promise<boolean> {
    return XRGlassesNative.connect();
  }

  async disconnect(): Promise<boolean> {
    return XRGlassesNative.disconnect();
  }

  async isDisplayCapable(): Promise<boolean> {
    return XRGlassesNative.isDisplayCapable();
  }

  async keepScreenOn(enabled: boolean): Promise<boolean> {
    return XRGlassesNative.keepScreenOn(enabled);
  }

  async getEngagementMode(): Promise<{ visualsOn: boolean; audioOn: boolean }> {
    return XRGlassesNative.getEngagementMode();
  }

  async getDeviceCapabilities(): Promise<{
    hasController: boolean;
    hasHandTracking: boolean;
    hasEyeTracking: boolean;
    hasSpatialApi: boolean;
  }> {
    return XRGlassesNative.getDeviceCapabilities();
  }

  onConnectionStateChanged(callback: (event: ConnectionStateEvent) => void): Subscription {
    return emitter.addListener('onConnectionStateChanged', callback);
  }

  onInputEvent(callback: (event: InputEvent) => void): Subscription {
    return emitter.addListener('onInputEvent', callback);
  }

  onEngagementModeChanged(callback: (event: EngagementModeEvent) => void): Subscription {
    return emitter.addListener('onEngagementModeChanged', callback);
  }

  onDeviceStateChanged(callback: (event: DeviceStateEvent) => void): Subscription {
    return emitter.addListener('onDeviceStateChanged', callback);
  }
}

// iOS stub implementation (Phase 2)
class IOSXRGlassesService implements IXRGlassesService {
  async initialize(): Promise<void> {
    console.warn('iOS XR Glasses not yet implemented');
  }

  async isProjectedDevice(): Promise<boolean> {
    return false; // iOS doesn't have projected device concept
  }

  async isGlassesConnected(): Promise<boolean> {
    // TODO: Implement via C++ protocol
    return false;
  }

  async connect(): Promise<boolean> {
    // TODO: Implement via C++ protocol
    throw new Error('iOS not yet implemented');
  }

  async disconnect(): Promise<boolean> {
    // TODO: Implement via C++ protocol
    throw new Error('iOS not yet implemented');
  }

  async isDisplayCapable(): Promise<boolean> {
    return false;
  }

  async keepScreenOn(enabled: boolean): Promise<boolean> {
    return false;
  }

  async getEngagementMode(): Promise<{ visualsOn: boolean; audioOn: boolean }> {
    return { visualsOn: false, audioOn: false };
  }

  async getDeviceCapabilities(): Promise<{
    hasController: boolean;
    hasHandTracking: boolean;
    hasEyeTracking: boolean;
    hasSpatialApi: boolean;
  }> {
    return {
      hasController: false,
      hasHandTracking: false,
      hasEyeTracking: false,
      hasSpatialApi: false,
    };
  }

  onConnectionStateChanged(callback: (event: ConnectionStateEvent) => void): Subscription {
    return { remove: () => {} };
  }

  onInputEvent(callback: (event: InputEvent) => void): Subscription {
    return { remove: () => {} };
  }

  onEngagementModeChanged(callback: (event: EngagementModeEvent) => void): Subscription {
    return { remove: () => {} };
  }

  onDeviceStateChanged(callback: (event: DeviceStateEvent) => void): Subscription {
    return { remove: () => {} };
  }
}

// Factory function - returns platform-specific implementation
export function createXRGlassesService(): IXRGlassesService {
  if (Platform.OS === 'android') {
    return new AndroidXRGlassesService();
  } else if (Platform.OS === 'ios') {
    return new IOSXRGlassesService();
  } else {
    throw new Error(`Unsupported platform: ${Platform.OS}`);
  }
}

// Singleton instance
let _instance: IXRGlassesService | null = null;

export function getXRGlassesService(): IXRGlassesService {
  if (!_instance) {
    _instance = createXRGlassesService();
  }
  return _instance;
}
```

---

### Step 1.5: React Hooks

**File: `src/hooks/useXRGlasses.ts`**
```typescript
import { useEffect, useState, useCallback } from 'react';
import { getXRGlassesService, IXRGlassesService } from '../../modules/xr-glasses/src/XRGlassesModule';

export interface GlassesState {
  initialized: boolean;
  connected: boolean;
  isProjectedDevice: boolean;
  engagementMode: { visualsOn: boolean; audioOn: boolean };
  capabilities: {
    hasController: boolean;
    hasHandTracking: boolean;
    hasEyeTracking: boolean;
    hasSpatialApi: boolean;
  } | null;
}

export function useXRGlasses() {
  const [service] = useState<IXRGlassesService>(() => getXRGlassesService());
  const [state, setState] = useState<GlassesState>({
    initialized: false,
    connected: false,
    isProjectedDevice: false,
    engagementMode: { visualsOn: false, audioOn: false },
    capabilities: null,
  });
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await service.initialize();

        const [isProjected, isConnected, capabilities] = await Promise.all([
          service.isProjectedDevice(),
          service.isGlassesConnected(),
          service.getDeviceCapabilities(),
        ]);

        if (mounted) {
          setState(prev => ({
            ...prev,
            initialized: true,
            isProjectedDevice: isProjected,
            connected: isConnected,
            capabilities,
          }));
          setLoading(false);
        }
      } catch (e) {
        if (mounted) {
          setError(e as Error);
          setLoading(false);
        }
      }
    }

    init();

    // Subscribe to connection state changes
    const connectionSub = service.onConnectionStateChanged((event) => {
      if (mounted) {
        setState(prev => ({ ...prev, connected: event.connected }));
      }
    });

    // Subscribe to engagement mode changes
    const engagementSub = service.onEngagementModeChanged((event) => {
      if (mounted) {
        setState(prev => ({ ...prev, engagementMode: event }));
      }
    });

    return () => {
      mounted = false;
      connectionSub.remove();
      engagementSub.remove();
    };
  }, [service]);

  // Connect to glasses
  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await service.connect();
      const mode = await service.getEngagementMode();
      setState(prev => ({ ...prev, connected: true, engagementMode: mode }));
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [service]);

  // Disconnect from glasses
  const disconnect = useCallback(async () => {
    try {
      await service.disconnect();
      setState(prev => ({ ...prev, connected: false }));
    } catch (e) {
      setError(e as Error);
    }
  }, [service]);

  // Keep screen on
  const keepScreenOn = useCallback(async (enabled: boolean) => {
    try {
      await service.keepScreenOn(enabled);
    } catch (e) {
      setError(e as Error);
    }
  }, [service]);

  return {
    ...state,
    loading,
    error,
    connect,
    disconnect,
    keepScreenOn,
  };
}
```

**File: `src/hooks/useGlassesInput.ts`**
```typescript
import { useEffect, useState } from 'react';
import { getXRGlassesService } from '../../modules/xr-glasses/src/XRGlassesModule';
import type { InputEvent } from '../../modules/xr-glasses';

export function useGlassesInput() {
  const [lastEvent, setLastEvent] = useState<InputEvent | null>(null);
  const [eventHistory, setEventHistory] = useState<InputEvent[]>([]);

  useEffect(() => {
    const service = getXRGlassesService();

    const subscription = service.onInputEvent((event) => {
      setLastEvent(event);
      setEventHistory(prev => [...prev.slice(-99), event]); // Keep last 100
    });

    return () => subscription.remove();
  }, []);

  const clearHistory = () => setEventHistory([]);

  return {
    lastEvent,
    eventHistory,
    clearHistory,
  };
}
```

---

### Step 1.6: Zustand Store

**File: `src/store/glassesStore.ts`**
```typescript
import { create } from 'zustand';

interface GlassesStore {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Device info
  deviceCapabilities: {
    hasController: boolean;
    hasHandTracking: boolean;
    hasEyeTracking: boolean;
    hasSpatialApi: boolean;
  } | null;

  // Engagement mode
  visualsOn: boolean;
  audioOn: boolean;

  // Input events log (for debugging)
  inputEvents: Array<{ action: string; timestamp: number }>;

  // Actions
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setDeviceCapabilities: (caps: GlassesStore['deviceCapabilities']) => void;
  setEngagementMode: (visualsOn: boolean, audioOn: boolean) => void;
  addInputEvent: (event: { action: string; timestamp: number }) => void;
  clearInputEvents: () => void;
}

export const useGlassesStore = create<GlassesStore>((set) => ({
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  deviceCapabilities: null,
  visualsOn: false,
  audioOn: false,
  inputEvents: [],

  setConnected: (connected) => set({ isConnected: connected }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),
  setConnectionError: (error) => set({ connectionError: error }),
  setDeviceCapabilities: (caps) => set({ deviceCapabilities: caps }),
  setEngagementMode: (visualsOn, audioOn) => set({ visualsOn, audioOn }),
  addInputEvent: (event) => set((state) => ({
    inputEvents: [...state.inputEvents.slice(-99), event],
  })),
  clearInputEvents: () => set({ inputEvents: [] }),
}));
```

---

### Step 1.7: Basic UI Screens

**File: `app/index.tsx`**
```typescript
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { useXRGlasses } from '../src/hooks/useXRGlasses';

export default function HomeScreen() {
  const { initialized, connected, isProjectedDevice, capabilities, loading, error } = useXRGlasses();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.text}>Initializing XR Glasses...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>XR Glasses App</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Status</Text>
        <Text style={styles.statusItem}>
          Initialized: {initialized ? '✅' : '❌'}
        </Text>
        <Text style={styles.statusItem}>
          Connected: {connected ? '✅' : '❌'}
        </Text>
        <Text style={styles.statusItem}>
          Projected Device: {isProjectedDevice ? '✅' : '❌'}
        </Text>
      </View>

      {capabilities && (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Capabilities</Text>
          <Text style={styles.statusItem}>
            Controller: {capabilities.hasController ? '✅' : '❌'}
          </Text>
          <Text style={styles.statusItem}>
            Hand Tracking: {capabilities.hasHandTracking ? '✅' : '❌'}
          </Text>
          <Text style={styles.statusItem}>
            Eye Tracking: {capabilities.hasEyeTracking ? '✅' : '❌'}
          </Text>
          <Text style={styles.statusItem}>
            Spatial API: {capabilities.hasSpatialApi ? '✅' : '❌'}
          </Text>
        </View>
      )}

      <Link href="/connect" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>
            {connected ? 'Manage Connection' : 'Connect to Glasses'}
          </Text>
        </Pressable>
      </Link>

      {connected && (
        <Link href="/glasses" asChild>
          <Pressable style={[styles.button, styles.primaryButton]}>
            <Text style={styles.buttonText}>Open Glasses Dashboard</Text>
          </Pressable>
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0a0a0a',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 24,
  },
  text: {
    color: '#ffffff',
    marginTop: 12,
  },
  errorText: {
    color: '#ff6b6b',
  },
  statusCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  statusItem: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#333333',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButton: {
    backgroundColor: '#0066cc',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

**File: `app/connect.tsx`**
```typescript
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useXRGlasses } from '../src/hooks/useXRGlasses';

export default function ConnectScreen() {
  const router = useRouter();
  const { connected, loading, error, connect, disconnect } = useXRGlasses();

  const handleConnect = async () => {
    await connect();
    if (!error) {
      router.replace('/glasses');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect to Glasses</Text>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066cc" />
          <Text style={styles.loadingText}>
            {connected ? 'Disconnecting...' : 'Connecting...'}
          </Text>
        </View>
      ) : (
        <View>
          {connected ? (
            <>
              <View style={styles.connectedCard}>
                <Text style={styles.connectedText}>✅ Connected to Glasses</Text>
              </View>
              <Pressable style={styles.disconnectButton} onPress={disconnect}>
                <Text style={styles.buttonText}>Disconnect</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.instructions}>
                Make sure your XR glasses are nearby and powered on.
              </Text>
              <Pressable style={styles.connectButton} onPress={handleConnect}>
                <Text style={styles.buttonText}>Connect</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0a0a0a',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 24,
  },
  instructions: {
    fontSize: 16,
    color: '#888888',
    marginBottom: 24,
    lineHeight: 24,
  },
  errorCard: {
    backgroundColor: '#3d1515',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff6b6b',
  },
  connectedCard: {
    backgroundColor: '#153d15',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  connectedText: {
    color: '#6bff6b',
    fontSize: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  loadingText: {
    color: '#888888',
    marginTop: 16,
  },
  connectButton: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  disconnectButton: {
    backgroundColor: '#cc3300',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

---

### Step 1.8: Build and Test

```bash
# Generate native projects
npx expo prebuild

# Build for Android
npx expo run:android

# Or build APK for testing on device
eas build --platform android --profile development
```

**Testing Checklist:**
- [ ] App launches on Android device
- [ ] XRGlasses module initializes without crash
- [ ] `isProjectedDevice()` returns expected value
- [ ] `isGlassesConnected()` returns expected value
- [ ] `getDeviceCapabilities()` returns capability info
- [ ] Connection/disconnection works
- [ ] Events are received from native module

---

## Phase 2: Protocol Capture & Analysis (Week 3)

### Step 2.1: Enable Bluetooth HCI Logging

**On Android device:**
1. Enable Developer Options
2. Settings → Developer Options → Enable Bluetooth HCI snoop log
3. Use app normally with glasses connected
4. Pull logs: `adb pull /sdcard/btsnoop_hci.log`
5. Open in Wireshark with Bluetooth plugin

### Step 2.2: Capture WiFi Direct Traffic

```bash
# On rooted device or emulator
adb shell tcpdump -i wlan0 -w /sdcard/wifi_capture.pcap

# Pull capture
adb pull /sdcard/wifi_capture.pcap

# Analyze in Wireshark
```

### Step 2.3: Document Protocol

Create `docs/protocol/` folder:
```
docs/protocol/
├── bluetooth/
│   ├── pairing-sequence.md
│   ├── gatt-services.md
│   └── packet-structure.md
├── wifi/
│   ├── connection-handshake.md
│   ├── frame-format.md
│   └── commands.md
└── state-machine.md
```

---

## Phase 3: iOS Implementation (Future)

### Step 3.1: C++ Protocol Core

**File: `cpp/protocol/XRProtocol.h`**
```cpp
#pragma once

#include <cstdint>
#include <vector>
#include <functional>
#include <string>

namespace xr {

enum class DeviceState {
    Disconnected,
    Connecting,
    Connected,
    Error
};

enum class InputAction {
    ToggleCamera = 0,
    // Add more as discovered
};

struct EngagementMode {
    bool visualsOn;
    bool audioOn;
};

struct DeviceCapabilities {
    bool hasController;
    bool hasHandTracking;
    bool hasEyeTracking;
    bool hasSpatialApi;
};

// Platform-agnostic callbacks
using ConnectionCallback = std::function<void(DeviceState)>;
using InputCallback = std::function<void(InputAction)>;
using EngagementCallback = std::function<void(EngagementMode)>;

// Platform interface - implemented by Android/iOS
class IPlatformBluetooth {
public:
    virtual ~IPlatformBluetooth() = default;
    virtual bool connect(const std::string& deviceId) = 0;
    virtual void disconnect() = 0;
    virtual bool sendData(const std::vector<uint8_t>& data) = 0;
    virtual void setDataCallback(std::function<void(const std::vector<uint8_t>&)> callback) = 0;
};

// Main protocol handler - shared across platforms
class XRGlassesProtocol {
public:
    XRGlassesProtocol(std::shared_ptr<IPlatformBluetooth> bluetooth);

    // Connection
    bool connect(const std::string& deviceId);
    void disconnect();
    DeviceState getState() const;

    // Commands (to glasses)
    bool requestCapabilities();
    bool setKeepScreenOn(bool enabled);

    // Callbacks (from glasses)
    void setConnectionCallback(ConnectionCallback callback);
    void setInputCallback(InputCallback callback);
    void setEngagementCallback(EngagementCallback callback);

private:
    void handleIncomingData(const std::vector<uint8_t>& data);
    std::vector<uint8_t> encodeCommand(/* ... */);
    void decodeResponse(const std::vector<uint8_t>& data);

    std::shared_ptr<IPlatformBluetooth> m_bluetooth;
    DeviceState m_state = DeviceState::Disconnected;

    ConnectionCallback m_connectionCallback;
    InputCallback m_inputCallback;
    EngagementCallback m_engagementCallback;
};

} // namespace xr
```

### Step 3.2: iOS Platform Layer

**File: `modules/xr-glasses/ios/XRGlassesModule.swift`**
```swift
import ExpoModulesCore
import CoreBluetooth

public class XRGlassesModule: Module {
    private var bluetoothManager: BluetoothManager?

    public func definition() -> ModuleDefinition {
        Name("XRGlasses")

        Events("onConnectionStateChanged", "onInputEvent", "onEngagementModeChanged")

        Function("initialize") {
            self.bluetoothManager = BluetoothManager()
        }

        AsyncFunction("connect") { (promise: Promise) in
            // Use C++ protocol via bridge
            // self.cppProtocol.connect(...)
            promise.resolve(true)
        }

        // ... other methods
    }
}

// CoreBluetooth wrapper implementing IPlatformBluetooth concept
class BluetoothManager: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    private var centralManager: CBCentralManager!
    private var connectedPeripheral: CBPeripheral?

    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        // Handle Bluetooth state
    }

    // ... implement scanning, connection, data transfer
}
```

### Step 3.3: Link C++ to Swift

Use a bridging header or Swift Package Manager to expose C++ to Swift:

```swift
// In XRGlassesModule.swift
import XRProtocolCpp  // Your C++ framework

private var protocol: XRGlassesProtocol?

func initProtocol() {
    let bluetooth = IOSBluetoothAdapter()  // Implements IPlatformBluetooth
    self.protocol = XRGlassesProtocol(bluetooth)
}
```

---

## Timeline Summary

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | Project Setup | Expo project, native module structure, TypeScript interfaces |
| 1-2 | Android Implementation | Kotlin module with Jetpack XR, hooks, basic UI |
| 2 | Testing | Test on Android device with glasses |
| 3 | Protocol Capture | Bluetooth/WiFi packet captures, initial documentation |
| 4+ | C++ Core | Shared protocol implementation |
| 5+ | iOS Implementation | Swift platform layer, CoreBluetooth integration |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `modules/xr-glasses/expo-module.config.json` | Module configuration |
| `modules/xr-glasses/android/build.gradle.kts` | Android dependencies (Jetpack XR) |
| `modules/xr-glasses/android/.../XRGlassesModule.kt` | Native module entry point |
| `modules/xr-glasses/android/.../XRGlassesService.kt` | Jetpack XR wrapper |
| `modules/xr-glasses/src/XRGlassesModule.ts` | Platform abstraction |
| `src/hooks/useXRGlasses.ts` | Main React hook |
| `src/store/glassesStore.ts` | Zustand state store |
| `cpp/protocol/XRProtocol.h` | Future C++ protocol (Phase 3) |

---

## Phase 2: Speech Recognition & Backend Integration (CURRENT FOCUS)

### Overview

Use Android's built-in `SpeechRecognizer` running **on the glasses themselves** for on-device
speech-to-text. The glasses capture audio locally, process it with on-device ASR, and send
only text results to the phone app.

**Key Architecture Insight (researched 2026-01-30):**
ASR runs ON THE GLASSES, not on the phone. This is critical for latency:
- No Bluetooth audio streaming required
- Audio captured and processed locally on glasses hardware
- Only text results are sent to phone via the Expo native module bridge
- Works offline (on-device models)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI GLASSES (on-device)                       │
│                                                                 │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│  │ Microphone  │───▶│ SpeechRecognizer│───▶│ GlassesActivity│  │
│  │ (hardware)  │    │ (local ASR)     │    │ (sends events) │  │
│  └─────────────┘    └─────────────────┘    └───────┬────────┘  │
│                                                     │           │
└─────────────────────────────────────────────────────│───────────┘
                                                      │ text only
                                                      │ (minimal latency)
                                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PHONE (React Native App)                     │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ XRGlassesModule │───▶│ useSpeechReco.. │───▶│ Backend API │ │
│  │ (receives text) │    │ (React hook)    │    │ (AI response)│ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why this architecture:**
- **No Bluetooth audio latency** - Audio never leaves the glasses
- **Works offline** - On-device ASR, no network for transcription
- **Battery efficient** - No audio streaming over Bluetooth
- **Lower bandwidth** - Only text sent to phone

---

### Step 2.1: GlassesActivity with SpeechRecognizer

**Key Insight:** ASR must run in a **Glasses Activity** - an Android Activity that runs on the glasses
hardware itself, declared with `android:requiredDisplayCategory="xr_projected"`.

**Key API:** `android.speech.SpeechRecognizer`
- Built into Android, no external libraries needed
- Works offline with on-device models
- Must be instantiated in the glasses activity context (not phone context)

#### Architecture Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    GLASSES (GlassesActivity.kt)                 │
│                                                                 │
│  - SpeechRecognizer runs here                                   │
│  - Captures audio from glasses mic                              │
│  - Processes speech locally                                     │
│  - Sends text results via broadcast/binding to phone service    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (broadcast or bound service)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PHONE (XRGlassesModule.kt)                   │
│                                                                 │
│  - Receives text events from glasses activity                   │
│  - Emits events to React Native                                 │
│  - Controls start/stop via IPC to glasses                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### File Structure

```
modules/xr-glasses/android/src/main/java/expo/modules/xrglasses/
├── XRGlassesModule.kt           # Expo module (phone-side)
├── XRGlassesService.kt          # Phone-side service
├── glasses/
│   ├── GlassesActivity.kt       # NEW: Runs on glasses
│   ├── SpeechRecognitionManager.kt  # NEW: ASR logic
│   └── GlassesBridge.kt         # NEW: IPC to phone
```

#### Step 2.1.1: AndroidManifest.xml - Declare Glasses Activity

```xml
<!-- In modules/xr-glasses/android/src/main/AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Existing permissions... -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />

    <application>
        <!-- Glasses Activity - runs on the glasses hardware -->
        <activity
            android:name=".glasses.GlassesActivity"
            android:exported="true"
            android:requiredDisplayCategory="xr_projected"
            android:theme="@style/Theme.AppCompat.NoActionBar">

            <!-- Intent filter for launching from phone app -->
            <intent-filter>
                <action android:name="expo.modules.xrglasses.LAUNCH_GLASSES" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </activity>

        <!-- Broadcast receiver for glasses → phone communication -->
        <receiver
            android:name=".GlassesBroadcastReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="expo.modules.xrglasses.SPEECH_RESULT" />
                <action android:name="expo.modules.xrglasses.SPEECH_PARTIAL" />
                <action android:name="expo.modules.xrglasses.SPEECH_ERROR" />
            </intent-filter>
        </receiver>
    </application>
</manifest>
```

#### Step 2.1.2: GlassesActivity.kt - Main Glasses-Side Activity

```kotlin
package expo.modules.xrglasses.glasses

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.xr.projected.ProjectedPermissionsRequestParams
import androidx.xr.projected.ProjectedPermissionsResultContract

class GlassesActivity : ComponentActivity() {

    companion object {
        private const val TAG = "GlassesActivity"

        // Broadcast actions for IPC to phone
        const val ACTION_SPEECH_RESULT = "expo.modules.xrglasses.SPEECH_RESULT"
        const val ACTION_SPEECH_PARTIAL = "expo.modules.xrglasses.SPEECH_PARTIAL"
        const val ACTION_SPEECH_ERROR = "expo.modules.xrglasses.SPEECH_ERROR"
        const val ACTION_SPEECH_STATE = "expo.modules.xrglasses.SPEECH_STATE"

        // Extras
        const val EXTRA_TEXT = "text"
        const val EXTRA_CONFIDENCE = "confidence"
        const val EXTRA_ERROR_CODE = "error_code"
        const val EXTRA_ERROR_MESSAGE = "error_message"
        const val EXTRA_IS_LISTENING = "is_listening"
    }

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false
    private var continuousMode = false

    // Permission launcher for glasses-specific permissions
    private val requestPermissionLauncher: ActivityResultLauncher<List<ProjectedPermissionsRequestParams>> =
        registerForActivityResult(ProjectedPermissionsResultContract()) { results ->
            if (results[Manifest.permission.RECORD_AUDIO] == true) {
                Log.d(TAG, "RECORD_AUDIO permission granted")
                initSpeechRecognizer()
            } else {
                Log.e(TAG, "RECORD_AUDIO permission denied")
                sendError(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS, "Microphone permission denied")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "GlassesActivity created")

        // Request microphone permission using glasses-specific API
        requestAudioPermission()
    }

    private fun requestAudioPermission() {
        val params = ProjectedPermissionsRequestParams(
            permissions = listOf(Manifest.permission.RECORD_AUDIO),
            rationale = "Microphone access is needed for voice commands."
        )
        requestPermissionLauncher.launch(listOf(params))
    }

    private fun initSpeechRecognizer() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Log.e(TAG, "Speech recognition not available on this device")
            sendError(-1, "Speech recognition not available")
            return
        }

        // Create ON-DEVICE recognizer (important for latency)
        speechRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
        speechRecognizer?.setRecognitionListener(createRecognitionListener())

        Log.d(TAG, "SpeechRecognizer initialized")

        // Check if we should start listening immediately (from intent)
        if (intent?.getBooleanExtra("start_listening", false) == true) {
            continuousMode = intent.getBooleanExtra("continuous", true)
            startListening()
        }
    }

    private fun createRecognitionListener() = object : RecognitionListener {

        override fun onReadyForSpeech(params: Bundle?) {
            Log.d(TAG, "Ready for speech")
            sendState(isListening = true)
        }

        override fun onBeginningOfSpeech() {
            Log.d(TAG, "Speech started")
        }

        override fun onRmsChanged(rmsdB: Float) {
            // Could send audio level updates if needed
        }

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
            Log.d(TAG, "Speech ended")
        }

        override fun onError(error: Int) {
            val errorMessage = when (error) {
                SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
                SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                SpeechRecognizer.ERROR_NETWORK -> "Network error"
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                SpeechRecognizer.ERROR_CLIENT -> "Client error"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Missing RECORD_AUDIO permission"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
                SpeechRecognizer.ERROR_SERVER -> "Server error"
                else -> "Recognition error: $error"
            }

            Log.e(TAG, "Speech error: $errorMessage (code: $error)")
            sendError(error, errorMessage)

            // Restart on recoverable errors if in continuous mode
            if (continuousMode && isListening && isRecoverableError(error)) {
                android.os.Handler(mainLooper).postDelayed({
                    if (isListening) startListeningInternal()
                }, 500)
            }
        }

        override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val confidences = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)

            if (!matches.isNullOrEmpty()) {
                val text = matches[0]
                val confidence = confidences?.getOrNull(0) ?: 0f

                Log.d(TAG, "Speech result: '$text' (confidence: $confidence)")
                sendResult(text, confidence)
            }

            // Restart listening if in continuous mode
            if (continuousMode && isListening) {
                startListeningInternal()
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            if (!matches.isNullOrEmpty()) {
                val text = matches[0]
                Log.d(TAG, "Partial result: '$text'")
                sendPartialResult(text)
            }
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun isRecoverableError(error: Int): Boolean {
        return error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS &&
               error != SpeechRecognizer.ERROR_CLIENT
    }

    fun startListening() {
        isListening = true
        startListeningInternal()
    }

    private fun startListeningInternal() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            // Use on-device recognition for lower latency
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        }
        speechRecognizer?.startListening(intent)
    }

    fun stopListening() {
        isListening = false
        continuousMode = false
        speechRecognizer?.stopListening()
        sendState(isListening = false)
    }

    // IPC methods - send results to phone app via broadcast
    private fun sendResult(text: String, confidence: Float) {
        val intent = Intent(ACTION_SPEECH_RESULT).apply {
            putExtra(EXTRA_TEXT, text)
            putExtra(EXTRA_CONFIDENCE, confidence)
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    private fun sendPartialResult(text: String) {
        val intent = Intent(ACTION_SPEECH_PARTIAL).apply {
            putExtra(EXTRA_TEXT, text)
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    private fun sendError(code: Int, message: String) {
        val intent = Intent(ACTION_SPEECH_ERROR).apply {
            putExtra(EXTRA_ERROR_CODE, code)
            putExtra(EXTRA_ERROR_MESSAGE, message)
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    private fun sendState(isListening: Boolean) {
        val intent = Intent(ACTION_SPEECH_STATE).apply {
            putExtra(EXTRA_IS_LISTENING, isListening)
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)

        // Handle commands from phone app
        when (intent.action) {
            "expo.modules.xrglasses.START_LISTENING" -> {
                continuousMode = intent.getBooleanExtra("continuous", true)
                startListening()
            }
            "expo.modules.xrglasses.STOP_LISTENING" -> {
                stopListening()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        speechRecognizer?.destroy()
        speechRecognizer = null
        Log.d(TAG, "GlassesActivity destroyed")
    }
}
```

#### Step 2.1.3: GlassesBroadcastReceiver.kt - Phone-Side Receiver

```kotlin
package expo.modules.xrglasses

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import expo.modules.xrglasses.glasses.GlassesActivity

/**
 * Receives broadcasts from GlassesActivity and forwards to XRGlassesModule
 */
class GlassesBroadcastReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "GlassesBroadcastReceiver"
        var moduleCallback: ((String, Map<String, Any?>) -> Unit)? = null
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "Received broadcast: ${intent.action}")

        when (intent.action) {
            GlassesActivity.ACTION_SPEECH_RESULT -> {
                val text = intent.getStringExtra(GlassesActivity.EXTRA_TEXT) ?: ""
                val confidence = intent.getFloatExtra(GlassesActivity.EXTRA_CONFIDENCE, 0f)

                moduleCallback?.invoke("onSpeechResult", mapOf(
                    "text" to text,
                    "confidence" to confidence,
                    "isFinal" to true
                ))
            }

            GlassesActivity.ACTION_SPEECH_PARTIAL -> {
                val text = intent.getStringExtra(GlassesActivity.EXTRA_TEXT) ?: ""

                moduleCallback?.invoke("onPartialResult", mapOf(
                    "text" to text,
                    "isFinal" to false
                ))
            }

            GlassesActivity.ACTION_SPEECH_ERROR -> {
                val code = intent.getIntExtra(GlassesActivity.EXTRA_ERROR_CODE, -1)
                val message = intent.getStringExtra(GlassesActivity.EXTRA_ERROR_MESSAGE) ?: "Unknown error"

                moduleCallback?.invoke("onSpeechError", mapOf(
                    "code" to code,
                    "message" to message
                ))
            }

            GlassesActivity.ACTION_SPEECH_STATE -> {
                val isListening = intent.getBooleanExtra(GlassesActivity.EXTRA_IS_LISTENING, false)

                moduleCallback?.invoke("onSpeechStateChanged", mapOf(
                    "isListening" to isListening
                ))
            }
        }
    }
}
```

#### Step 2.1.4: Update XRGlassesModule.kt - Add Speech Control

```kotlin
// Add to XRGlassesModule.kt

// In definition():
Events(
    "onConnectionStateChanged",
    "onInputEvent",
    "onEngagementModeChanged",
    "onDeviceStateChanged",
    "onSpeechResult",        // NEW: Final transcription from glasses
    "onPartialResult",       // NEW: Interim transcription
    "onSpeechError",         // NEW: Recognition errors
    "onSpeechStateChanged"   // NEW: Listening state changes
)

// Register broadcast receiver callback
Function("initialize") {
    val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "No context available", null)
    glassesService = XRGlassesService(context, this@XRGlassesModule)

    // Set up callback for speech events from glasses
    GlassesBroadcastReceiver.moduleCallback = { eventName, data ->
        this@XRGlassesModule.sendEvent(eventName, data)
    }
}

// Launch glasses activity and start listening
AsyncFunction("startSpeechRecognition") { continuous: Boolean, promise: Promise ->
    val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "No context", null)

    try {
        val intent = Intent("expo.modules.xrglasses.LAUNCH_GLASSES").apply {
            putExtra("start_listening", true)
            putExtra("continuous", continuous)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        promise.resolve(true)
    } catch (e: Exception) {
        promise.reject(CodedException("LAUNCH_FAILED", e.message, e))
    }
}

// Stop speech recognition
AsyncFunction("stopSpeechRecognition") { promise: Promise ->
    val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "No context", null)

    try {
        val intent = Intent("expo.modules.xrglasses.STOP_LISTENING").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        promise.resolve(true)
    } catch (e: Exception) {
        promise.reject(CodedException("STOP_FAILED", e.message, e))
    }
}

// Check if speech recognition is available
AsyncFunction("isSpeechRecognitionAvailable") { promise: Promise ->
    val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "No context", null)
    val available = SpeechRecognizer.isRecognitionAvailable(context)
    promise.resolve(available)
}
```

---

### Step 2.2: React Native Integration (Cross-Platform)

All TypeScript changes must maintain the platform abstraction. Update these files:

#### 1. Native Module Interface (`modules/xr-glasses/index.ts`)
```typescript
interface XRGlassesNativeModule extends NativeModule {
    // ... existing methods

    // Speech recognition (native bridge)
    startSpeechRecognition(): Promise<boolean>;
    stopSpeechRecognition(): Promise<boolean>;
    isSpeechRecognitionAvailable(): Promise<boolean>;
}

// New event types
export type SpeechResultEvent = {
    text: string;
    confidence: number;
    alternatives: string[];
    isFinal: boolean;
};

export type PartialResultEvent = {
    text: string;
    isFinal: boolean;
};

export type SpeechErrorEvent = {
    code: number;
    message: string;
};
```

#### 2. Platform-Agnostic Interface (`modules/xr-glasses/src/XRGlassesModule.ts`)
```typescript
// Add to IXRGlassesService interface:
export interface IXRGlassesService {
    // ... existing methods

    // Speech recognition (platform-agnostic)
    startSpeechRecognition(): Promise<boolean>;
    stopSpeechRecognition(): Promise<boolean>;
    isSpeechRecognitionAvailable(): Promise<boolean>;

    // Speech events
    onSpeechResult(callback: (event: SpeechResultEvent) => void): Subscription;
    onPartialResult(callback: (event: PartialResultEvent) => void): Subscription;
    onSpeechError(callback: (event: SpeechErrorEvent) => void): Subscription;
}
```

#### 3. Android Implementation (in same file)
```typescript
class AndroidXRGlassesService implements IXRGlassesService {
    // ... existing methods

    async startSpeechRecognition(): Promise<boolean> {
        return XRGlassesNative.startSpeechRecognition();
    }

    async stopSpeechRecognition(): Promise<boolean> {
        return XRGlassesNative.stopSpeechRecognition();
    }

    async isSpeechRecognitionAvailable(): Promise<boolean> {
        return XRGlassesNative.isSpeechRecognitionAvailable();
    }

    onSpeechResult(callback: (event: SpeechResultEvent) => void): Subscription {
        const subscription = getEmitter().addListener('onSpeechResult', callback);
        return { remove: () => subscription.remove() };
    }

    onPartialResult(callback: (event: PartialResultEvent) => void): Subscription {
        const subscription = getEmitter().addListener('onPartialResult', callback);
        return { remove: () => subscription.remove() };
    }

    onSpeechError(callback: (event: SpeechErrorEvent) => void): Subscription {
        const subscription = getEmitter().addListener('onSpeechError', callback);
        return { remove: () => subscription.remove() };
    }
}
```

#### 4. iOS Stub (for future implementation)
```typescript
class IOSXRGlassesService implements IXRGlassesService {
    // ... existing methods

    async startSpeechRecognition(): Promise<boolean> {
        console.warn('iOS speech recognition not yet implemented');
        throw new Error('iOS speech recognition not yet implemented');
    }

    async stopSpeechRecognition(): Promise<boolean> {
        throw new Error('iOS speech recognition not yet implemented');
    }

    async isSpeechRecognitionAvailable(): Promise<boolean> {
        return false;
    }

    onSpeechResult(_callback: (event: SpeechResultEvent) => void): Subscription {
        return { remove: () => {} };
    }

    onPartialResult(_callback: (event: PartialResultEvent) => void): Subscription {
        return { remove: () => {} };
    }

    onSpeechError(_callback: (event: SpeechErrorEvent) => void): Subscription {
        return { remove: () => {} };
    }
}
```

#### 5. Web Emulation (for development)
```typescript
class WebXRGlassesService implements IXRGlassesService {
    private speechResultCallbacks: Set<(event: SpeechResultEvent) => void> = new Set();
    // ... other callbacks

    async startSpeechRecognition(): Promise<boolean> {
        console.log('[WebXR] Speech recognition started (emulation)');
        // Optionally use Web Speech API for dev testing
        return true;
    }

    async stopSpeechRecognition(): Promise<boolean> {
        console.log('[WebXR] Speech recognition stopped (emulation)');
        return true;
    }

    async isSpeechRecognitionAvailable(): Promise<boolean> {
        return true; // Emulated
    }

    // Emulation helper to simulate speech results
    simulateSpeechResult(text: string): void {
        this.speechResultCallbacks.forEach(cb => cb({
            text,
            confidence: 0.95,
            alternatives: [text],
            isFinal: true,
        }));
    }

    onSpeechResult(callback: (event: SpeechResultEvent) => void): Subscription {
        this.speechResultCallbacks.add(callback);
        return { remove: () => this.speechResultCallbacks.delete(callback) };
    }

    // ... other event subscriptions
}
```

---

#### 6. Create Hook (`src/hooks/useSpeechRecognition.ts`)
```typescript
import { useEffect, useState, useCallback } from 'react';
import { getXRGlassesService } from '../../modules/xr-glasses/src/XRGlassesModule';

export function useSpeechRecognition() {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [partialTranscript, setPartialTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const service = getXRGlassesService();

        const resultSub = service.onSpeechResult((event) => {
            setTranscript(event.text);
            setPartialTranscript('');
        });

        const partialSub = service.onPartialResult((event) => {
            setPartialTranscript(event.text);
        });

        const errorSub = service.onSpeechError((event) => {
            setError(event.message);
        });

        return () => {
            resultSub.remove();
            partialSub.remove();
            errorSub.remove();
        };
    }, []);

    const startListening = useCallback(async () => {
        setError(null);
        const service = getXRGlassesService();
        await service.startSpeechRecognition();
        setIsListening(true);
    }, []);

    const stopListening = useCallback(async () => {
        const service = getXRGlassesService();
        await service.stopSpeechRecognition();
        setIsListening(false);
    }, []);

    return {
        isListening,
        transcript,
        partialTranscript,
        error,
        startListening,
        stopListening,
    };
}
```

---

### Step 2.3: Backend Integration

**API Design:**
```typescript
// POST /api/speech/process
// Content-Type: application/json
{
    "text": "User's transcribed speech",
    "context": {
        "sessionId": "uuid",
        "previousMessages": []
    }
}

// Response:
{
    "response": "AI assistant response text",
    "action": null | { type: "navigate", destination: "..." }
}
```

**Create backend service (`src/services/BackendService.ts`):**
```typescript
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.example.com';

export interface ProcessSpeechRequest {
    text: string;
    sessionId: string;
}

export interface ProcessSpeechResponse {
    response: string;
    action?: {
        type: string;
        [key: string]: any;
    };
}

export async function processSpeech(request: ProcessSpeechRequest): Promise<ProcessSpeechResponse> {
    const response = await fetch(`${API_BASE}/api/speech/process`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
    }

    return response.json();
}
```

---

### Step 2.4: Permissions Handling

**Update AndroidManifest.xml:**
```xml
<!-- Add RECORD_AUDIO permission -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

**Permission request in React Native:**
```typescript
import { PermissionsAndroid, Platform } from 'react-native';

export async function requestMicrophonePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
            title: 'Microphone Permission',
            message: 'This app needs access to your microphone for voice commands.',
            buttonPositive: 'Grant',
            buttonNegative: 'Deny',
        }
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
}
```

---

### Step 2.5: End-to-End Flow Implementation

**Create speech processing screen or component:**
```typescript
// Example usage in a component
function VoiceAssistant() {
    const { isListening, transcript, partialTranscript, startListening, stopListening } = useSpeechRecognition();
    const [response, setResponse] = useState('');
    const [processing, setProcessing] = useState(false);

    // Process transcript when we get a final result
    useEffect(() => {
        if (transcript && !processing) {
            handleTranscript(transcript);
        }
    }, [transcript]);

    const handleTranscript = async (text: string) => {
        setProcessing(true);
        try {
            const result = await processSpeech({
                text,
                sessionId: 'current-session-id',
            });
            setResponse(result.response);
            // TODO: Display response on glasses or use TTS
        } catch (error) {
            console.error('Failed to process speech:', error);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <View>
            <Text>Listening: {isListening ? 'Yes' : 'No'}</Text>
            <Text>Partial: {partialTranscript}</Text>
            <Text>Final: {transcript}</Text>
            <Text>Response: {response}</Text>
            <Button onPress={isListening ? stopListening : startListening}>
                {isListening ? 'Stop' : 'Start'} Listening
            </Button>
        </View>
    );
}
```

---

### Step 2.6: Testing Plan

#### Unit Tests
- [ ] SpeechRecognizer initialization with ProjectedContext
- [ ] Event emission for results, partial results, errors
- [ ] Continuous listening restart after results
- [ ] Error recovery and restart logic
- [ ] Permission handling

#### Integration Tests
- [ ] End-to-end: speak → transcribe → backend → response
- [ ] React Native hook state updates correctly
- [ ] Event subscriptions and cleanup

#### Emulator Tests
- [ ] Use Android Studio emulator microphone input
- [ ] Verify glasses context uses emulated glasses mic
- [ ] Test partial results streaming
- [ ] Test error scenarios (no speech, timeout)

#### Device Tests (with real glasses)
- [ ] Speech recognized from glasses microphone (not phone)
- [ ] Latency measurement: speech → final result
- [ ] Background/foreground transitions
- [ ] Battery impact assessment
- [ ] Network connectivity handling for backend

#### Test Scenarios
| Scenario | Expected Result |
|----------|-----------------|
| Say "Hello world" | Transcript: "hello world", confidence > 0.8 |
| Silence for 5s | onError with SPEECH_TIMEOUT, auto-restart |
| No RECORD_AUDIO permission | onError with INSUFFICIENT_PERMISSIONS |
| Backend unavailable | Error shown, transcript still captured |
| Rapid start/stop | No crashes, clean state |

---

### Implementation Order

1. **Kotlin: SpeechRecognizer in XRGlassesService** - Core recognition logic
2. **Kotlin: Module bridge functions** - Expose to React Native
3. **TypeScript: Event types and hook** - useSpeechRecognition
4. **TypeScript: Backend service** - API integration
5. **UI: Voice assistant component** - Display and controls
6. **Testing: Emulator validation** - All test scenarios
7. **Testing: Real device** - Glasses microphone verification

---

## Research Findings

Research conducted 2026-01-29 to determine audio capture approach:

| Question | Answer |
|----------|--------|
| Built-in transcription? | YES - `SpeechRecognizer.createOnDeviceSpeechRecognizer()` works offline |
| Audio routing? | Glasses connect as Bluetooth audio (A2DP/HFP), ~100-200ms latency |
| WiFi audio streaming? | NO - Jetpack XR only supports Bluetooth for audio |
| Best approach? | On-device SpeechRecognizer - avoids latency, sends text not audio |

**Sources:**
- https://developer.android.com/develop/xr/jetpack-xr-sdk/asr
- https://developer.android.com/develop/xr/jetpack-xr-sdk/access-hardware-projected-context

---

## Architecture Decisions

### Capabilities UI Removed
Cannot remotely query glasses system features from phone. Capabilities are used internally for **validation only**:
- Checks for `com.google.android.feature.XR_PROJECTED` before connecting
- Shows clear error if device is incompatible
- No capabilities displayed in UI

---

## Key Code Files

### Kotlin (Native Module)
| File | Purpose |
|------|---------|
| `modules/xr-glasses/android/.../XRGlassesService.kt` | Core XR service, connection, speech |
| `modules/xr-glasses/android/.../XRGlassesModule.kt` | Expo module bridge to React Native |

### TypeScript (React Native)
| File | Purpose |
|------|---------|
| `modules/xr-glasses/src/XRGlassesModule.ts` | Platform service abstraction (IXRGlassesService) |
| `src/hooks/useXRGlasses.ts` | Main React hook for glasses state |
| `src/hooks/useGlassesInput.ts` | Input event tracking hook |
| `app/connect.tsx` | Connection screen |
| `app/glasses/index.tsx` | Glasses dashboard UI |

---

## Quick Commands

```bash
# Build release APK
export ANDROID_HOME=~/Android/Sdk
cd android && ./gradlew clean && ./gradlew assembleRelease

# APK location
android/app/build/outputs/apk/release/app-release.apk

# List emulators
~/Android/Sdk/platform-tools/adb devices -l

# Install on phone emulator (replace 5556 with actual port)
~/Android/Sdk/platform-tools/adb -s emulator-5556 install -r android/app/build/outputs/apk/release/app-release.apk

# Watch logs
~/Android/Sdk/platform-tools/adb -s emulator-5556 logcat | grep XRGlassesService
```

---

## Notes

- Jetpack XR library versions may change - check Maven for latest
- Android XR requires API 28+ minimum
- See `CLAUDE.md` for emulator setup and testing instructions

### Emulator Testing Notes (2026-01-30)

**Glasses emulator (emulator-5554):**
- Does NOT have SpeechRecognizer available
- `SpeechRecognizer.isRecognitionAvailable()` returns false
- `SpeechRecognizer.isOnDeviceRecognitionAvailable()` returns false
- This is expected - glasses emulator is minimal image without Google services
- GlassesActivity works but speech recognition fails with "not available"

**Phone emulator (emulator-5556):**
- Has network-based SpeechRecognizer (via Google app)
- On-device ASR fails with error 13 (language pack not available)
- Fallback to network ASR works correctly
- Must have microphone enabled in emulator settings
- Uses phone mic (not glasses mic) in emulator environment

**Production behavior:**
- Real AI glasses have on-device ASR with glasses microphone
- GlassesActivity will run speech recognition locally on glasses
- Only text results sent to phone (no audio streaming)
- Expected latency: ~100ms for on-device ASR

**Audio streaming alternative (if needed):**
- Would add ~100-600ms latency vs on-device ASR
- Complex implementation (Opus encoding, streaming, decoding)
- Jetpack XR may not expose raw audio streaming APIs
- Not recommended unless on-device ASR unavailable

### Emulator Stability Issues (2026-01-30)

**Symptom:** Camera/connection works initially, then stops working after several uses.

**Fix:** Fully close and restart the phone emulator. No need to create new AVD.

**Root cause (suspected):**
- NOT hot module reloading (release APK has no Metro bundler)
- Likely CameraX/Camera2 resource leak in emulator's camera HAL
- Or Jetpack XR Projected service binding gets stuck (alpha SDK)
- Or emulator's glasses↔phone pairing state corrupts in memory

**Key insight:** Restart fixes it → runtime state corruption, not image corruption.

**Workaround:** If camera stops working, restart the phone emulator.
