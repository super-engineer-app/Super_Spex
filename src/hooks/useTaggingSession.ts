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

import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
	createTaggedImageSync,
	getCachedLocation,
	refreshLocationCache,
	requestLocationPermission,
	submitTaggingSession,
} from "../services/taggingApi";
import type { TaggedImage, TaggingStatusEvent } from "../types/tagging";
import {
	detectTaggingEndKeyword,
	detectTaggingStartKeyword,
	removeEndKeyword,
	removeStartKeyword,
} from "../types/tagging";
import logger from "../utils/logger";
import { useGlassesCamera } from "./useGlassesCamera";

const TAG = "useTaggingSession";

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
	/** Replace the entire transcript (for manual editing) */
	editTranscript: (text: string) => void;
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
	const [taggingTranscript, setTaggingTranscript] = useState("");
	const [taggingImages, setTaggingImages] = useState<TaggedImage[]>([]);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);

	// Refs for tracking state in callbacks
	const isTaggingActiveRef = useRef(false);
	const transcriptRef = useRef("");
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

	// Request location permission on mount
	useEffect(() => {
		requestLocationPermission().then(({ granted }) => {
			if (!granted) {
				logger.warn(
					TAG,
					"Location permission not granted - images will have 0,0 coordinates",
				);
			}
		});
	}, []);

	// Handle glasses camera capture result
	useEffect(() => {
		if (glassesLastImage && isTaggingActiveRef.current) {
			// Add the captured image instantly using global cached location (no GPS delay)
			const taggedImage = createTaggedImageSync(
				glassesLastImage,
				"glasses",
				getCachedLocation(),
			);
			setTaggingImages((prev) => {
				logger.debug(TAG, "Added glasses image, total:", prev.length + 1);
				return [...prev, taggedImage];
			});
		}
	}, [glassesLastImage]);

	/**
	 * Start tagging mode.
	 * Uses globally pre-cached GPS location for instant image capture.
	 */
	const startTagging = useCallback(() => {
		try {
			const cachedLocation = getCachedLocation();
			logger.debug(
				TAG,
				"Tagging session started",
				cachedLocation
					? `GPS: ${cachedLocation.lat}, ${cachedLocation.long}`
					: "GPS not ready",
			);

			setIsTaggingActive(true);
			setTaggingTranscript("");
			setTaggingImages([]);
			setError(null);
			setStatusMessage(null);

			// Refresh location cache in background (non-blocking)
			// This ensures fresh coordinates without blocking the UI
			refreshLocationCache().catch((err) => {
				logger.error(TAG, "Failed to refresh location cache:", err);
			});
		} catch (err) {
			logger.error(TAG, "Error in startTagging:", err);
		}
	}, []);

	/**
	 * Cancel tagging without saving.
	 */
	const cancelTagging = useCallback(() => {
		logger.debug(TAG, "Cancelling tagging mode");
		setIsTaggingActive(false);
		setTaggingTranscript("");
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
	 * Replace the entire transcript (for manual text editing).
	 */
	const editTranscript = useCallback((text: string) => {
		if (!isTaggingActiveRef.current) return;
		setTaggingTranscript(text);
	}, []);

	/**
	 * Internal save function - used by both manual save and auto-save on end keyword.
	 */
	const saveTaggingSessionInternal = useCallback(async () => {
		// Get current state from refs to avoid stale closure issues
		const currentTranscript = transcriptRef.current;
		const currentActive = isTaggingActiveRef.current;

		if (!currentActive) {
			setError("No active tagging session");
			return;
		}

		if (!currentTranscript.trim()) {
			setError("Transcript is empty");
			return;
		}

		if (taggingImages.length === 0) {
			setError("At least one image is required");
			return;
		}

		logger.debug(TAG, "Saving tagging session...");
		setIsSaving(true);
		setError(null);
		setStatusMessage("Saving...");

		const result = await submitTaggingSession(
			currentTranscript,
			taggingImages,
			{
				onStatus: (status: TaggingStatusEvent) => {
					setStatusMessage(status.content);
				},
				onComplete: (message: string) => {
					logger.debug(TAG, "Save complete:", message);
					setStatusMessage(message);
				},
				onError: (err: Error) => {
					logger.error(TAG, "Save error:", err.message);
					setError(err.message);
				},
			},
		);

		setIsSaving(false);

		if (result.success) {
			// Clear the session after successful save
			setIsTaggingActive(false);
			setTaggingTranscript("");
			setTaggingImages([]);

			// Release glasses camera if initialized
			if (isGlassesCameraReady) {
				releaseGlassesCamera();
			}
		}
	}, [taggingImages, isGlassesCameraReady, releaseGlassesCamera]);

	// Effect to handle pending save (triggered by end keyword detection)
	// This runs after state has been updated, avoiding the setTimeout race condition
	useEffect(() => {
		if (pendingSaveRef.current && isTaggingActive && taggingTranscript) {
			pendingSaveRef.current = false;
			void saveTaggingSessionInternal();
		}
	}, [taggingTranscript, isTaggingActive, saveTaggingSessionInternal]);

	/**
	 * Save the current tagging session to the backend.
	 */
	const saveTaggingSession = useCallback(async () => {
		await saveTaggingSessionInternal();
	}, [saveTaggingSessionInternal]);

	/**
	 * Capture image from glasses camera.
	 */
	const captureFromGlasses = useCallback(async () => {
		if (!isTaggingActive) {
			setError("Start tagging first");
			return;
		}

		try {
			if (!isGlassesCameraReady) {
				logger.debug(TAG, "Initializing glasses camera...");
				await initGlassesCamera(false);
			}

			logger.debug(TAG, "Capturing from glasses...");
			await captureGlassesImage();
			// The useEffect above will handle adding the image when glassesLastImage updates
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to capture from glasses";
			setError(message);
		}
	}, [
		isTaggingActive,
		isGlassesCameraReady,
		initGlassesCamera,
		captureGlassesImage,
	]);

	/**
	 * Take photo with phone camera.
	 * On web, ImagePicker.launchCameraAsync opens a file picker (same as gallery),
	 * so we delegate to the getUserMedia camera path instead.
	 */
	const captureFromPhone = useCallback(async () => {
		if (!isTaggingActive) {
			setError("Start tagging first");
			return;
		}

		// On web, use the same getUserMedia camera as the Glasses button
		if (Platform.OS === "web") {
			try {
				if (!isGlassesCameraReady) {
					logger.debug(TAG, "Initializing camera for web phone capture...");
					await initGlassesCamera(false);
				}
				logger.debug(TAG, "Capturing from web camera (phone button)...");
				await captureGlassesImage();
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to capture from camera";
				setError(message);
			}
			return;
		}

		try {
			const permissionResult =
				await ImagePicker.requestCameraPermissionsAsync();
			if (!permissionResult.granted) {
				setError("Camera permission is required");
				return;
			}

			logger.debug(TAG, "Opening phone camera...");
			const result = await ImagePicker.launchCameraAsync({
				mediaTypes: "images",
				base64: true,
				quality: 0.8,
				allowsEditing: false,
			});

			if (!result.canceled && result.assets[0]?.base64) {
				// Use global cached location (instant, no GPS delay)
				const taggedImage = createTaggedImageSync(
					result.assets[0].base64,
					"phone",
					getCachedLocation(),
				);
				setTaggingImages((prev) => [...prev, taggedImage]);
				logger.debug(TAG, `=== PHONE IMAGE CAPTURED ===`);
				logger.debug(
					TAG,
					`  Using cached location: lat=${taggedImage.lat}, long=${taggedImage.long}`,
				);
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to capture from phone";
			setError(message);
		}
	}, [
		isTaggingActive,
		isGlassesCameraReady,
		initGlassesCamera,
		captureGlassesImage,
	]);

	/**
	 * Pick image from gallery.
	 */
	const pickFromGallery = useCallback(async () => {
		if (!isTaggingActive) {
			setError("Start tagging first");
			return;
		}

		try {
			const permissionResult =
				await ImagePicker.requestMediaLibraryPermissionsAsync();
			if (!permissionResult.granted) {
				setError("Gallery permission is required");
				return;
			}

			logger.debug(TAG, "Opening gallery...");
			const result = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: "images",
				base64: true,
				quality: 0.8,
				allowsMultipleSelection: true,
				selectionLimit: 10,
			});

			if (!result.canceled && result.assets.length > 0) {
				// Use global cached location for all images (instant, no GPS delay)
				const cachedLocation = getCachedLocation();
				const newImages: TaggedImage[] = result.assets
					.filter((asset) => asset.base64)
					.map((asset) =>
						createTaggedImageSync(
							asset.base64 ?? "",
							"gallery",
							cachedLocation,
						),
					);
				setTaggingImages((prev) => [...prev, ...newImages]);
				logger.debug(TAG, `=== GALLERY IMAGES ADDED: ${newImages.length} ===`);
				if (newImages.length > 0) {
					logger.debug(
						TAG,
						`  Using cached location: lat=${newImages[0].lat}, long=${newImages[0].long}`,
					);
				}
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to pick from gallery";
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
	const processSpeechResult = useCallback(
		(text: string) => {
			if (!text.trim()) return;

			if (!isTaggingActiveRef.current) {
				// Not in tagging mode - check for start keywords
				const startKeyword = detectTaggingStartKeyword(text);
				if (startKeyword) {
					logger.debug(TAG, "Detected start keyword:", startKeyword);
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
					logger.debug(TAG, "Detected end keyword:", endKeyword);

					// Add the text before the keyword
					const beforeKeyword = removeEndKeyword(text, endKeyword);
					if (beforeKeyword) {
						// Set flag to trigger save after transcript state updates
						pendingSaveRef.current = true;
						setTaggingTranscript((prev) =>
							prev ? `${prev} ${beforeKeyword}` : beforeKeyword,
						);
					} else {
						// No text to add, save immediately since transcript is already complete
						void saveTaggingSessionInternal();
					}
				} else {
					// Add text to transcript
					addTranscript(text);
				}
			}
		},
		[startTagging, addTranscript, saveTaggingSessionInternal],
	);

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
		editTranscript,
		captureFromGlasses,
		captureFromPhone,
		pickFromGallery,
		removeImage,
		processSpeechResult,
		isGlassesCameraReady,
		isGlassesCapturing,
	};
}
