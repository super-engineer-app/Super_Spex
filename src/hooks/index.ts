/**
 * XR Glasses React Hooks
 *
 * This module exports all hooks for interacting with XR glasses functionality.
 */

export { useXRGlasses } from './useXRGlasses';
export type { GlassesState, UseXRGlassesReturn } from './useXRGlasses';

export { useGlassesInput, useGlassesAction } from './useGlassesInput';
export type { InputEventWithId, UseGlassesInputReturn } from './useGlassesInput';

export { useSpeechRecognition, useSpeechProcessor } from './useSpeechRecognition';
export type { SpeechRecognitionState, UseSpeechRecognitionReturn } from './useSpeechRecognition';

export { useGlassesCamera } from './useGlassesCamera';
export type { CameraState, UseGlassesCameraReturn } from './useGlassesCamera';

export { useParkingTimer, TIMER_PRESETS } from './useParkingTimer';
export type { ParkingTimerHookState, UseParkingTimerReturn } from './useParkingTimer';

export { useVideoRecording } from './useVideoRecording';
export type { UseVideoRecordingReturn } from './useVideoRecording';

export { useRemoteView, QUALITY_OPTIONS } from './useRemoteView';
export type { RemoteViewState, UseRemoteViewReturn } from './useRemoteView';

export { useTaggingSession } from './useTaggingSession';
export type { UseTaggingSessionReturn } from './useTaggingSession';
