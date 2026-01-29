# XR Glasses React Native App - Implementation Plan

## Overview

Build a React Native (Expo) app that communicates with Android XR glasses using Jetpack XR APIs, with architecture designed for future iOS cross-platform support via C++ protocol implementation.

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

## Notes

- Jetpack XR library versions may change - check Maven for latest
- Android XR requires API 28+ minimum
- Test on actual XR-capable device, not emulator
- Keep packet captures organized by date/feature for analysis
