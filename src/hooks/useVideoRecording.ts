/**
 * useVideoRecording Hook
 *
 * Manages the full video recording + transcription lifecycle:
 * 1. Camera source selection (phone or glasses)
 * 2. Start/stop recording via native CameraX VideoCapture
 * 3. Send recording to backend for speaker-diarized transcription
 * 4. Save video and transcript via share dialog
 * 5. Dismiss/cleanup
 *
 * Mutual exclusion: Recording pauses streaming and tagging automatically.
 * State restoration happens when recording is dismissed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { getXRGlassesService } from '../../modules/xr-glasses';
import type {
  RecordingState,
  RecordingStateChangedEvent,
  RecordingErrorEvent,
  TranscriptionResponse,
} from '../../modules/xr-glasses';
import {
  formatTranscriptAsText,
  isValidTranscriptionResult,
} from '../services/transcriptionApi';
import type { TranscriptionResult, TranscriptionSegment } from '../services/transcriptionApi';
import logger from '../utils/logger';

const TAG = 'useVideoRecording';

type CameraSource = 'phone' | 'glasses';

type TranscriptionState = 'idle' | 'loading' | 'done' | 'error';

interface VideoRecordingState {
  recordingState: RecordingState;
  durationMs: number;
  cameraSource: CameraSource;
  transcriptionState: TranscriptionState;
  transcriptionResult: TranscriptionResult | null;
  transcriptionError: string | null;
  fileUri: string | null;
}

const INITIAL_STATE: VideoRecordingState = {
  recordingState: 'idle',
  durationMs: 0,
  cameraSource: 'phone',
  transcriptionState: 'idle',
  transcriptionResult: null,
  transcriptionError: null,
  fileUri: null,
};

export interface UseVideoRecordingReturn {
  state: VideoRecordingState;
  setCameraSource: (source: CameraSource) => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  transcribe: (language?: string) => Promise<void>;
  saveVideo: () => Promise<void>;
  downloadTranscript: () => Promise<void>;
  dismiss: () => void;
  isRecording: boolean;
  canRecord: boolean;
}

export function useVideoRecording(): UseVideoRecordingReturn {
  const [state, setState] = useState<VideoRecordingState>(INITIAL_STATE);
  const serviceRef = useRef(getXRGlassesService());
  const mountedRef = useRef(true);
  const recordingStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start a JS-side timer that ticks every second while recording
  const startDurationTimer = useCallback(() => {
    stopDurationTimer();
    recordingStartTimeRef.current = Date.now();
    durationIntervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const elapsed = Date.now() - recordingStartTimeRef.current;
      setState((prev) => {
        if (prev.recordingState !== 'recording') return prev;
        return { ...prev, durationMs: elapsed };
      });
    }, 500);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current !== null) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // Subscribe to native recording events
  useEffect(() => {
    mountedRef.current = true;
    const service = serviceRef.current;

    const stateSub = service.onRecordingStateChanged((event: RecordingStateChangedEvent) => {
      if (!mountedRef.current) return;

      // Stop the duration timer when recording ends
      if (event.state !== 'recording') {
        stopDurationTimer();
      }

      setState((prev) => ({
        ...prev,
        recordingState: event.state,
        durationMs: event.durationMs ?? prev.durationMs,
        fileUri: event.fileUri ?? prev.fileUri,
      }));
    });

    const errorSub = service.onRecordingError((event: RecordingErrorEvent) => {
      if (!mountedRef.current) return;
      logger.error(TAG, 'Recording error:', event.message);
      stopDurationTimer();
      setState((prev) => ({
        ...prev,
        recordingState: 'idle',
      }));
    });

    return () => {
      mountedRef.current = false;
      stopDurationTimer();
      stateSub.remove();
      errorSub.remove();
    };
  }, [stopDurationTimer]);

  const setCameraSource = useCallback((source: CameraSource) => {
    setState((prev) => ({ ...prev, cameraSource: source }));
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setState((prev) => ({
        ...prev,
        recordingState: 'recording',
        durationMs: 0,
        fileUri: null,
        transcriptionState: 'idle',
        transcriptionResult: null,
        transcriptionError: null,
      }));
      startDurationTimer();
      await serviceRef.current.startVideoRecording(state.cameraSource);
    } catch (error) {
      logger.error(TAG, 'Failed to start recording:', error);
      stopDurationTimer();
      setState((prev) => ({ ...prev, recordingState: 'idle' }));
    }
  }, [state.cameraSource, startDurationTimer, stopDurationTimer]);

  const stopRecording = useCallback(async () => {
    try {
      await serviceRef.current.stopVideoRecording();
    } catch (error) {
      logger.error(TAG, 'Failed to stop recording:', error);
    }
  }, []);

  const transcribe = useCallback(async (language: string = 'en') => {
    setState((prev) => ({
      ...prev,
      transcriptionState: 'loading',
      transcriptionError: null,
    }));

    try {
      const result: TranscriptionResponse = await serviceRef.current.sendRecordingForTranscription(language);

      if (!mountedRef.current) return;

      if (isValidTranscriptionResult(result)) {
        setState((prev) => ({
          ...prev,
          transcriptionState: 'done',
          transcriptionResult: result,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          transcriptionState: 'error',
          transcriptionError: 'Invalid transcription response format',
        }));
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : 'Transcription failed';
      logger.error(TAG, 'Transcription error:', message);
      setState((prev) => ({
        ...prev,
        transcriptionState: 'error',
        transcriptionError: message,
      }));
    }
  }, []);

  const saveVideo = useCallback(async () => {
    const filePath = await serviceRef.current.getRecordingFilePath();
    if (!filePath) {
      logger.warn(TAG, 'No recording file to save');
      return;
    }

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(`file://${filePath}`, {
          mimeType: 'video/mp4',
          dialogTitle: 'Save Recording',
        });
      } else {
        logger.warn(TAG, 'Sharing not available on this device');
      }
    } catch (error) {
      logger.error(TAG, 'Failed to save video:', error);
    }
  }, []);

  const downloadTranscript = useCallback(async () => {
    const result = state.transcriptionResult;
    if (!result || result.segments.length === 0) {
      Alert.alert('No Transcript', 'No transcription data to save.');
      return;
    }

    try {
      const text = formatTranscriptAsText(result.segments);
      const fileName = `spex-transcript-${Date.now()}.txt`;
      const file = new File(Paths.cache, fileName);
      file.text = text;

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Share Transcript',
        });
      } else {
        // Fallback: copy to clipboard if sharing is unavailable (e.g. some emulators)
        await Clipboard.setStringAsync(text);
        Alert.alert('Copied', 'Sharing unavailable — transcript copied to clipboard.');
      }
    } catch (error) {
      logger.error(TAG, 'Failed to share transcript:', error);
      Alert.alert('Error', 'Failed to share transcript.');
    }
  }, [state.transcriptionResult]);

  const dismiss = useCallback(async () => {
    try {
      await serviceRef.current.dismissVideoRecording();
    } catch (error) {
      logger.error(TAG, 'Failed to dismiss recording:', error);
    }
    setState(INITIAL_STATE);
  }, []);

  const isRecording = state.recordingState === 'recording';
  const canRecord = state.recordingState === 'idle';

  return {
    state,
    setCameraSource,
    startRecording,
    stopRecording,
    transcribe,
    saveVideo,
    downloadTranscript,
    dismiss,
    isRecording,
    canRecord,
  };
}
