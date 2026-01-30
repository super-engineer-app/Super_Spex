import { useEffect, useState, useCallback, useRef } from 'react';
import { getXRGlassesService } from '../../modules/xr-glasses';
import type { SpeechResultEvent, PartialResultEvent, SpeechErrorEvent } from '../../modules/xr-glasses';

/**
 * Speech recognition state.
 */
export interface SpeechRecognitionState {
  /** Whether speech recognition is currently active */
  isListening: boolean;
  /** The final transcribed text from the last recognition */
  transcript: string;
  /** Partial/interim transcription while speaking */
  partialTranscript: string;
  /** Confidence score of the last final result (0-1) */
  confidence: number;
  /** Error message if recognition failed */
  error: string | null;
  /** Whether speech recognition is available on this device */
  isAvailable: boolean;
}

/**
 * Return type for useSpeechRecognition hook.
 */
export interface UseSpeechRecognitionReturn extends SpeechRecognitionState {
  /** Start listening for speech. Pass continuous=true for ongoing recognition. */
  startListening: (continuous?: boolean) => Promise<void>;
  /** Stop listening for speech */
  stopListening: () => Promise<void>;
  /** Clear the current transcript and error state */
  clearTranscript: () => void;
  /** History of all final transcriptions in this session */
  transcriptHistory: SpeechResultEvent[];
  /** Clear the transcript history */
  clearHistory: () => void;
}

/**
 * React hook for speech recognition from glasses.
 *
 * Speech recognition runs ON THE GLASSES hardware for minimal latency.
 * Only text results are sent to the phone app.
 *
 * @example
 * ```tsx
 * function VoiceInput() {
 *   const {
 *     isListening,
 *     transcript,
 *     partialTranscript,
 *     startListening,
 *     stopListening,
 *     error,
 *   } = useSpeechRecognition();
 *
 *   return (
 *     <View>
 *       <Text>{partialTranscript || transcript}</Text>
 *       <Button
 *         title={isListening ? 'Stop' : 'Start'}
 *         onPress={isListening ? stopListening : () => startListening(true)}
 *       />
 *       {error && <Text style={{ color: 'red' }}>{error}</Text>}
 *     </View>
 *   );
 * }
 * ```
 */
export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [transcriptHistory, setTranscriptHistory] = useState<SpeechResultEvent[]>([]);

  // Track if component is mounted
  const mountedRef = useRef(true);

  // Accumulate final results during a session (concatenate instead of replace)
  const accumulatedTranscriptRef = useRef('');

  useEffect(() => {
    mountedRef.current = true;

    const service = getXRGlassesService();

    // Check availability
    service.isSpeechRecognitionAvailable().then(available => {
      if (mountedRef.current) {
        setIsAvailable(available);
      }
    }).catch(() => {
      if (mountedRef.current) {
        setIsAvailable(false);
      }
    });

    // Subscribe to speech events
    const resultSub = service.onSpeechResult((event: SpeechResultEvent) => {
      if (!mountedRef.current) return;

      // Accumulate results - append new text to existing transcript
      const newText = event.text.trim();
      if (newText) {
        if (accumulatedTranscriptRef.current) {
          accumulatedTranscriptRef.current += ' ' + newText;
        } else {
          accumulatedTranscriptRef.current = newText;
        }
        setTranscript(accumulatedTranscriptRef.current);
      }

      setConfidence(event.confidence);
      setPartialTranscript(''); // Clear partial when we get final
      setError(null);

      // Add to history
      setTranscriptHistory(prev => [...prev, event]);
    });

    const partialSub = service.onPartialResult((event: PartialResultEvent) => {
      if (!mountedRef.current) return;

      // Show accumulated transcript + current partial
      const partial = event.text.trim();
      if (accumulatedTranscriptRef.current && partial) {
        setPartialTranscript(accumulatedTranscriptRef.current + ' ' + partial);
      } else if (partial) {
        setPartialTranscript(partial);
      } else if (accumulatedTranscriptRef.current) {
        setPartialTranscript(accumulatedTranscriptRef.current);
      }
    });

    const errorSub = service.onSpeechError((event: SpeechErrorEvent) => {
      if (!mountedRef.current) return;

      // Only show error if we don't have any transcript yet
      if (!accumulatedTranscriptRef.current) {
        setError(event.message);
      }
      // Don't set isListening to false here - the native side handles restart
    });

    const stateSub = service.onSpeechStateChanged((event) => {
      if (!mountedRef.current) return;

      setIsListening(event.isListening);
    });

    return () => {
      mountedRef.current = false;
      resultSub.remove();
      partialSub.remove();
      errorSub.remove();
      stateSub.remove();
    };
  }, []);

  const startListening = useCallback(async (continuous: boolean = true) => {
    if (!isAvailable) {
      setError('Speech recognition not available on this device');
      return;
    }

    // Clear accumulated transcript when starting a new session
    accumulatedTranscriptRef.current = '';
    setTranscript('');
    setError(null);
    setPartialTranscript('');

    try {
      const service = getXRGlassesService();
      await service.startSpeechRecognition(continuous);
      setIsListening(true);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to start speech recognition';
      setError(errorMessage);
      setIsListening(false);
    }
  }, [isAvailable]);

  const stopListening = useCallback(async () => {
    try {
      const service = getXRGlassesService();
      await service.stopSpeechRecognition();
      setIsListening(false);
      setPartialTranscript('');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to stop speech recognition';
      setError(errorMessage);
    }
  }, []);

  const clearTranscript = useCallback(() => {
    accumulatedTranscriptRef.current = '';
    setTranscript('');
    setPartialTranscript('');
    setConfidence(0);
    setError(null);
  }, []);

  const clearHistory = useCallback(() => {
    setTranscriptHistory([]);
  }, []);

  return {
    isListening,
    transcript,
    partialTranscript,
    confidence,
    error,
    isAvailable,
    startListening,
    stopListening,
    clearTranscript,
    transcriptHistory,
    clearHistory,
  };
}

/**
 * Hook for processing speech results with a callback.
 *
 * Useful when you want to automatically process each transcription.
 *
 * @param onResult - Callback called with each final transcription
 *
 * @example
 * ```tsx
 * function VoiceCommand() {
 *   const { isListening, startListening, stopListening } = useSpeechProcessor(
 *     async (text) => {
 *       // Send to backend, execute command, etc.
 *       await processCommand(text);
 *     }
 *   );
 *
 *   return (
 *     <Button
 *       title={isListening ? 'Listening...' : 'Voice Command'}
 *       onPress={isListening ? stopListening : () => startListening()}
 *     />
 *   );
 * }
 * ```
 */
export function useSpeechProcessor(
  onResult: (text: string, confidence: number) => void | Promise<void>
): Omit<UseSpeechRecognitionReturn, 'transcriptHistory' | 'clearHistory'> {
  const speechRec = useSpeechRecognition();
  const lastProcessedRef = useRef<string>('');

  useEffect(() => {
    // Process new transcripts
    if (speechRec.transcript && speechRec.transcript !== lastProcessedRef.current) {
      lastProcessedRef.current = speechRec.transcript;
      onResult(speechRec.transcript, speechRec.confidence);
    }
  }, [speechRec.transcript, speechRec.confidence, onResult]);

  return {
    isListening: speechRec.isListening,
    transcript: speechRec.transcript,
    partialTranscript: speechRec.partialTranscript,
    confidence: speechRec.confidence,
    error: speechRec.error,
    isAvailable: speechRec.isAvailable,
    startListening: speechRec.startListening,
    stopListening: speechRec.stopListening,
    clearTranscript: speechRec.clearTranscript,
  };
}
