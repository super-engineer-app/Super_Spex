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
