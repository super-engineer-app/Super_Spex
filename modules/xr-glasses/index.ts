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

  // ============================================================
  // Speech Recognition (runs on glasses via GlassesActivity)
  // ============================================================

  /**
   * Start speech recognition on glasses.
   * Launches GlassesActivity which runs SpeechRecognizer on glasses hardware.
   * @param continuous - If true, continuously restarts after each result
   */
  startSpeechRecognition(continuous: boolean): Promise<boolean>;

  /** Stop speech recognition */
  stopSpeechRecognition(): Promise<boolean>;

  /** Check if speech recognition is available */
  isSpeechRecognitionAvailable(): Promise<boolean>;

  // ============================================================
  // Camera Capture (uses ProjectedContext for glasses camera)
  // ============================================================

  /**
   * Initialize camera for capturing images from glasses.
   * @param lowPowerMode - If true, uses lower resolution (640x480 vs 1280x720)
   */
  initializeCamera(lowPowerMode: boolean): Promise<boolean>;

  /** Capture an image from the camera. Result delivered via onImageCaptured event. */
  captureImage(): Promise<boolean>;

  /** Release camera resources */
  releaseCamera(): Promise<boolean>;

  /** Check if camera is initialized and ready */
  isCameraReady(): Promise<boolean>;

  // ============================================================
  // Remote View Streaming (via Agora)
  // ============================================================

  /**
   * Start remote view streaming.
   * Streams the glasses camera view to remote viewers via Agora.
   * @param quality - Quality preset: "low_latency", "balanced", or "high_quality"
   */
  startRemoteView(quality: string): Promise<boolean>;

  /** Stop remote view streaming */
  stopRemoteView(): Promise<boolean>;

  /**
   * Set stream quality while streaming.
   * @param quality - Quality preset: "low_latency", "balanced", or "high_quality"
   */
  setRemoteViewQuality(quality: string): Promise<boolean>;

  /** Check if remote view is currently active */
  isRemoteViewActive(): Promise<boolean>;
}

// Export the native module
export const XRGlassesNative = requireNativeModule<XRGlassesNativeModule>('XRGlasses');

// Event types for native module events
export type ConnectionStateEvent = { connected: boolean };
export type InputEvent = { action: string; timestamp: number };
export type EngagementModeEvent = { visualsOn: boolean; audioOn: boolean };
export type DeviceStateEvent = { state: 'INACTIVE' | 'ACTIVE' | 'DESTROYED' };

// Speech recognition event types (from GlassesActivity on glasses)
export type SpeechResultEvent = {
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
};

export type PartialResultEvent = {
  text: string;
  isFinal: boolean;
  timestamp: number;
};

export type SpeechErrorEvent = {
  code: number;
  message: string;
  timestamp: number;
};

export type SpeechStateEvent = {
  isListening: boolean;
  timestamp: number;
};

// Camera capture event types
export type ImageCapturedEvent = {
  imageBase64: string;
  width: number;
  height: number;
  isEmulated: boolean;
  timestamp: number;
};

export type CameraErrorEvent = {
  message: string;
  timestamp: number;
};

export type CameraStateEvent = {
  isReady: boolean;
  isEmulated: boolean;
  timestamp: number;
};

// Remote View streaming event types
export type StreamStartedEvent = {
  channelId: string;
  viewerUrl: string;
  quality: string;
  timestamp: number;
};

export type StreamStoppedEvent = {
  timestamp: number;
};

export type StreamErrorEvent = {
  message: string;
  timestamp: number;
};

export type ViewerUpdateEvent = {
  viewerCount: number;
  viewerUid: number | null;
  viewerName: string | null;
  viewerSpeaking: boolean;
  timestamp: number;
};

export type StreamCameraSourceChangedEvent = {
  cameraSource: string;
  isEmulationMode: boolean;
  timestamp: number;
};

// Quality preset type
export type StreamQuality = 'low_latency' | 'balanced' | 'high_quality';

// Native error event type (from Kotlin error handler)
export type NativeErrorEvent = {
  message: string;
  stackTrace: string;
  isFatal: boolean;
  threadName: string;
  deviceModel: string;
  androidVersion: number;
  timestamp: number;
};

// Re-export the service module
export { createXRGlassesService, getXRGlassesService } from './src/XRGlassesModule';
export type { IXRGlassesService, DeviceCapabilities, EngagementMode } from './src/XRGlassesModule';
