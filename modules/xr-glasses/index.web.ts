/**
 * Web-safe entry point for the XR Glasses module.
 *
 * On web, there is no native module — this file stubs XRGlassesNative
 * and re-exports everything else from the shared types and service layer.
 * Metro's .web.ts convention ensures this file is used instead of index.ts
 * when bundling for web.
 */

// Re-export all types (same as index.ts)
export type { EventSubscription } from "expo-modules-core";
export type {
	DeviceCapabilities,
	EngagementMode,
	IXRGlassesService,
	Subscription,
} from "./src/XRGlassesModule.web";
export {
	createXRGlassesService,
	getXRGlassesService,
} from "./src/XRGlassesModule.web";
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
	ViewerUpdateEvent,
} from "./types";

/** Stub — native module is not available on web */
export const XRGlassesNative = null;

/** Stub — recording events are handled via service on web */
export function addRecordingStateChangedListener(
	_callback: (event: {
		state: string;
		durationMs?: number;
		fileUri?: string;
		timestamp: number;
	}) => void,
) {
	return { remove: () => {} };
}

/** Stub — recording events are handled via service on web */
export function addRecordingErrorListener(
	_callback: (event: { message: string; timestamp: number }) => void,
) {
	return { remove: () => {} };
}
