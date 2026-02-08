/**
 * XR Glasses React Hooks
 *
 * This module exports all hooks for interacting with XR glasses functionality.
 */

export type { CameraState, UseGlassesCameraReturn } from "./useGlassesCamera";
export { useGlassesCamera } from "./useGlassesCamera";
export type {
	InputEventWithId,
	UseGlassesInputReturn,
} from "./useGlassesInput";
export { useGlassesAction, useGlassesInput } from "./useGlassesInput";
export type {
	ParkingTimerHookState,
	UseParkingTimerReturn,
} from "./useParkingTimer";
export { TIMER_PRESETS, useParkingTimer } from "./useParkingTimer";
export type { RemoteViewState, UseRemoteViewReturn } from "./useRemoteView";
export { QUALITY_OPTIONS, useRemoteView } from "./useRemoteView";
export type {
	SpeechRecognitionState,
	UseSpeechRecognitionReturn,
} from "./useSpeechRecognition";
export {
	useSpeechProcessor,
	useSpeechRecognition,
} from "./useSpeechRecognition";
export type { UseTaggingSessionReturn } from "./useTaggingSession";
export { useTaggingSession } from "./useTaggingSession";
export type { UseVideoRecordingReturn } from "./useVideoRecording";
export { useVideoRecording } from "./useVideoRecording";
export type { GlassesState, UseXRGlassesReturn } from "./useXRGlasses";
export { useXRGlasses } from "./useXRGlasses";
