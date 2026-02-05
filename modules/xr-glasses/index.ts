import { NativeModule, requireNativeModule } from 'expo-modules-core';

/** Event subscription returned by addListener */
interface EventSubscription {
  remove: () => void;
}

/**
 * Native module interface for XR Glasses communication.
 * This provides the bridge between JavaScript and the native platform implementations.
 */
interface XRGlassesNativeModule extends NativeModule {
  /** Subscribe to native events */
  addListener<T>(eventName: string, listener: (event: T) => void): EventSubscription;
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

  /** Enable/disable emulation mode for testing without glasses */
  setEmulationMode(enabled: boolean): Promise<boolean>;

  /** Simulate an input event (emulation mode only) */
  simulateInputEvent(action: string): Promise<boolean>;

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

  // ============================================================
  // Video Recording
  // ============================================================

  /** Start video recording from the specified camera source */
  startVideoRecording(cameraSource: string): Promise<boolean>;

  /** Stop video recording */
  stopVideoRecording(): Promise<boolean>;

  /** Dismiss recording (delete file, reset state) */
  dismissVideoRecording(): Promise<boolean>;

  /** Get file path of last completed recording */
  getRecordingFilePath(): Promise<string | null>;

  /** Send recording audio to transcription backend */
  sendRecordingForTranscription(language: string): Promise<TranscriptionResponse>;

  // ============================================================
  // Parking Timer (efficient coroutine-based, no CPU waste)
  // ============================================================

  /**
   * Start a parking timer with the specified duration.
   * Emits warning event 5 minutes before expiration and alarm at expiration.
   * @param durationMinutes Timer duration in minutes
   */
  startParkingTimer(durationMinutes: number): Promise<boolean>;

  /** Cancel the parking timer if running */
  cancelParkingTimer(): Promise<boolean>;

  /** Get current parking timer state */
  getParkingTimerState(): Promise<ParkingTimerState>;

  /** Stop the alarm sound (user dismisses alarm) */
  stopParkingAlarm(): Promise<boolean>;
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
  isEmulationMode: boolean;  // Note: Internally called "demo mode" in UI to avoid confusion with Android Emulator
  isDemoMode: boolean;  // Alias for isEmulationMode
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

// ============================================================
// Video Recording Types
// ============================================================

/** Possible recording states */
export type RecordingState = 'idle' | 'recording' | 'stopping' | 'stopped';

/** Event emitted when recording state changes */
export type RecordingStateChangedEvent = {
  state: RecordingState;
  durationMs?: number;
  fileUri?: string;
  timestamp: number;
};

/** Event emitted on recording error */
export type RecordingErrorEvent = {
  message: string;
  timestamp: number;
};

/** Transcription segment from speaker-diarized transcription */
export interface TranscriptionSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

/** Response from transcription backend */
export interface TranscriptionResponse {
  segments: TranscriptionSegment[];
}

// ============================================================
// Parking Timer Types
// ============================================================

/** Parking timer state returned by getParkingTimerState() */
export type ParkingTimerState = {
  isActive: boolean;
  remainingMs: number;
  endTime: number;
  durationMinutes: number;
  warningShown: boolean;
  expired: boolean;
};

/** Event emitted when parking timer is started */
export type ParkingTimerStartedEvent = {
  durationMinutes: number;
  endTime: number;
  warningTime: number;
  timestamp: number;
};

/** Event emitted 5 minutes before timer expires */
export type ParkingTimerWarningEvent = {
  remainingMinutes: number;
  remainingMs: number;
  timestamp: number;
};

/** Event emitted when parking timer expires (alarm!) */
export type ParkingTimerExpiredEvent = {
  timestamp: number;
};

/** Event emitted when parking timer is cancelled */
export type ParkingTimerCancelledEvent = {
  timestamp: number;
};

/** Event emitted when UI may need refresh (after XR permission flow on cold start) */
export type UiRefreshNeededEvent = {
  reason: string;
  timestamp: number;
};

// Re-export the service module
export { createXRGlassesService, getXRGlassesService } from './src/XRGlassesModule';
export type { IXRGlassesService, DeviceCapabilities, EngagementMode } from './src/XRGlassesModule';

// Re-export video recording event listener helpers
export function addRecordingStateChangedListener(
  callback: (event: RecordingStateChangedEvent) => void
) {
  return XRGlassesNative.addListener('onRecordingStateChanged', callback);
}

export function addRecordingErrorListener(
  callback: (event: RecordingErrorEvent) => void
) {
  return XRGlassesNative.addListener('onRecordingError', callback);
}
