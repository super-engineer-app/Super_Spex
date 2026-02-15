/**
 * Web implementation of XRGlassesService.
 *
 * Uses real browser APIs: Web Speech API, getUserMedia, MediaRecorder.
 * Remote View is stubbed (no glasses camera to stream on web).
 * Parking timer uses pure JS setTimeout.
 */

import type {
	CameraErrorEvent,
	CameraStateEvent,
	ConnectionStateEvent,
	DeviceStateEvent,
	EngagementModeEvent,
	ImageCapturedEvent,
	InputEvent,
	ParkingTimerCancelledEvent,
	ParkingTimerExpiredEvent,
	ParkingTimerStartedEvent,
	ParkingTimerState,
	ParkingTimerWarningEvent,
	PartialResultEvent,
	RecordingErrorEvent,
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
	ViewerUpdateEvent,
} from "../types";

// Re-export shared interface types so index.web.ts can import from here
export type {
	DeviceCapabilities,
	EngagementMode,
	IXRGlassesService,
	Subscription,
} from "./XRGlassesModule";

/**
 * Subscription interface for event listeners.
 */
interface Subscription {
	remove: () => void;
}

interface EngagementMode {
	visualsOn: boolean;
	audioOn: boolean;
}

interface DeviceCapabilities {
	isXrPeripheral: boolean;
	hasXrProjection: boolean;
	hasTouchInput: boolean;
	hasCamera: boolean;
	hasMicrophone: boolean;
	hasAudioOutput: boolean;
	isEmulated?: boolean;
	deviceType?: string;
}

// Web Speech API type declarations
interface SpeechRecognitionEvent {
	results: SpeechRecognitionResultList;
	resultIndex: number;
}

interface SpeechRecognitionResultList {
	readonly length: number;
	item(index: number): SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
	readonly length: number;
	readonly isFinal: boolean;
	item(index: number): SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
	readonly transcript: string;
	readonly confidence: number;
}

interface SpeechRecognitionErrorEvent {
	error: string;
	message: string;
}

interface WebSpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	onresult: ((event: SpeechRecognitionEvent) => void) | null;
	onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
	onend: (() => void) | null;
	onstart: (() => void) | null;
	start(): void;
	stop(): void;
	abort(): void;
}

declare global {
	interface Window {
		SpeechRecognition?: new () => WebSpeechRecognition;
		webkitSpeechRecognition?: new () => WebSpeechRecognition;
	}
}

/** Emit an event to all callbacks in a Set */
function emit<T>(callbacks: Set<(event: T) => void>, event: T): void {
	for (const cb of callbacks) {
		cb(event);
	}
}

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || "";

class WebXRGlassesService {
	private emulationEnabled = false;
	private connected = false;
	private engagementMode: EngagementMode = { visualsOn: false, audioOn: false };

	// Event callback sets
	private connectionCallbacks = new Set<
		(event: ConnectionStateEvent) => void
	>();
	private inputCallbacks = new Set<(event: InputEvent) => void>();
	private engagementCallbacks = new Set<(event: EngagementModeEvent) => void>();
	private deviceStateCallbacks = new Set<(event: DeviceStateEvent) => void>();
	private speechResultCallbacks = new Set<(event: SpeechResultEvent) => void>();
	private partialResultCallbacks = new Set<
		(event: PartialResultEvent) => void
	>();
	private speechErrorCallbacks = new Set<(event: SpeechErrorEvent) => void>();
	private speechStateCallbacks = new Set<(event: SpeechStateEvent) => void>();
	private imageCapturedCallbacks = new Set<
		(event: ImageCapturedEvent) => void
	>();
	private cameraErrorCallbacks = new Set<(event: CameraErrorEvent) => void>();
	private cameraStateCallbacks = new Set<(event: CameraStateEvent) => void>();
	private recordingStateCallbacks = new Set<
		(event: RecordingStateChangedEvent) => void
	>();
	private recordingErrorCallbacks = new Set<
		(event: RecordingErrorEvent) => void
	>();
	private parkingTimerStartedCallbacks = new Set<
		(event: ParkingTimerStartedEvent) => void
	>();
	private parkingTimerWarningCallbacks = new Set<
		(event: ParkingTimerWarningEvent) => void
	>();
	private parkingTimerExpiredCallbacks = new Set<
		(event: ParkingTimerExpiredEvent) => void
	>();
	private parkingTimerCancelledCallbacks = new Set<
		(event: ParkingTimerCancelledEvent) => void
	>();

	// Speech recognition state
	private recognition: WebSpeechRecognition | null = null;
	private continuousMode = false;
	private shouldRestart = false;

	// Network speech fallback (for browsers without Web Speech API, e.g. Firefox)
	private networkSpeechStream: MediaStream | null = null;
	private networkSpeechRecorder: MediaRecorder | null = null;
	private networkSpeechActive = false;
	private useNetworkFallback = false;
	private networkSpeechTimeout: ReturnType<typeof setTimeout> | null = null;

	// Camera state
	private cameraStream: MediaStream | null = null;
	private videoElement: HTMLVideoElement | null = null;
	private canvasElement: HTMLCanvasElement | null = null;

	// Recording state
	private mediaRecorder: MediaRecorder | null = null;
	private recordingChunks: Blob[] = [];
	private lastRecordingBlob: Blob | null = null;
	private lastRecordingUrl: string | null = null;

	// Remote View / Agora streaming state
	// Using `unknown` for Agora SDK types to avoid static import (dynamic import at runtime)
	private agoraClient: unknown = null;
	private agoraLocalAudioTrack: unknown = null;
	private agoraLocalVideoTrack: unknown = null;
	private remoteViewActive = false;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: used via this.remoteViewChannelId in startRemoteView/stopRemoteView
	private remoteViewChannelId: string | null = null;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: used via this.remoteViewQuality in startRemoteView/setRemoteViewQuality
	private remoteViewQuality: StreamQuality = "balanced";
	private streamStartedCallbacks = new Set<
		(event: StreamStartedEvent) => void
	>();
	private streamStoppedCallbacks = new Set<
		(event: StreamStoppedEvent) => void
	>();
	private streamErrorCallbacks = new Set<(event: StreamErrorEvent) => void>();
	private viewerUpdateCallbacks = new Set<(event: ViewerUpdateEvent) => void>();
	private streamCameraSourceCallbacks = new Set<
		(event: StreamCameraSourceChangedEvent) => void
	>();

	// Parking timer state
	private parkingTimerWarningTimeout: ReturnType<typeof setTimeout> | null =
		null;
	private parkingTimerExpiryTimeout: ReturnType<typeof setTimeout> | null =
		null;
	private parkingTimerEndTime = 0;
	private parkingTimerDuration = 0;
	private parkingTimerActive = false;
	private parkingTimerWarningShown = false;
	private parkingTimerExpired = false;

	// ============================================================
	// Core
	// ============================================================

	async initialize(): Promise<void> {
		console.log("[WebXR] Initialized in web mode");
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
		await new Promise((resolve) => setTimeout(resolve, 300));
		this.connected = true;
		this.engagementMode = { visualsOn: true, audioOn: true };
		emit(this.connectionCallbacks, { connected: true });
		emit(this.engagementCallbacks, this.engagementMode);
		return true;
	}

	async disconnect(): Promise<boolean> {
		this.connected = false;
		this.engagementMode = { visualsOn: false, audioOn: false };
		emit(this.connectionCallbacks, { connected: false });
		return true;
	}

	async isDisplayCapable(): Promise<boolean> {
		return this.connected && this.engagementMode.visualsOn;
	}

	async keepScreenOn(_enabled: boolean): Promise<boolean> {
		return true;
	}

	async getEngagementMode(): Promise<EngagementMode> {
		return this.engagementMode;
	}

	async getDeviceCapabilities(): Promise<DeviceCapabilities> {
		const hasMedia =
			typeof navigator !== "undefined" && !!navigator.mediaDevices;
		return {
			isXrPeripheral: false,
			hasXrProjection: false,
			hasTouchInput: true,
			hasCamera: hasMedia,
			hasMicrophone: hasMedia,
			hasAudioOutput: true,
			isEmulated: true,
			deviceType: "web_browser",
		};
	}

	async setEmulationMode(enabled: boolean): Promise<boolean> {
		this.emulationEnabled = enabled;
		emit(this.deviceStateCallbacks, {
			state: enabled ? "ACTIVE" : "INACTIVE",
		});
		return true;
	}

	async simulateInputEvent(action: string): Promise<boolean> {
		emit(this.inputCallbacks, { action, timestamp: Date.now() });
		if (action === "TOGGLE_VISUALS") {
			this.engagementMode = {
				...this.engagementMode,
				visualsOn: !this.engagementMode.visualsOn,
			};
			emit(this.engagementCallbacks, this.engagementMode);
		} else if (action === "TOGGLE_AUDIO") {
			this.engagementMode = {
				...this.engagementMode,
				audioOn: !this.engagementMode.audioOn,
			};
			emit(this.engagementCallbacks, this.engagementMode);
		}
		return true;
	}

	// Core event subscriptions
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

	// ============================================================
	// Speech Recognition — Web Speech API
	// ============================================================

	async startSpeechRecognition(continuous: boolean = true): Promise<boolean> {
		const SpeechRecognitionClass =
			typeof window !== "undefined"
				? window.SpeechRecognition || window.webkitSpeechRecognition
				: undefined;

		console.log("[WebXR] startSpeechRecognition:", {
			continuous,
			hasSpeechAPI: !!SpeechRecognitionClass,
		});

		if (!SpeechRecognitionClass) {
			// Fall back to network-based speech recognition (Firefox, etc.)
			return this.startNetworkSpeechRecognition(continuous);
		}

		this.continuousMode = continuous;
		this.shouldRestart = continuous;

		const recognition = new SpeechRecognitionClass();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = "en-US";

		recognition.onstart = () => {
			console.log("[WebXR] Speech recognition started");
			emit(this.speechStateCallbacks, {
				isListening: true,
				timestamp: Date.now(),
			});
		};

		recognition.onresult = (event: SpeechRecognitionEvent) => {
			console.log(
				"[WebXR] Speech result event, results:",
				event.results.length,
			);
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				const transcript = result[0].transcript;
				const confidence = result[0].confidence;

				if (result.isFinal) {
					emit(this.speechResultCallbacks, {
						text: transcript,
						confidence,
						isFinal: true,
						timestamp: Date.now(),
					});
				} else {
					emit(this.partialResultCallbacks, {
						text: transcript,
						isFinal: false,
						timestamp: Date.now(),
					});
				}
			}
		};

		recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
			console.log(
				"[WebXR] Speech recognition error:",
				event.error,
				event.message,
			);
			// "no-speech" and "aborted" are normal — don't treat as errors
			if (event.error === "no-speech" || event.error === "aborted") {
				return;
			}
			emit(this.speechErrorCallbacks, {
				code: -1,
				message: event.error,
				timestamp: Date.now(),
			});
		};

		recognition.onend = () => {
			if (this.shouldRestart && this.continuousMode) {
				try {
					recognition.start();
				} catch {
					// Already started or other error — ignore
				}
				return;
			}
			emit(this.speechStateCallbacks, {
				isListening: false,
				timestamp: Date.now(),
			});
		};

		this.recognition = recognition;
		recognition.start();
		return true;
	}

	async stopSpeechRecognition(): Promise<boolean> {
		if (this.useNetworkFallback) {
			this.stopNetworkSpeechRecognition();
			return true;
		}
		this.shouldRestart = false;
		if (this.recognition) {
			this.recognition.stop();
			this.recognition = null;
		}
		emit(this.speechStateCallbacks, {
			isListening: false,
			timestamp: Date.now(),
		});
		return true;
	}

	async isSpeechRecognitionAvailable(): Promise<boolean> {
		if (typeof window === "undefined") return false;
		// Web Speech API available (Chrome, Edge, Safari)
		if (window.SpeechRecognition || window.webkitSpeechRecognition) {
			return true;
		}
		// Network fallback available (Firefox, etc.) — needs mic + MediaRecorder
		return (
			!!navigator.mediaDevices?.getUserMedia &&
			typeof MediaRecorder !== "undefined"
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

	// ============================================================
	// Network Speech Fallback — MediaRecorder + /transcribe-dia
	// ============================================================

	private async startNetworkSpeechRecognition(
		continuous: boolean,
	): Promise<boolean> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			this.networkSpeechStream = stream;
			this.networkSpeechActive = true;
			this.useNetworkFallback = true;

			emit(this.speechStateCallbacks, {
				isListening: true,
				timestamp: Date.now(),
			});

			this.runNetworkSpeechCycle(stream, continuous);
			return true;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Microphone access denied";
			emit(this.speechErrorCallbacks, {
				code: -1,
				message,
				timestamp: Date.now(),
			});
			return false;
		}
	}

	private runNetworkSpeechCycle(stream: MediaStream, continuous: boolean) {
		if (!this.networkSpeechActive) return;

		const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
			? "audio/webm;codecs=opus"
			: "audio/webm";

		const recorder = new MediaRecorder(stream, { mimeType });
		this.networkSpeechRecorder = recorder;
		const chunks: Blob[] = [];

		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				chunks.push(event.data);
			}
		};

		recorder.onstop = () => {
			// Guard: don't process or restart if we've been stopped
			if (!this.networkSpeechActive) return;

			if (chunks.length > 0) {
				const blob = new Blob(chunks, { type: mimeType });
				this.sendAudioChunkForTranscription(blob);
			}

			// Start next cycle if still active and continuous
			if (this.networkSpeechActive && continuous) {
				this.runNetworkSpeechCycle(stream, continuous);
			}
		};

		recorder.start();

		// Stop after 3 seconds to send the chunk
		this.networkSpeechTimeout = setTimeout(() => {
			if (this.networkSpeechActive && recorder.state === "recording") {
				recorder.stop();
			}
		}, 3000);
	}

	private async sendAudioChunkForTranscription(blob: Blob): Promise<void> {
		try {
			const formData = new FormData();
			formData.append("audio", blob, "chunk.webm");
			formData.append("user_id", "web-user");
			formData.append("language", "en");

			const response = await fetch(`${BACKEND_URL}/transcribe-dia`, {
				method: "POST",
				body: formData,
				headers: API_KEY ? { "X-API-Key": API_KEY } : undefined,
			});

			if (!response.ok) return;

			const result: { segments?: Array<{ text: string }> } =
				await response.json();
			if (result.segments && result.segments.length > 0) {
				const text = result.segments.map((s) => s.text).join(" ");
				if (text.trim()) {
					emit(this.speechResultCallbacks, {
						text: text.trim(),
						confidence: 0.8,
						isFinal: true,
						timestamp: Date.now(),
					});
				}
			}
		} catch {
			// Network errors are non-fatal — skip this chunk silently
		}
	}

	private stopNetworkSpeechRecognition(): void {
		this.networkSpeechActive = false;
		this.useNetworkFallback = false;

		if (this.networkSpeechTimeout) {
			clearTimeout(this.networkSpeechTimeout);
			this.networkSpeechTimeout = null;
		}

		if (
			this.networkSpeechRecorder &&
			this.networkSpeechRecorder.state === "recording"
		) {
			this.networkSpeechRecorder.stop();
		}
		this.networkSpeechRecorder = null;

		if (this.networkSpeechStream) {
			for (const track of this.networkSpeechStream.getTracks()) {
				track.stop();
			}
			this.networkSpeechStream = null;
		}

		emit(this.speechStateCallbacks, {
			isListening: false,
			timestamp: Date.now(),
		});
	}

	// ============================================================
	// Camera Capture — getUserMedia + Canvas
	// ============================================================

	async initializeCamera(_lowPowerMode?: boolean): Promise<boolean> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "environment" },
			});
			this.cameraStream = stream;

			const video = document.createElement("video");
			video.srcObject = stream;
			video.setAttribute("playsinline", "true");
			video.style.display = "none";
			document.body.appendChild(video);
			await video.play();
			this.videoElement = video;

			const canvas = document.createElement("canvas");
			canvas.style.display = "none";
			document.body.appendChild(canvas);
			this.canvasElement = canvas;

			emit(this.cameraStateCallbacks, {
				isReady: true,
				isEmulated: false,
				timestamp: Date.now(),
			});
			return true;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Camera access denied";
			emit(this.cameraErrorCallbacks, { message, timestamp: Date.now() });
			return false;
		}
	}

	async captureImage(): Promise<boolean> {
		if (!this.videoElement || !this.canvasElement) {
			emit(this.cameraErrorCallbacks, {
				message: "Camera not initialized",
				timestamp: Date.now(),
			});
			return false;
		}

		const video = this.videoElement;
		const canvas = this.canvasElement;
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;

		const ctx = canvas.getContext("2d");
		if (!ctx) {
			emit(this.cameraErrorCallbacks, {
				message: "Failed to get canvas context",
				timestamp: Date.now(),
			});
			return false;
		}

		ctx.drawImage(video, 0, 0);
		const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
		const base64 = dataUrl.split(",")[1];

		emit(this.imageCapturedCallbacks, {
			imageBase64: base64,
			width: canvas.width,
			height: canvas.height,
			isEmulated: false,
			timestamp: Date.now(),
		});
		return true;
	}

	async releaseCamera(): Promise<boolean> {
		if (this.cameraStream) {
			for (const track of this.cameraStream.getTracks()) {
				track.stop();
			}
			this.cameraStream = null;
		}
		if (this.videoElement) {
			this.videoElement.remove();
			this.videoElement = null;
		}
		if (this.canvasElement) {
			this.canvasElement.remove();
			this.canvasElement = null;
		}
		emit(this.cameraStateCallbacks, {
			isReady: false,
			isEmulated: false,
			timestamp: Date.now(),
		});
		return true;
	}

	async isCameraReady(): Promise<boolean> {
		return this.cameraStream !== null && this.videoElement !== null;
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

	// ============================================================
	// Video Recording — MediaRecorder API
	// ============================================================

	async startVideoRecording(_cameraSource: string): Promise<boolean> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "environment" },
				audio: true,
			});

			this.recordingChunks = [];
			const recorder = new MediaRecorder(stream, {
				mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
					? "video/webm;codecs=vp9"
					: "video/webm",
			});

			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.recordingChunks.push(event.data);
				}
			};

			recorder.onstop = () => {
				const blob = new Blob(this.recordingChunks, { type: "video/webm" });
				this.lastRecordingBlob = blob;

				if (this.lastRecordingUrl) {
					URL.revokeObjectURL(this.lastRecordingUrl);
				}
				this.lastRecordingUrl = URL.createObjectURL(blob);

				// Stop all tracks from the recording stream
				for (const track of stream.getTracks()) {
					track.stop();
				}

				emit(this.recordingStateCallbacks, {
					state: "stopped",
					fileUri: this.lastRecordingUrl,
					timestamp: Date.now(),
				});
			};

			recorder.onerror = () => {
				emit(this.recordingErrorCallbacks, {
					message: "Recording failed",
					timestamp: Date.now(),
				});
			};

			this.mediaRecorder = recorder;
			recorder.start(1000); // Collect data every second

			emit(this.recordingStateCallbacks, {
				state: "recording",
				timestamp: Date.now(),
			});
			return true;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to start recording";
			emit(this.recordingErrorCallbacks, { message, timestamp: Date.now() });
			return false;
		}
	}

	async stopVideoRecording(): Promise<boolean> {
		if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
			return false;
		}
		emit(this.recordingStateCallbacks, {
			state: "stopping",
			timestamp: Date.now(),
		});
		this.mediaRecorder.stop();
		return true;
	}

	async dismissVideoRecording(): Promise<boolean> {
		if (this.lastRecordingUrl) {
			URL.revokeObjectURL(this.lastRecordingUrl);
			this.lastRecordingUrl = null;
		}
		this.lastRecordingBlob = null;
		this.recordingChunks = [];
		this.mediaRecorder = null;
		emit(this.recordingStateCallbacks, {
			state: "idle",
			timestamp: Date.now(),
		});
		return true;
	}

	async getRecordingFilePath(): Promise<string | null> {
		return this.lastRecordingUrl;
	}

	async sendRecordingForTranscription(
		language: string,
	): Promise<TranscriptionResponse> {
		if (!this.lastRecordingBlob) {
			throw new Error("No recording available");
		}

		const formData = new FormData();
		formData.append("audio", this.lastRecordingBlob, "recording.webm");
		formData.append("user_id", "web-user");
		formData.append("language", language);

		const response = await fetch(`${BACKEND_URL}/transcribe-dia`, {
			method: "POST",
			body: formData,
			headers: API_KEY ? { "X-API-Key": API_KEY } : undefined,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Transcription failed (${response.status}): ${errorText}`,
			);
		}

		const result: TranscriptionResponse = await response.json();
		return result;
	}

	onRecordingStateChanged(
		callback: (event: RecordingStateChangedEvent) => void,
	): Subscription {
		this.recordingStateCallbacks.add(callback);
		return {
			remove: () => {
				this.recordingStateCallbacks.delete(callback);
			},
		};
	}

	onRecordingError(
		callback: (event: RecordingErrorEvent) => void,
	): Subscription {
		this.recordingErrorCallbacks.add(callback);
		return {
			remove: () => {
				this.recordingErrorCallbacks.delete(callback);
			},
		};
	}

	// ============================================================
	// Remote View — Agora Web SDK
	// ============================================================

	private getAgoraQualityConfig(quality: StreamQuality): {
		width: number;
		height: number;
		frameRate: number;
	} {
		switch (quality) {
			case "low_latency":
				return { width: 640, height: 480, frameRate: 15 };
			case "high_quality":
				return { width: 1280, height: 720, frameRate: 30 };
			default:
				return { width: 1280, height: 720, frameRate: 15 };
		}
	}

	async startRemoteView(quality: StreamQuality): Promise<boolean> {
		try {
			const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

			const appId = process.env.EXPO_PUBLIC_AGORA_APP_ID;
			const tokenServerUrl = process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL;
			const viewerUrlBase = process.env.EXPO_PUBLIC_SPEX_VIEWER_URL_BASE;

			if (!appId || !tokenServerUrl || !viewerUrlBase) {
				throw new Error("Agora environment variables not configured");
			}

			this.remoteViewQuality = quality;
			const channelId = `web-${Date.now().toString(36)}`;
			this.remoteViewChannelId = channelId;

			// Create client in live mode as host
			const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
			await client.setClientRole("host");
			this.agoraClient = client;

			// Fetch token
			const tokenUrl = `${tokenServerUrl}token?channel=${channelId}&role=publisher`;
			const tokenResponse = await fetch(tokenUrl);
			if (!tokenResponse.ok) {
				throw new Error(`Token fetch failed: ${tokenResponse.status}`);
			}
			const tokenData: { token: string } = await tokenResponse.json();

			// Create media tracks
			const qConfig = this.getAgoraQualityConfig(quality);
			const [audioTrack, videoTrack] = await Promise.all([
				AgoraRTC.createMicrophoneAudioTrack(),
				AgoraRTC.createCameraVideoTrack({
					encoderConfig: {
						width: qConfig.width,
						height: qConfig.height,
						frameRate: qConfig.frameRate,
					},
				}),
			]);

			this.agoraLocalAudioTrack = audioTrack;
			this.agoraLocalVideoTrack = videoTrack;

			// Listen for viewer join/leave
			client.on("user-joined", () => {
				const count = client.remoteUsers.length;
				emit(this.viewerUpdateCallbacks, {
					viewerCount: count,
					viewerUid: null,
					viewerName: null,
					viewerSpeaking: false,
					timestamp: Date.now(),
				});
			});

			client.on("user-left", () => {
				const count = client.remoteUsers.length;
				emit(this.viewerUpdateCallbacks, {
					viewerCount: count,
					viewerUid: null,
					viewerName: null,
					viewerSpeaking: false,
					timestamp: Date.now(),
				});
			});

			// Join channel and publish
			await client.join(appId, channelId, tokenData.token);
			await client.publish([audioTrack, videoTrack]);

			this.remoteViewActive = true;

			const viewerUrl = `${viewerUrlBase}${channelId}`;
			emit(this.streamStartedCallbacks, {
				channelId,
				viewerUrl,
				quality,
				timestamp: Date.now(),
			});

			emit(this.streamCameraSourceCallbacks, {
				cameraSource: "web_camera",
				isEmulationMode: false,
				isDemoMode: false,
				timestamp: Date.now(),
			});

			return true;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to start stream";
			emit(this.streamErrorCallbacks, { message, timestamp: Date.now() });
			await this.cleanupAgoraResources();
			return false;
		}
	}

	async stopRemoteView(): Promise<boolean> {
		await this.cleanupAgoraResources();
		this.remoteViewActive = false;
		this.remoteViewChannelId = null;
		emit(this.streamStoppedCallbacks, { timestamp: Date.now() });
		return true;
	}

	async setRemoteViewQuality(quality: StreamQuality): Promise<boolean> {
		this.remoteViewQuality = quality;
		if (this.agoraLocalVideoTrack) {
			try {
				const qConfig = this.getAgoraQualityConfig(quality);
				// The Agora SDK videoTrack has setEncoderConfiguration
				const videoTrack = this.agoraLocalVideoTrack as {
					setEncoderConfiguration: (config: {
						width: number;
						height: number;
						frameRate: number;
					}) => Promise<void>;
				};
				await videoTrack.setEncoderConfiguration(qConfig);
				return true;
			} catch {
				return false;
			}
		}
		return false;
	}

	async isRemoteViewActive(): Promise<boolean> {
		return this.remoteViewActive;
	}

	private async cleanupAgoraResources(): Promise<void> {
		if (this.agoraLocalAudioTrack) {
			const track = this.agoraLocalAudioTrack as { close: () => void };
			track.close();
			this.agoraLocalAudioTrack = null;
		}
		if (this.agoraLocalVideoTrack) {
			const track = this.agoraLocalVideoTrack as { close: () => void };
			track.close();
			this.agoraLocalVideoTrack = null;
		}
		if (this.agoraClient) {
			const client = this.agoraClient as { leave: () => Promise<void> };
			try {
				await client.leave();
			} catch {
				// Ignore leave errors during cleanup
			}
			this.agoraClient = null;
		}
	}

	onStreamStarted(callback: (event: StreamStartedEvent) => void): Subscription {
		this.streamStartedCallbacks.add(callback);
		return {
			remove: () => {
				this.streamStartedCallbacks.delete(callback);
			},
		};
	}

	onStreamStopped(callback: (event: StreamStoppedEvent) => void): Subscription {
		this.streamStoppedCallbacks.add(callback);
		return {
			remove: () => {
				this.streamStoppedCallbacks.delete(callback);
			},
		};
	}

	onStreamError(callback: (event: StreamErrorEvent) => void): Subscription {
		this.streamErrorCallbacks.add(callback);
		return {
			remove: () => {
				this.streamErrorCallbacks.delete(callback);
			},
		};
	}

	onViewerUpdate(callback: (event: ViewerUpdateEvent) => void): Subscription {
		this.viewerUpdateCallbacks.add(callback);
		return {
			remove: () => {
				this.viewerUpdateCallbacks.delete(callback);
			},
		};
	}

	onStreamCameraSourceChanged(
		callback: (event: StreamCameraSourceChangedEvent) => void,
	): Subscription {
		this.streamCameraSourceCallbacks.add(callback);
		return {
			remove: () => {
				this.streamCameraSourceCallbacks.delete(callback);
			},
		};
	}

	// ============================================================
	// Parking Timer — Pure JavaScript setTimeout
	// ============================================================

	async startParkingTimer(durationMinutes: number): Promise<boolean> {
		this.clearParkingTimerTimeouts();

		const durationMs = durationMinutes * 60 * 1000;
		const now = Date.now();
		this.parkingTimerEndTime = now + durationMs;
		this.parkingTimerDuration = durationMinutes;
		this.parkingTimerActive = true;
		this.parkingTimerWarningShown = false;
		this.parkingTimerExpired = false;

		const warningMs = 5 * 60 * 1000;
		const warningTime = this.parkingTimerEndTime - warningMs;

		// Set warning timeout (5 min before end) — only if timer > 5 min
		if (durationMs > warningMs) {
			const msUntilWarning = warningTime - now;
			this.parkingTimerWarningTimeout = setTimeout(() => {
				this.parkingTimerWarningShown = true;
				emit(this.parkingTimerWarningCallbacks, {
					remainingMinutes: 5,
					remainingMs: warningMs,
					timestamp: Date.now(),
				});
			}, msUntilWarning);
		}

		// Set expiry timeout
		this.parkingTimerExpiryTimeout = setTimeout(() => {
			this.parkingTimerActive = false;
			this.parkingTimerExpired = true;
			emit(this.parkingTimerExpiredCallbacks, { timestamp: Date.now() });
		}, durationMs);

		emit(this.parkingTimerStartedCallbacks, {
			durationMinutes,
			endTime: this.parkingTimerEndTime,
			warningTime,
			timestamp: now,
		});

		return true;
	}

	async cancelParkingTimer(): Promise<boolean> {
		this.clearParkingTimerTimeouts();
		this.parkingTimerActive = false;
		this.parkingTimerExpired = false;
		emit(this.parkingTimerCancelledCallbacks, { timestamp: Date.now() });
		return true;
	}

	async getParkingTimerState(): Promise<ParkingTimerState> {
		const now = Date.now();
		return {
			isActive: this.parkingTimerActive,
			remainingMs: this.parkingTimerActive
				? Math.max(0, this.parkingTimerEndTime - now)
				: 0,
			endTime: this.parkingTimerEndTime,
			durationMinutes: this.parkingTimerDuration,
			warningShown: this.parkingTimerWarningShown,
			expired: this.parkingTimerExpired,
		};
	}

	async stopParkingAlarm(): Promise<boolean> {
		this.parkingTimerExpired = false;
		return true;
	}

	private clearParkingTimerTimeouts(): void {
		if (this.parkingTimerWarningTimeout) {
			clearTimeout(this.parkingTimerWarningTimeout);
			this.parkingTimerWarningTimeout = null;
		}
		if (this.parkingTimerExpiryTimeout) {
			clearTimeout(this.parkingTimerExpiryTimeout);
			this.parkingTimerExpiryTimeout = null;
		}
	}

	onParkingTimerStarted(
		callback: (event: ParkingTimerStartedEvent) => void,
	): Subscription {
		this.parkingTimerStartedCallbacks.add(callback);
		return {
			remove: () => {
				this.parkingTimerStartedCallbacks.delete(callback);
			},
		};
	}

	onParkingTimerWarning(
		callback: (event: ParkingTimerWarningEvent) => void,
	): Subscription {
		this.parkingTimerWarningCallbacks.add(callback);
		return {
			remove: () => {
				this.parkingTimerWarningCallbacks.delete(callback);
			},
		};
	}

	onParkingTimerExpired(
		callback: (event: ParkingTimerExpiredEvent) => void,
	): Subscription {
		this.parkingTimerExpiredCallbacks.add(callback);
		return {
			remove: () => {
				this.parkingTimerExpiredCallbacks.delete(callback);
			},
		};
	}

	onParkingTimerCancelled(
		callback: (event: ParkingTimerCancelledEvent) => void,
	): Subscription {
		this.parkingTimerCancelledCallbacks.add(callback);
		return {
			remove: () => {
				this.parkingTimerCancelledCallbacks.delete(callback);
			},
		};
	}

	onProjectedPermissionsCompleted(
		_callback: (event: { granted: boolean; timestamp: number }) => void,
	): Subscription {
		return { remove: () => {} };
	}
}

/**
 * Factory function — always returns WebXRGlassesService on web.
 */
export function createXRGlassesService(): WebXRGlassesService {
	return new WebXRGlassesService();
}

let _instance: WebXRGlassesService | null = null;

export function getXRGlassesService(): WebXRGlassesService {
	if (!_instance) {
		_instance = createXRGlassesService();
	}
	return _instance;
}
