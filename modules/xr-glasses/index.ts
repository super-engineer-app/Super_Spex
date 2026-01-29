import { NativeModule, requireNativeModule } from 'expo-modules-core';

/**
 * Native module interface for XR Glasses communication.
 * This provides the bridge between JavaScript and the native platform implementations.
 */
interface XRGlassesNativeModule extends NativeModule {
  /** Initialize the XR Glasses service */
  initialize(): void;

  /** Check if running in a projected device context (Android XR) */
  isProjectedDevice(): Promise<boolean>;

  /** Check if glasses are currently connected */
  isGlassesConnected(): Promise<boolean>;

  /** Connect to the XR glasses */
  connect(): Promise<boolean>;

  /** Disconnect from the XR glasses */
  disconnect(): Promise<boolean>;

  /** Check if glasses support display output */
  isDisplayCapable(): Promise<boolean>;

  /** Control screen always-on behavior */
  keepScreenOn(enabled: boolean): Promise<boolean>;

  /** Get current engagement mode (visuals/audio state) */
  getEngagementMode(): Promise<{ visualsOn: boolean; audioOn: boolean }>;

  /** Get device capabilities */
  getDeviceCapabilities(): Promise<{
    isXrPeripheral: boolean;
    hasXrProjection: boolean;
    hasTouchInput: boolean;
    hasCamera: boolean;
    hasMicrophone: boolean;
    hasAudioOutput: boolean;
  }>;
}

// Export the native module
export const XRGlassesNative = requireNativeModule<XRGlassesNativeModule>('XRGlasses');

// Event types for native module events
export type ConnectionStateEvent = { connected: boolean };
export type InputEvent = { action: string; timestamp: number };
export type EngagementModeEvent = { visualsOn: boolean; audioOn: boolean };
export type DeviceStateEvent = { state: 'INACTIVE' | 'ACTIVE' | 'DESTROYED' };

// Re-export the service module
export { createXRGlassesService, getXRGlassesService } from './src/XRGlassesModule';
export type { IXRGlassesService, DeviceCapabilities, EngagementMode } from './src/XRGlassesModule';
