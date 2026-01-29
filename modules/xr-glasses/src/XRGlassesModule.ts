import { Platform, NativeEventEmitter, NativeModules } from 'react-native';
import { XRGlassesNative, ConnectionStateEvent, InputEvent, EngagementModeEvent, DeviceStateEvent } from '../index';

/**
 * Subscription interface for event listeners.
 */
export interface Subscription {
  remove: () => void;
}

/**
 * Device capabilities interface.
 */
export interface DeviceCapabilities {
  hasController: boolean;
  hasHandTracking: boolean;
  hasEyeTracking: boolean;
  hasSpatialApi: boolean;
  isEmulated?: boolean;
}

/**
 * Engagement mode interface.
 */
export interface EngagementMode {
  visualsOn: boolean;
  audioOn: boolean;
}

/**
 * XR Glasses Service Interface - Platform-agnostic interface for XR glasses communication.
 *
 * This interface defines all operations available for interacting with XR glasses.
 * The actual implementation is platform-specific (Android uses Jetpack XR, iOS will
 * use a custom C++ protocol in future phases).
 */
export interface IXRGlassesService {
  /** Initialize the XR Glasses service */
  initialize(): Promise<void>;

  /** Check if running in a projected device context */
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

  /** Get current engagement mode */
  getEngagementMode(): Promise<EngagementMode>;

  /** Get device capabilities */
  getDeviceCapabilities(): Promise<DeviceCapabilities>;

  /** Enable/disable emulation mode for testing */
  setEmulationMode(enabled: boolean): Promise<boolean>;

  /** Simulate an input event (for testing in emulation mode) */
  simulateInputEvent(action: string): Promise<boolean>;

  // Event subscriptions
  onConnectionStateChanged(callback: (event: ConnectionStateEvent) => void): Subscription;
  onInputEvent(callback: (event: InputEvent) => void): Subscription;
  onEngagementModeChanged(callback: (event: EngagementModeEvent) => void): Subscription;
  onDeviceStateChanged(callback: (event: DeviceStateEvent) => void): Subscription;
}

// Create event emitter for native events (Android/iOS)
let eventEmitter: NativeEventEmitter | null = null;
if (Platform.OS === 'android' || Platform.OS === 'ios') {
  try {
    eventEmitter = new NativeEventEmitter(NativeModules.XRGlasses);
  } catch {
    // Event emitter not available, events will not work
    console.warn('[XRGlasses] NativeEventEmitter not available');
  }
}

/**
 * Android implementation using Jetpack XR.
 *
 * This implementation wraps the native Android Expo module and provides
 * a clean TypeScript interface for React components to use.
 */
class AndroidXRGlassesService implements IXRGlassesService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    XRGlassesNative.initialize();
    this.initialized = true;
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

  async getEngagementMode(): Promise<EngagementMode> {
    return XRGlassesNative.getEngagementMode();
  }

  async getDeviceCapabilities(): Promise<DeviceCapabilities> {
    return XRGlassesNative.getDeviceCapabilities();
  }

  async setEmulationMode(enabled: boolean): Promise<boolean> {
    // @ts-ignore - setEmulationMode may not be in the base type definition
    return XRGlassesNative.setEmulationMode(enabled);
  }

  async simulateInputEvent(action: string): Promise<boolean> {
    // @ts-ignore - simulateInputEvent may not be in the base type definition
    return XRGlassesNative.simulateInputEvent(action);
  }

  onConnectionStateChanged(callback: (event: ConnectionStateEvent) => void): Subscription {
    if (!eventEmitter) {
      return { remove: () => {} };
    }
    const subscription = eventEmitter.addListener('onConnectionStateChanged', callback);
    return { remove: () => subscription.remove() };
  }

  onInputEvent(callback: (event: InputEvent) => void): Subscription {
    if (!eventEmitter) {
      return { remove: () => {} };
    }
    const subscription = eventEmitter.addListener('onInputEvent', callback);
    return { remove: () => subscription.remove() };
  }

  onEngagementModeChanged(callback: (event: EngagementModeEvent) => void): Subscription {
    if (!eventEmitter) {
      return { remove: () => {} };
    }
    const subscription = eventEmitter.addListener('onEngagementModeChanged', callback);
    return { remove: () => subscription.remove() };
  }

  onDeviceStateChanged(callback: (event: DeviceStateEvent) => void): Subscription {
    if (!eventEmitter) {
      return { remove: () => {} };
    }
    const subscription = eventEmitter.addListener('onDeviceStateChanged', callback);
    return { remove: () => subscription.remove() };
  }
}

/**
 * iOS stub implementation.
 *
 * This is a placeholder for Phase 2+ when iOS support will be added
 * using a custom C++ protocol implementation.
 */
class IOSXRGlassesService implements IXRGlassesService {
  async initialize(): Promise<void> {
    console.warn('iOS XR Glasses not yet implemented - Phase 2');
  }

  async isProjectedDevice(): Promise<boolean> {
    return false;
  }

  async isGlassesConnected(): Promise<boolean> {
    return false;
  }

  async connect(): Promise<boolean> {
    throw new Error('iOS XR Glasses not yet implemented');
  }

  async disconnect(): Promise<boolean> {
    throw new Error('iOS XR Glasses not yet implemented');
  }

  async isDisplayCapable(): Promise<boolean> {
    return false;
  }

  async keepScreenOn(_enabled: boolean): Promise<boolean> {
    return false;
  }

  async getEngagementMode(): Promise<EngagementMode> {
    return { visualsOn: false, audioOn: false };
  }

  async getDeviceCapabilities(): Promise<DeviceCapabilities> {
    return {
      hasController: false,
      hasHandTracking: false,
      hasEyeTracking: false,
      hasSpatialApi: false,
    };
  }

  async setEmulationMode(_enabled: boolean): Promise<boolean> {
    console.warn('iOS emulation mode not yet implemented');
    return false;
  }

  async simulateInputEvent(_action: string): Promise<boolean> {
    console.warn('iOS input simulation not yet implemented');
    return false;
  }

  onConnectionStateChanged(_callback: (event: ConnectionStateEvent) => void): Subscription {
    return { remove: () => {} };
  }

  onInputEvent(_callback: (event: InputEvent) => void): Subscription {
    return { remove: () => {} };
  }

  onEngagementModeChanged(_callback: (event: EngagementModeEvent) => void): Subscription {
    return { remove: () => {} };
  }

  onDeviceStateChanged(_callback: (event: DeviceStateEvent) => void): Subscription {
    return { remove: () => {} };
  }
}

/**
 * Web stub implementation for development.
 */
class WebXRGlassesService implements IXRGlassesService {
  private emulationEnabled = false;
  private connected = false;
  private engagementMode: EngagementMode = { visualsOn: false, audioOn: false };
  private connectionCallbacks: Set<(event: ConnectionStateEvent) => void> = new Set();
  private inputCallbacks: Set<(event: InputEvent) => void> = new Set();
  private engagementCallbacks: Set<(event: EngagementModeEvent) => void> = new Set();
  private deviceStateCallbacks: Set<(event: DeviceStateEvent) => void> = new Set();

  async initialize(): Promise<void> {
    console.log('[WebXR] Initialized in web mode - using emulation');
    this.emulationEnabled = true;
  }

  async isProjectedDevice(): Promise<boolean> {
    return this.emulationEnabled;
  }

  async isGlassesConnected(): Promise<boolean> {
    return this.connected;
  }

  async connect(): Promise<boolean> {
    if (!this.emulationEnabled) {
      throw new Error('Enable emulation mode first');
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    this.connected = true;
    this.engagementMode = { visualsOn: true, audioOn: true };
    this.connectionCallbacks.forEach(cb => cb({ connected: true }));
    this.engagementCallbacks.forEach(cb => cb(this.engagementMode));
    return true;
  }

  async disconnect(): Promise<boolean> {
    this.connected = false;
    this.engagementMode = { visualsOn: false, audioOn: false };
    this.connectionCallbacks.forEach(cb => cb({ connected: false }));
    return true;
  }

  async isDisplayCapable(): Promise<boolean> {
    return this.connected && this.engagementMode.visualsOn;
  }

  async keepScreenOn(_enabled: boolean): Promise<boolean> {
    console.log('[WebXR] keepScreenOn:', _enabled);
    return true;
  }

  async getEngagementMode(): Promise<EngagementMode> {
    return this.engagementMode;
  }

  async getDeviceCapabilities(): Promise<DeviceCapabilities> {
    return {
      hasController: true,
      hasHandTracking: true,
      hasEyeTracking: true,
      hasSpatialApi: true,
      isEmulated: true,
    };
  }

  async setEmulationMode(enabled: boolean): Promise<boolean> {
    this.emulationEnabled = enabled;
    this.deviceStateCallbacks.forEach(cb =>
      cb({ state: enabled ? 'ACTIVE' : 'INACTIVE' })
    );
    return true;
  }

  async simulateInputEvent(action: string): Promise<boolean> {
    const event: InputEvent = { action, timestamp: Date.now() };
    this.inputCallbacks.forEach(cb => cb(event));

    if (action === 'TOGGLE_VISUALS') {
      this.engagementMode = {
        ...this.engagementMode,
        visualsOn: !this.engagementMode.visualsOn,
      };
      this.engagementCallbacks.forEach(cb => cb(this.engagementMode));
    } else if (action === 'TOGGLE_AUDIO') {
      this.engagementMode = {
        ...this.engagementMode,
        audioOn: !this.engagementMode.audioOn,
      };
      this.engagementCallbacks.forEach(cb => cb(this.engagementMode));
    }
    return true;
  }

  onConnectionStateChanged(callback: (event: ConnectionStateEvent) => void): Subscription {
    this.connectionCallbacks.add(callback);
    return {
      remove: () => {
        this.connectionCallbacks.delete(callback);
      },
    };
  }

  onInputEvent(callback: (event: InputEvent) => void): Subscription {
    this.inputCallbacks.add(callback);
    return {
      remove: () => {
        this.inputCallbacks.delete(callback);
      },
    };
  }

  onEngagementModeChanged(callback: (event: EngagementModeEvent) => void): Subscription {
    this.engagementCallbacks.add(callback);
    return {
      remove: () => {
        this.engagementCallbacks.delete(callback);
      },
    };
  }

  onDeviceStateChanged(callback: (event: DeviceStateEvent) => void): Subscription {
    this.deviceStateCallbacks.add(callback);
    return {
      remove: () => {
        this.deviceStateCallbacks.delete(callback);
      },
    };
  }
}

/**
 * Factory function - returns platform-specific implementation.
 */
export function createXRGlassesService(): IXRGlassesService {
  switch (Platform.OS) {
    case 'android':
      return new AndroidXRGlassesService();
    case 'ios':
      return new IOSXRGlassesService();
    case 'web':
      return new WebXRGlassesService();
    default:
      console.warn(`Unsupported platform: ${Platform.OS}, using web fallback`);
      return new WebXRGlassesService();
  }
}

// Singleton instance
let _instance: IXRGlassesService | null = null;

/**
 * Get the singleton XR Glasses service instance.
 */
export function getXRGlassesService(): IXRGlassesService {
  if (!_instance) {
    _instance = createXRGlassesService();
  }
  return _instance;
}

/**
 * Reset the singleton instance (useful for testing).
 */
export function resetXRGlassesService(): void {
  _instance = null;
}
