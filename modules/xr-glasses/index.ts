import { type NativeModule, requireNativeModule } from "expo-modules-core";
import type { ParkingTimerState, TranscriptionResponse } from "./types";

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
	addListener<T>(
		eventName: string,
		listener: (event: T) => void,
	): EventSubscription;
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

	startSpeechRecognition(continuous: boolean): Promise<boolean>;
	stopSpeechRecognition(): Promise<boolean>;
	isSpeechRecognitionAvailable(): Promise<boolean>;

	// ============================================================
	// Camera Capture (uses ProjectedContext for glasses camera)
	// ============================================================

	initializeCamera(lowPowerMode: boolean): Promise<boolean>;
	captureImage(): Promise<boolean>;
	releaseCamera(): Promise<boolean>;
	isCameraReady(): Promise<boolean>;

	// ============================================================
	// Remote View Streaming (via Agora)
	// ============================================================

	startRemoteView(quality: string): Promise<boolean>;
	stopRemoteView(): Promise<boolean>;
	setRemoteViewQuality(quality: string): Promise<boolean>;
	isRemoteViewActive(): Promise<boolean>;

	// ============================================================
	// Video Recording
	// ============================================================

	startVideoRecording(cameraSource: string): Promise<boolean>;
	stopVideoRecording(): Promise<boolean>;
	dismissVideoRecording(): Promise<boolean>;
	getRecordingFilePath(): Promise<string | null>;
	sendRecordingForTranscription(
		language: string,
	): Promise<TranscriptionResponse>;

	// ============================================================
	// Parking Timer (efficient coroutine-based, no CPU waste)
	// ============================================================

	startParkingTimer(durationMinutes: number): Promise<boolean>;
	cancelParkingTimer(): Promise<boolean>;
	getParkingTimerState(): Promise<ParkingTimerState>;
	stopParkingAlarm(): Promise<boolean>;
}

// Export the native module
export const XRGlassesNative =
	requireNativeModule<XRGlassesNativeModule>("XRGlasses");

export type {
	DeviceCapabilities,
	EngagementMode,
	IXRGlassesService,
	Subscription,
} from "./src/XRGlassesModule";
// Re-export the service module
export {
	createXRGlassesService,
	getXRGlassesService,
} from "./src/XRGlassesModule";
// Re-export all shared types from types.ts (single source of truth)
export type {
	CameraErrorEvent,
	CameraStateEvent,
	ConnectionStateEvent,
	DeviceStateEvent,
	EngagementModeEvent,
	ImageCapturedEvent,
	InputEvent,
	NativeErrorEvent,
	ParkingTimerCancelledEvent,
	ParkingTimerExpiredEvent,
	ParkingTimerStartedEvent,
	ParkingTimerState,
	ParkingTimerWarningEvent,
	PartialResultEvent,
	RecordingErrorEvent,
	RecordingState,
	RecordingStateChangedEvent,
	SpeechErrorEvent,
	SpeechResultEvent,
	SpeechStateEvent,
	StreamCameraSourceChangedEvent,
	StreamErrorEvent,
	StreamQuality,
	StreamStartedEvent,
	StreamStoppedEvent,
	TranscriptionResponse,
	TranscriptionSegment,
	UiRefreshNeededEvent,
	ViewerUpdateEvent,
} from "./types";

// Re-export video recording event listener helpers
export function addRecordingStateChangedListener(
	callback: (event: {
		state: string;
		durationMs?: number;
		fileUri?: string;
		timestamp: number;
	}) => void,
) {
	return XRGlassesNative.addListener("onRecordingStateChanged", callback);
}

export function addRecordingErrorListener(
	callback: (event: { message: string; timestamp: number }) => void,
) {
	return XRGlassesNative.addListener("onRecordingError", callback);
}
