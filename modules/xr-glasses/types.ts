/**
 * Shared type definitions for XR Glasses module.
 *
 * Pure types with no runtime dependencies — safe to import from any platform.
 * Both index.ts (native) and index.web.ts (web) re-export from here.
 */

// Event types for native module events
export type ConnectionStateEvent = { connected: boolean };
export type InputEvent = { action: string; timestamp: number };
export type EngagementModeEvent = { visualsOn: boolean; audioOn: boolean };
export type DeviceStateEvent = { state: "INACTIVE" | "ACTIVE" | "DESTROYED" };

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
	isEmulationMode: boolean; // Note: Internally called "demo mode" in UI to avoid confusion with Android Emulator
	isDemoMode: boolean; // Alias for isEmulationMode
	timestamp: number;
};

// Quality preset type
export type StreamQuality = "low_latency" | "balanced" | "high_quality";

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
export type RecordingState = "idle" | "recording" | "stopping" | "stopped";

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
