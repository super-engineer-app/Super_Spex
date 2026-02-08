import { Platform } from "react-native";
import type { ParkingTimerState, TranscriptionResponse } from "../index";
import {
	type CameraErrorEvent,
	type CameraStateEvent,
	type ConnectionStateEvent,
	type DeviceStateEvent,
	type EngagementModeEvent,
	type ImageCapturedEvent,
	type InputEvent,
	type ParkingTimerCancelledEvent,
	type ParkingTimerExpiredEvent,
	type ParkingTimerStartedEvent,
	type ParkingTimerWarningEvent,
	type PartialResultEvent,
	type RecordingErrorEvent,
	type RecordingStateChangedEvent,
	type SpeechErrorEvent,
	type SpeechResultEvent,
	type SpeechStateEvent,
	type StreamCameraSourceChangedEvent,
	type StreamErrorEvent,
	type StreamQuality,
	type StreamStartedEvent,
	type StreamStoppedEvent,
	type UiRefreshNeededEvent,
	type ViewerUpdateEvent,
	XRGlassesNative,
} from "../index";

/**
 * Subscription interface for event listeners.
 */
export interface Subscription {
	remove: () => void;
}

/**
 * Device capabilities interface.
 * Reflects actual AI glasses hardware capabilities.
 */
export interface DeviceCapabilities {
	isXrPeripheral: boolean; // Device is XR glasses
	hasXrProjection: boolean; // Device can project to glasses
	hasTouchInput: boolean; // Has touchpad/touch input
	hasCamera: boolean; // Has camera
	hasMicrophone: boolean; // Has microphone
	hasAudioOutput: boolean; // Has speakers
	isEmulated?: boolean;
	deviceType?: string;
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

	// ============================================================
	// Speech Recognition (runs on glasses via GlassesActivity)
	// ============================================================

	/**
	 * Start speech recognition on glasses.
	 * This launches GlassesActivity which runs SpeechRecognizer directly on glasses hardware,
	 * avoiding Bluetooth audio latency.
	 * @param continuous - If true, continuously restarts after each result
	 */
	startSpeechRecognition(continuous?: boolean): Promise<boolean>;

	/** Stop speech recognition */
	stopSpeechRecognition(): Promise<boolean>;

	/** Check if speech recognition is available */
	isSpeechRecognitionAvailable(): Promise<boolean>;

	// Event subscriptions
	onConnectionStateChanged(
		callback: (event: ConnectionStateEvent) => void,
	): Subscription;
	onInputEvent(callback: (event: InputEvent) => void): Subscription;
	onEngagementModeChanged(
		callback: (event: EngagementModeEvent) => void,
	): Subscription;
	onDeviceStateChanged(
		callback: (event: DeviceStateEvent) => void,
	): Subscription;

	// Speech recognition events (from glasses)
	onSpeechResult(callback: (event: SpeechResultEvent) => void): Subscription;
	onPartialResult(callback: (event: PartialResultEvent) => void): Subscription;
	onSpeechError(callback: (event: SpeechErrorEvent) => void): Subscription;
	onSpeechStateChanged(
		callback: (event: SpeechStateEvent) => void,
	): Subscription;

	// ============================================================
	// Camera Capture (uses ProjectedContext for glasses camera)
	// ============================================================

	/**
	 * Initialize camera for capturing images from glasses.
	 * Uses ProjectedContext to access glasses camera when connected.
	 * Falls back to phone camera in emulation mode.
	 * @param lowPowerMode - If true, uses lower resolution (640x480 vs 1280x720)
	 */
	initializeCamera(lowPowerMode?: boolean): Promise<boolean>;

	/** Capture an image from the camera. Result delivered via onImageCaptured event. */
	captureImage(): Promise<boolean>;

	/** Release camera resources */
	releaseCamera(): Promise<boolean>;

	/** Check if camera is initialized and ready */
	isCameraReady(): Promise<boolean>;

	// Camera events
	onImageCaptured(callback: (event: ImageCapturedEvent) => void): Subscription;
	onCameraError(callback: (event: CameraErrorEvent) => void): Subscription;
	onCameraStateChanged(
		callback: (event: CameraStateEvent) => void,
	): Subscription;

	// ============================================================
	// Video Recording
	// ============================================================

	/** Start video recording from specified camera source ("phone" or "glasses") */
	startVideoRecording(cameraSource: string): Promise<boolean>;

	/** Stop video recording */
	stopVideoRecording(): Promise<boolean>;

	/** Dismiss recording (delete file, reset state) */
	dismissVideoRecording(): Promise<boolean>;

	/** Get file path of last completed recording */
	getRecordingFilePath(): Promise<string | null>;

	/** Send recording audio to transcription backend */
	sendRecordingForTranscription(
		language: string,
	): Promise<TranscriptionResponse>;

	// Video recording events
	onRecordingStateChanged(
		callback: (event: RecordingStateChangedEvent) => void,
	): Subscription;
	onRecordingError(
		callback: (event: RecordingErrorEvent) => void,
	): Subscription;

	// UI events
	onUiRefreshNeeded(
		callback: (event: UiRefreshNeededEvent) => void,
	): Subscription;
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
		return XRGlassesNative.setEmulationMode(enabled);
	}

	async simulateInputEvent(action: string): Promise<boolean> {
		return XRGlassesNative.simulateInputEvent(action);
	}

	onConnectionStateChanged(
		callback: (event: ConnectionStateEvent) => void,
	): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onConnectionStateChanged",
			callback,
		);
		return { remove: () => subscription.remove() };
	}

	onInputEvent(callback: (event: InputEvent) => void): Subscription {
		const subscription = XRGlassesNative.addListener("onInputEvent", callback);
		return { remove: () => subscription.remove() };
	}

	onEngagementModeChanged(
		callback: (event: EngagementModeEvent) => void,
	): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onEngagementModeChanged",
			callback,
		);
		return { remove: () => subscription.remove() };
	}

	onDeviceStateChanged(
		callback: (event: DeviceStateEvent) => void,
	): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onDeviceStateChanged",
			callback,
		);
		return { remove: () => subscription.remove() };
	}

	// Speech recognition methods (control GlassesActivity on glasses)
	async startSpeechRecognition(continuous: boolean = true): Promise<boolean> {
		return XRGlassesNative.startSpeechRecognition(continuous);
	}

	async stopSpeechRecognition(): Promise<boolean> {
		return XRGlassesNative.stopSpeechRecognition();
	}

	async isSpeechRecognitionAvailable(): Promise<boolean> {
		return XRGlassesNative.isSpeechRecognitionAvailable();
	}

	// Speech recognition event subscriptions
	onSpeechResult(callback: (event: SpeechResultEvent) => void): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onSpeechResult",
			callback,
		);
		return { remove: () => subscription.remove() };
	}

	onPartialResult(callback: (event: PartialResultEvent) => void): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onPartialResult",
			callback,
		);
		return { remove: () => subscription.remove() };
	}

	onSpeechError(callback: (event: SpeechErrorEvent) => void): Subscription {
		const subscription = XRGlassesNative.addListener("onSpeechError", callback);
		return { remove: () => subscription.remove() };
	}

	onSpeechStateChanged(
		callback: (event: SpeechStateEvent) => void,
	): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onSpeechStateChanged",
			callback,
		);
		return { remove: () => subscription.remove() };
	}

	// Camera capture methods
	async initializeCamera(lowPowerMode: boolean = false): Promise<boolean> {
		return XRGlassesNative.initializeCamera(lowPowerMode);
	}

	async captureImage(): Promise<boolean> {
		return XRGlassesNative.captureImage();
	}

	async releaseCamera(): Promise<boolean> {
		return XRGlassesNative.releaseCamera();
	}

	async isCameraReady(): Promise<boolean> {
		return XRGlassesNative.isCameraReady();
	}

	// Camera event subscriptions
	onImageCaptured(callback: (event: ImageCapturedEvent) => void): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onImageCaptured",
			callback,
		);
		return { remove: () => subscription.remove() };
	}

	onCameraError(callback: (event: CameraErrorEvent) => void): Subscription {
		const subscription = XRGlassesNative.addListener("onCameraError", callback);
		return { remove: () => subscription.remove() };
	}

	onCameraStateChanged(
		callback: (event: CameraStateEvent) => void,
	): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onCameraStateChanged",
			callback,
		);
		return { remove: () => subscription.remove() };
	}

	// Video recording methods
	async startVideoRecording(cameraSource: string): Promise<boolean> {
		return XRGlassesNative.startVideoRecording(cameraSource);
	}

	async stopVideoRecording(): Promise<boolean> {
		return XRGlassesNative.stopVideoRecording();
	}

	async dismissVideoRecording(): Promise<boolean> {
		return XRGlassesNative.dismissVideoRecording();
	}

	async getRecordingFilePath(): Promise<string | null> {
		return XRGlassesNative.getRecordingFilePath();
	}

	async sendRecordingForTranscription(
		language: string,
	): Promise<TranscriptionResponse> {
		return XRGlassesNative.sendRecordingForTranscription(language);
	}

	// Video recording event subscriptions
	onRecordingStateChanged(
		callback: (event: RecordingStateChangedEvent) => void,
	): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onRecordingStateChanged",
			callback,
		);
		return { remove: () => subscription.remove() };
	}

	onRecordingError(
		callback: (event: RecordingErrorEvent) => void,
	): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onRecordingError",
			callback,
		);
		return { remove: () => subscription.remove() };
	}

	// UI event subscriptions
	onUiRefreshNeeded(
		callback: (event: UiRefreshNeededEvent) => void,
	): Subscription {
		const subscription = XRGlassesNative.addListener(
			"onUiRefreshNeeded",
			callback,
		);
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
		console.warn("iOS XR Glasses not yet implemented - Phase 2");
	}

	async isProjectedDevice(): Promise<boolean> {
		return false;
	}

	async isGlassesConnected(): Promise<boolean> {
		return false;
	}

	async connect(): Promise<boolean> {
		throw new Error("iOS XR Glasses not yet implemented");
	}

	async disconnect(): Promise<boolean> {
		throw new Error("iOS XR Glasses not yet implemented");
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
			isXrPeripheral: false,
			hasXrProjection: false,
			hasTouchInput: false,
			hasCamera: false,
			hasMicrophone: false,
			hasAudioOutput: false,
		};
	}

	async setEmulationMode(_enabled: boolean): Promise<boolean> {
		console.warn("iOS emulation mode not yet implemented");
		return false;
	}

	async simulateInputEvent(_action: string): Promise<boolean> {
		console.warn("iOS input simulation not yet implemented");
		return false;
	}

	onConnectionStateChanged(
		_callback: (event: ConnectionStateEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	onInputEvent(_callback: (event: InputEvent) => void): Subscription {
		return { remove: () => {} };
	}

	onEngagementModeChanged(
		_callback: (event: EngagementModeEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	onDeviceStateChanged(
		_callback: (event: DeviceStateEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	// Speech recognition stubs for iOS
	async startSpeechRecognition(_continuous?: boolean): Promise<boolean> {
		console.warn("iOS speech recognition not yet implemented");
		throw new Error("iOS speech recognition not yet implemented");
	}

	async stopSpeechRecognition(): Promise<boolean> {
		throw new Error("iOS speech recognition not yet implemented");
	}

	async isSpeechRecognitionAvailable(): Promise<boolean> {
		return false;
	}

	onSpeechResult(_callback: (event: SpeechResultEvent) => void): Subscription {
		return { remove: () => {} };
	}

	onPartialResult(
		_callback: (event: PartialResultEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	onSpeechError(_callback: (event: SpeechErrorEvent) => void): Subscription {
		return { remove: () => {} };
	}

	onSpeechStateChanged(
		_callback: (event: SpeechStateEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	// Camera stubs for iOS
	async initializeCamera(_lowPowerMode?: boolean): Promise<boolean> {
		console.warn("iOS camera not yet implemented");
		throw new Error("iOS camera not yet implemented");
	}

	async captureImage(): Promise<boolean> {
		throw new Error("iOS camera not yet implemented");
	}

	async releaseCamera(): Promise<boolean> {
		return true;
	}

	async isCameraReady(): Promise<boolean> {
		return false;
	}

	onImageCaptured(
		_callback: (event: ImageCapturedEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	onCameraError(_callback: (event: CameraErrorEvent) => void): Subscription {
		return { remove: () => {} };
	}

	onCameraStateChanged(
		_callback: (event: CameraStateEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	// Video recording stubs for iOS
	async startVideoRecording(_cameraSource: string): Promise<boolean> {
		throw new Error("iOS video recording not yet implemented");
	}

	async stopVideoRecording(): Promise<boolean> {
		throw new Error("iOS video recording not yet implemented");
	}

	async dismissVideoRecording(): Promise<boolean> {
		return true;
	}

	async getRecordingFilePath(): Promise<string | null> {
		return null;
	}

	async sendRecordingForTranscription(
		_language: string,
	): Promise<TranscriptionResponse> {
		throw new Error("iOS transcription not yet implemented");
	}

	onRecordingStateChanged(
		_callback: (event: RecordingStateChangedEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	onRecordingError(
		_callback: (event: RecordingErrorEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	onUiRefreshNeeded(
		_callback: (event: UiRefreshNeededEvent) => void,
	): Subscription {
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
	private connectionCallbacks: Set<(event: ConnectionStateEvent) => void> =
		new Set();
	private inputCallbacks: Set<(event: InputEvent) => void> = new Set();
	private engagementCallbacks: Set<(event: EngagementModeEvent) => void> =
		new Set();
	private deviceStateCallbacks: Set<(event: DeviceStateEvent) => void> =
		new Set();
	// Speech recognition callbacks for emulation
	private speechResultCallbacks: Set<(event: SpeechResultEvent) => void> =
		new Set();
	private partialResultCallbacks: Set<(event: PartialResultEvent) => void> =
		new Set();
	private speechErrorCallbacks: Set<(event: SpeechErrorEvent) => void> =
		new Set();
	private speechStateCallbacks: Set<(event: SpeechStateEvent) => void> =
		new Set();
	private isListening = false;

	async initialize(): Promise<void> {
		console.log("[WebXR] Initialized in web mode - using emulation");
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
			throw new Error("Enable emulation mode first");
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
		this.connected = true;
		this.engagementMode = { visualsOn: true, audioOn: true };
		this.connectionCallbacks.forEach((cb) => cb({ connected: true }));
		this.engagementCallbacks.forEach((cb) => cb(this.engagementMode));
		return true;
	}

	async disconnect(): Promise<boolean> {
		this.connected = false;
		this.engagementMode = { visualsOn: false, audioOn: false };
		this.connectionCallbacks.forEach((cb) => cb({ connected: false }));
		return true;
	}

	async isDisplayCapable(): Promise<boolean> {
		return this.connected && this.engagementMode.visualsOn;
	}

	async keepScreenOn(_enabled: boolean): Promise<boolean> {
		console.log("[WebXR] keepScreenOn:", _enabled);
		return true;
	}

	async getEngagementMode(): Promise<EngagementMode> {
		return this.engagementMode;
	}

	async getDeviceCapabilities(): Promise<DeviceCapabilities> {
		return {
			isXrPeripheral: true,
			hasXrProjection: false,
			hasTouchInput: true,
			hasCamera: true,
			hasMicrophone: true,
			hasAudioOutput: true,
			isEmulated: true,
			deviceType: "emulated_glasses",
		};
	}

	async setEmulationMode(enabled: boolean): Promise<boolean> {
		this.emulationEnabled = enabled;
		this.deviceStateCallbacks.forEach((cb) =>
			cb({ state: enabled ? "ACTIVE" : "INACTIVE" }),
		);
		return true;
	}

	async simulateInputEvent(action: string): Promise<boolean> {
		const event: InputEvent = { action, timestamp: Date.now() };
		this.inputCallbacks.forEach((cb) => cb(event));

		if (action === "TOGGLE_VISUALS") {
			this.engagementMode = {
				...this.engagementMode,
				visualsOn: !this.engagementMode.visualsOn,
			};
			this.engagementCallbacks.forEach((cb) => cb(this.engagementMode));
		} else if (action === "TOGGLE_AUDIO") {
			this.engagementMode = {
				...this.engagementMode,
				audioOn: !this.engagementMode.audioOn,
			};
			this.engagementCallbacks.forEach((cb) => cb(this.engagementMode));
		}
		return true;
	}

	onConnectionStateChanged(
		callback: (event: ConnectionStateEvent) => void,
	): Subscription {
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

	onEngagementModeChanged(
		callback: (event: EngagementModeEvent) => void,
	): Subscription {
		this.engagementCallbacks.add(callback);
		return {
			remove: () => {
				this.engagementCallbacks.delete(callback);
			},
		};
	}

	onDeviceStateChanged(
		callback: (event: DeviceStateEvent) => void,
	): Subscription {
		this.deviceStateCallbacks.add(callback);
		return {
			remove: () => {
				this.deviceStateCallbacks.delete(callback);
			},
		};
	}

	// Speech recognition for web emulation
	async startSpeechRecognition(continuous: boolean = true): Promise<boolean> {
		console.log("[WebXR] Speech recognition started (emulation)", {
			continuous,
		});
		this.isListening = true;
		this.speechStateCallbacks.forEach((cb) =>
			cb({
				isListening: true,
				timestamp: Date.now(),
			}),
		);
		return true;
	}

	async stopSpeechRecognition(): Promise<boolean> {
		console.log("[WebXR] Speech recognition stopped (emulation)");
		this.isListening = false;
		this.speechStateCallbacks.forEach((cb) =>
			cb({
				isListening: false,
				timestamp: Date.now(),
			}),
		);
		return true;
	}

	async isSpeechRecognitionAvailable(): Promise<boolean> {
		return true; // Always available in emulation
	}

	/**
	 * Simulate a speech result for testing.
	 * Call this from dev tools or test code to simulate voice input.
	 */
	simulateSpeechResult(text: string, confidence: number = 0.95): void {
		this.speechResultCallbacks.forEach((cb) =>
			cb({
				text,
				confidence,
				isFinal: true,
				timestamp: Date.now(),
			}),
		);
	}

	/**
	 * Simulate a partial speech result for testing.
	 */
	simulatePartialResult(text: string): void {
		this.partialResultCallbacks.forEach((cb) =>
			cb({
				text,
				isFinal: false,
				timestamp: Date.now(),
			}),
		);
	}

	onSpeechResult(callback: (event: SpeechResultEvent) => void): Subscription {
		this.speechResultCallbacks.add(callback);
		return {
			remove: () => {
				this.speechResultCallbacks.delete(callback);
			},
		};
	}

	onPartialResult(callback: (event: PartialResultEvent) => void): Subscription {
		this.partialResultCallbacks.add(callback);
		return {
			remove: () => {
				this.partialResultCallbacks.delete(callback);
			},
		};
	}

	onSpeechError(callback: (event: SpeechErrorEvent) => void): Subscription {
		this.speechErrorCallbacks.add(callback);
		return {
			remove: () => {
				this.speechErrorCallbacks.delete(callback);
			},
		};
	}

	onSpeechStateChanged(
		callback: (event: SpeechStateEvent) => void,
	): Subscription {
		this.speechStateCallbacks.add(callback);
		return {
			remove: () => {
				this.speechStateCallbacks.delete(callback);
			},
		};
	}

	// Camera capture for web emulation
	private cameraReady = false;
	private imageCapturedCallbacks: Set<(event: ImageCapturedEvent) => void> =
		new Set();
	private cameraErrorCallbacks: Set<(event: CameraErrorEvent) => void> =
		new Set();
	private cameraStateCallbacks: Set<(event: CameraStateEvent) => void> =
		new Set();

	async initializeCamera(_lowPowerMode?: boolean): Promise<boolean> {
		console.log("[WebXR] Camera initialized (emulation)");
		this.cameraReady = true;
		this.cameraStateCallbacks.forEach((cb) =>
			cb({
				isReady: true,
				isEmulated: true,
				timestamp: Date.now(),
			}),
		);
		return true;
	}

	async captureImage(): Promise<boolean> {
		console.log("[WebXR] Capturing image (emulation)");
		// Simulate capture with a placeholder
		this.imageCapturedCallbacks.forEach((cb) =>
			cb({
				imageBase64: "", // Empty for emulation
				width: 640,
				height: 480,
				isEmulated: true,
				timestamp: Date.now(),
			}),
		);
		return true;
	}

	async releaseCamera(): Promise<boolean> {
		console.log("[WebXR] Camera released (emulation)");
		this.cameraReady = false;
		this.cameraStateCallbacks.forEach((cb) =>
			cb({
				isReady: false,
				isEmulated: true,
				timestamp: Date.now(),
			}),
		);
		return true;
	}

	async isCameraReady(): Promise<boolean> {
		return this.cameraReady;
	}

	onImageCaptured(callback: (event: ImageCapturedEvent) => void): Subscription {
		this.imageCapturedCallbacks.add(callback);
		return {
			remove: () => {
				this.imageCapturedCallbacks.delete(callback);
			},
		};
	}

	onCameraError(callback: (event: CameraErrorEvent) => void): Subscription {
		this.cameraErrorCallbacks.add(callback);
		return {
			remove: () => {
				this.cameraErrorCallbacks.delete(callback);
			},
		};
	}

	onCameraStateChanged(
		callback: (event: CameraStateEvent) => void,
	): Subscription {
		this.cameraStateCallbacks.add(callback);
		return {
			remove: () => {
				this.cameraStateCallbacks.delete(callback);
			},
		};
	}

	// Video recording stubs for web emulation
	async startVideoRecording(_cameraSource: string): Promise<boolean> {
		console.log("[WebXR] Video recording started (emulation)");
		return true;
	}

	async stopVideoRecording(): Promise<boolean> {
		console.log("[WebXR] Video recording stopped (emulation)");
		return true;
	}

	async dismissVideoRecording(): Promise<boolean> {
		console.log("[WebXR] Video recording dismissed (emulation)");
		return true;
	}

	async getRecordingFilePath(): Promise<string | null> {
		return null;
	}

	async sendRecordingForTranscription(
		_language: string,
	): Promise<TranscriptionResponse> {
		console.log("[WebXR] Transcription requested (emulation)");
		return {
			segments: [
				{
					speaker: "Speaker 0",
					text: "Emulated transcription segment",
					start: 0,
					end: 1,
				},
			],
		};
	}

	onRecordingStateChanged(
		_callback: (event: RecordingStateChangedEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	onRecordingError(
		_callback: (event: RecordingErrorEvent) => void,
	): Subscription {
		return { remove: () => {} };
	}

	onUiRefreshNeeded(
		_callback: (event: UiRefreshNeededEvent) => void,
	): Subscription {
		// Web doesn't have XR permission flows that would cause UI corruption
		return { remove: () => {} };
	}
}

/**
 * Factory function - returns platform-specific implementation.
 */
export function createXRGlassesService(): IXRGlassesService {
	switch (Platform.OS) {
		case "android":
			return new AndroidXRGlassesService();
		case "ios":
			return new IOSXRGlassesService();
		case "web":
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
