/**
 * useTaggingSession Hook
 *
 * Voice-activated tagging session that:
 * 1. Detects "note" or "tag" keywords in speech to start tagging
 * 2. Accumulates transcript while tagging is active
 * 3. Allows capturing images from glasses camera, phone camera, or gallery
 * 4. Detects "done" or "save" keywords to end and save the session
 * 5. Sends transcript + images to the backend
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useGlassesCamera } from './useGlassesCamera';
import {
  submitTaggingSession,
  createTaggedImage,
  requestLocationPermission,
} from '../services/taggingApi';
import type { TaggedImage, TaggingStatusEvent } from '../types/tagging';
import {
  detectTaggingStartKeyword,
  detectTaggingEndKeyword,
  removeStartKeyword,
  removeEndKeyword,
} from '../types/tagging';

/**
 * Return type for useTaggingSession hook.
 */
export interface UseTaggingSessionReturn {
  /** Whether tagging mode is active */
  isTaggingActive: boolean;
  /** Accumulated transcript during tagging */
  taggingTranscript: string;
  /** Images captured during tagging */
  taggingImages: TaggedImage[];
  /** Whether the session is being saved */
  isSaving: boolean;
  /** Error message if any */
  error: string | null;
  /** Status message from backend */
  statusMessage: string | null;
  /** Start tagging mode manually */
  startTagging: () => void;
  /** Cancel tagging without saving */
  cancelTagging: () => void;
  /** Save the current tagging session */
  saveTaggingSession: () => Promise<void>;
  /** Add transcript text to the session */
  addTranscript: (text: string) => void;
  /** Capture image from glasses camera */
  captureFromGlasses: () => Promise<void>;
  /** Take photo with phone camera */
  captureFromPhone: () => Promise<void>;
  /** Pick image from gallery */
  pickFromGallery: () => Promise<void>;
  /** Remove an image from the session */
  removeImage: (index: number) => void;
  /** Process speech result - detects keywords and handles transcript */
  processSpeechResult: (text: string) => void;
  /** Whether glasses camera is ready */
  isGlassesCameraReady: boolean;
  /** Whether glasses camera is capturing */
  isGlassesCapturing: boolean;
}

/**
 * Hook for managing voice-activated tagging sessions.
 *
 * @example
 * ```tsx
 * function TaggingComponent() {
 *   const {
 *     isTaggingActive,
 *     taggingTranscript,
 *     taggingImages,
 *     processSpeechResult,
 *     saveTaggingSession,
 *   } = useTaggingSession();
 *
 *   // In your speech recognition handler:
 *   useSpeechRecognition().onResult((text) => {
 *     processSpeechResult(text);
 *   });
 *
 *   return (
 *     <View>
 *       {isTaggingActive && (
 *         <View>
 *           <Text>Tagging Mode Active</Text>
 *           <Text>{taggingTranscript}</Text>
 *           <Text>{taggingImages.length} images</Text>
 *         </View>
 *       )}
 *     </View>
 *   );
 * }
 * ```
 */
export function useTaggingSession(): UseTaggingSessionReturn {
  // State
  const [isTaggingActive, setIsTaggingActive] = useState(false);
  const [taggingTranscript, setTaggingTranscript] = useState('');
  const [taggingImages, setTaggingImages] = useState<TaggedImage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Refs for tracking state in callbacks
  const isTaggingActiveRef = useRef(false);
  const transcriptRef = useRef('');
  // Flag to trigger save after transcript is updated (avoids setTimeout race condition)
  const pendingSaveRef = useRef(false);

  // Glasses camera hook
  const {
    isReady: isGlassesCameraReady,
    isCapturing: isGlassesCapturing,
    lastImage: glassesLastImage,
    initializeCamera: initGlassesCamera,
    captureImage: captureGlassesImage,
    releaseCamera: releaseGlassesCamera,
  } = useGlassesCamera();

  // Sync refs with state
  useEffect(() => {
    isTaggingActiveRef.current = isTaggingActive;
  }, [isTaggingActive]);

  useEffect(() => {
    transcriptRef.current = taggingTranscript;
  }, [taggingTranscript]);

  // Effect to handle pending save (triggered by end keyword detection)
  // This runs after state has been updated, avoiding the setTimeout race condition
  useEffect(() => {
    if (pendingSaveRef.current && isTaggingActive && taggingTranscript) {
      pendingSaveRef.current = false;
      // Use void to explicitly ignore the promise (fire-and-forget)
      void saveTaggingSessionInternal();
    }
  }, [taggingTranscript, isTaggingActive]);

  // Request location permission on mount
  useEffect(() => {
    requestLocationPermission().then(({ granted }) => {
      if (!granted) {
        console.warn('[useTaggingSession] Location permission not granted - images will have 0,0 coordinates');
      }
    });
  }, []);

  // Handle glasses camera capture result
  useEffect(() => {
    if (glassesLastImage && isTaggingActiveRef.current) {
      // Add the captured image to the session
      createTaggedImage(glassesLastImage, 'glasses').then((taggedImage) => {
        setTaggingImages((prev) => [...prev, taggedImage]);
        console.log('[useTaggingSession] Added glasses image, total:', taggingImages.length + 1);
      });
    }
  }, [glassesLastImage]);

  /**
   * Start tagging mode.
   */
  const startTagging = useCallback(() => {
    console.log('[useTaggingSession] Starting tagging mode');
    setIsTaggingActive(true);
    setTaggingTranscript('');
    setTaggingImages([]);
    setError(null);
    setStatusMessage(null);
  }, []);

  /**
   * Cancel tagging without saving.
   */
  const cancelTagging = useCallback(() => {
    console.log('[useTaggingSession] Cancelling tagging mode');
    setIsTaggingActive(false);
    setTaggingTranscript('');
    setTaggingImages([]);
    setError(null);
    setStatusMessage(null);

    // Release glasses camera if initialized
    if (isGlassesCameraReady) {
      releaseGlassesCamera();
    }
  }, [isGlassesCameraReady, releaseGlassesCamera]);

  /**
   * Add transcript text to the session.
   */
  const addTranscript = useCallback((text: string) => {
    if (!isTaggingActiveRef.current) return;

    setTaggingTranscript((prev) => {
      const trimmedText = text.trim();
      if (!trimmedText) return prev;

      if (prev) {
        return `${prev} ${trimmedText}`;
      }
      return trimmedText;
    });
  }, []);

  /**
   * Internal save function - used by both manual save and auto-save on end keyword.
   * Extracted to avoid circular dependency issues with useCallback.
   */
  const saveTaggingSessionInternal = async () => {
    // Get current state from refs to avoid stale closure issues
    const currentTranscript = transcriptRef.current;
    const currentActive = isTaggingActiveRef.current;

    if (!currentActive) {
      setError('No active tagging session');
      return;
    }

    if (!currentTranscript.trim()) {
      setError('Transcript is empty');
      return;
    }

    // Note: We check taggingImages from state since we need the array reference
    // This is safe because setTaggingImages is stable and the effect watches taggingTranscript
    if (taggingImages.length === 0) {
      setError('At least one image is required');
      return;
    }

    console.log('[useTaggingSession] Saving tagging session...');
    setIsSaving(true);
    setError(null);
    setStatusMessage('Saving...');

    const result = await submitTaggingSession(currentTranscript, taggingImages, {
      onStatus: (status: TaggingStatusEvent) => {
        setStatusMessage(status.content);
      },
      onComplete: (message: string) => {
        console.log('[useTaggingSession] Save complete:', message);
        setStatusMessage(message);
      },
      onError: (err: Error) => {
        console.error('[useTaggingSession] Save error:', err.message);
        setError(err.message);
      },
    });

    setIsSaving(false);

    if (result.success) {
      // Clear the session after successful save
      setIsTaggingActive(false);
      setTaggingTranscript('');
      setTaggingImages([]);

      // Release glasses camera if initialized
      if (isGlassesCameraReady) {
        releaseGlassesCamera();
      }
    }
  };

  /**
   * Save the current tagging session to the backend.
   */
  const saveTaggingSession = useCallback(async () => {
    await saveTaggingSessionInternal();
  }, [taggingImages, isGlassesCameraReady, releaseGlassesCamera]);

  /**
   * Capture image from glasses camera.
   */
  const captureFromGlasses = useCallback(async () => {
    if (!isTaggingActive) {
      setError('Start tagging first');
      return;
    }

    try {
      if (!isGlassesCameraReady) {
        console.log('[useTaggingSession] Initializing glasses camera...');
        await initGlassesCamera(false);
      }

      console.log('[useTaggingSession] Capturing from glasses...');
      await captureGlassesImage();
      // The useEffect above will handle adding the image when glassesLastImage updates
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to capture from glasses';
      setError(message);
    }
  }, [isTaggingActive, isGlassesCameraReady, initGlassesCamera, captureGlassesImage]);

  /**
   * Take photo with phone camera.
   */
  const captureFromPhone = useCallback(async () => {
    if (!isTaggingActive) {
      setError('Start tagging first');
      return;
    }

    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        setError('Camera permission is required');
        return;
      }

      console.log('[useTaggingSession] Opening phone camera...');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        base64: true,
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]?.base64) {
        const taggedImage = await createTaggedImage(result.assets[0].base64, 'phone');
        setTaggingImages((prev) => [...prev, taggedImage]);
        console.log('[useTaggingSession] Added phone camera image');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to capture from phone';
      setError(message);
    }
  }, [isTaggingActive]);

  /**
   * Pick image from gallery.
   */
  const pickFromGallery = useCallback(async () => {
    if (!isTaggingActive) {
      setError('Start tagging first');
      return;
    }

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        setError('Gallery permission is required');
        return;
      }

      console.log('[useTaggingSession] Opening gallery...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        base64: true,
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });

      if (!result.canceled && result.assets.length > 0) {
        const newImages: TaggedImage[] = [];
        for (const asset of result.assets) {
          if (asset.base64) {
            const taggedImage = await createTaggedImage(asset.base64, 'gallery');
            newImages.push(taggedImage);
          }
        }
        setTaggingImages((prev) => [...prev, ...newImages]);
        console.log('[useTaggingSession] Added', newImages.length, 'gallery images');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pick from gallery';
      setError(message);
    }
  }, [isTaggingActive]);

  /**
   * Remove an image from the session.
   */
  const removeImage = useCallback((index: number) => {
    setTaggingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Process speech result - detects keywords and handles transcript.
   * Call this with each speech recognition result.
   */
  const processSpeechResult = useCallback((text: string) => {
    if (!text.trim()) return;

    if (!isTaggingActiveRef.current) {
      // Not in tagging mode - check for start keywords
      const startKeyword = detectTaggingStartKeyword(text);
      if (startKeyword) {
        console.log('[useTaggingSession] Detected start keyword:', startKeyword);
        startTagging();

        // Add the remaining text after the keyword
        const remainingText = removeStartKeyword(text, startKeyword);
        if (remainingText) {
          setTaggingTranscript(remainingText);
        }
      }
    } else {
      // In tagging mode - check for end keywords
      const endKeyword = detectTaggingEndKeyword(text);
      if (endKeyword) {
        console.log('[useTaggingSession] Detected end keyword:', endKeyword);

        // Add the text before the keyword
        const beforeKeyword = removeEndKeyword(text, endKeyword);
        if (beforeKeyword) {
          // Set flag to trigger save after transcript state updates
          pendingSaveRef.current = true;
          setTaggingTranscript((prev) => prev ? `${prev} ${beforeKeyword}` : beforeKeyword);
        } else {
          // No text to add, save immediately since transcript is already complete
          void saveTaggingSessionInternal();
        }
      } else {
        // Add text to transcript
        addTranscript(text);
      }
    }
  }, [startTagging, addTranscript]);

  return {
    isTaggingActive,
    taggingTranscript,
    taggingImages,
    isSaving,
    error,
    statusMessage,
    startTagging,
    cancelTagging,
    saveTaggingSession,
    addTranscript,
    captureFromGlasses,
    captureFromPhone,
    pickFromGallery,
    removeImage,
    processSpeechResult,
    isGlassesCameraReady,
    isGlassesCapturing,
  };
}
