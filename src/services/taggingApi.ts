/**
 * Tagging API Service
 *
 * Sends tagging sessions (transcript + geotagged images) to the backend.
 * The backend saves these to Google Drive.
 */

import * as Location from "expo-location";
import type { ReactNativeFile } from "../types/reactNativeFile";
import type {
	TaggedImage,
	TaggingSessionRequest,
	TaggingStatusEvent,
} from "../types/tagging";
import logger from "../utils/logger";

const TAG = "TaggingAPI";

// For Android emulator: 10.0.2.2 maps to host machine's localhost
// For real device on same network: use host machine's local IP (e.g., 192.168.x.x)
const BACKEND_URL =
	process.env.EXPO_PUBLIC_TAGGING_API_URL || "http://10.0.2.2:8000";
const TAGGING_ENDPOINT = `${BACKEND_URL}/tagging-sessions`;

// DEV MODE: Fixed IDs for testing with local backend
// These must match users/orgs that exist in the backend database
const DEV_USER_ID = 1;
const DEV_ORG_ID = 1;

/**
 * Get user ID for tagging.
 * Currently using fixed ID for dev testing.
 * TODO: Replace with proper authentication.
 */
export function getTaggingUserId(): number {
	logger.debug(TAG, "Using dev user_id:", DEV_USER_ID);
	return DEV_USER_ID;
}

/**
 * Get org ID for tagging.
 * Currently using fixed ID for dev testing.
 * TODO: Replace with proper authentication.
 */
export function getTaggingOrgId(): number {
	logger.debug(TAG, "Using dev org_id:", DEV_ORG_ID);
	return DEV_ORG_ID;
}

/**
 * Reset session (no-op in dev mode with fixed IDs).
 */
export function resetTaggingSession(): void {
	logger.debug(TAG, "Session reset (no-op in dev mode)");
}

/**
 * Format today's date as YYYY-MM-DD.
 */
function getLocalDateString(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Callback options for tagging session submission.
 */
export interface SubmitTaggingSessionOptions {
	/** Called with status updates from the backend */
	onStatus?: (status: TaggingStatusEvent) => void;
	/** Called when save completes successfully */
	onComplete?: (message: string) => void;
	/** Called if an error occurs */
	onError?: (error: Error) => void;
}

/**
 * Result of a tagging session submission.
 */
export interface SubmitTaggingSessionResult {
	success: boolean;
	message?: string;
	error?: string;
}

/**
 * Submit a tagging session to the backend.
 *
 * The backend streams SSE events with status updates.
 *
 * @param transcript - The speech transcript
 * @param images - Array of tagged images with GPS coordinates
 * @param options - Callbacks for status updates
 * @returns Promise resolving to the result
 */
export async function submitTaggingSession(
	transcript: string,
	images: TaggedImage[],
	options?: SubmitTaggingSessionOptions,
): Promise<SubmitTaggingSessionResult> {
	const { onStatus, onComplete, onError } = options ?? {};

	// Validate inputs
	if (!transcript.trim()) {
		const error = new Error("Transcript cannot be empty");
		onError?.(error);
		return { success: false, error: error.message };
	}

	if (images.length === 0) {
		const error = new Error("At least one image is required");
		onError?.(error);
		return { success: false, error: error.message };
	}

	// Build multipart form-data payload (backend uses Form() + File())
	const userId = getTaggingUserId();
	const orgId = getTaggingOrgId();
	const trimmedTranscript = transcript.trim();
	const localDate = getLocalDateString();

	// Coordinates as JSON string: [{lat, long}, ...]
	const coordinates = images.map((img) => ({
		lat: img.lat,
		long: img.long,
	}));

	const formData = new FormData();
	formData.append("user_id", String(userId));
	formData.append("org_id", String(orgId));
	formData.append("transcript", trimmedTranscript);
	formData.append("local_date", localDate);
	formData.append("coordinates", JSON.stringify(coordinates));

	// Attach images as file uploads using React Native's FormData pattern
	// RN doesn't support Blob - use {uri, type, name} objects with data URIs
	for (let i = 0; i < images.length; i++) {
		const img = images[i];
		formData.append("images", {
			uri: `data:image/jpeg;base64,${img.base64}`,
			type: "image/jpeg",
			name: `image_${i + 1}.jpg`,
		} as ReactNativeFile as unknown as Blob);
	}

	logger.debug(TAG, "Submitting tagging session:", {
		user_id: userId,
		org_id: orgId,
		transcript_length: trimmedTranscript.length,
		image_count: images.length,
		local_date: localDate,
	});

	try {
		onStatus?.({ type: "tagging_status", content: "Connecting to server..." });

		const response = await fetch(TAGGING_ENDPOINT, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Server error (${response.status}): ${errorText}`);
		}

		// Parse SSE response
		const responseText = await response.text();
		logger.debug(TAG, "Raw response:", responseText.substring(0, 500));

		let finalMessage = "";
		let hasError = false;

		// Parse SSE format: "data: {...}\n\n"
		const lines = responseText.split("\n");
		for (const line of lines) {
			if (line.startsWith("data: ")) {
				const data = line.slice(6);
				try {
					const event = JSON.parse(data) as TaggingStatusEvent;
					onStatus?.(event);

					if (event.type === "done") {
						finalMessage = event.content;
					} else if (event.type === "error") {
						hasError = true;
						finalMessage = event.content;
					}
				} catch {
					// Not JSON, ignore
					logger.debug(TAG, "Non-JSON SSE line:", data);
				}
			}
		}

		if (hasError) {
			const error = new Error(finalMessage || "Unknown server error");
			onError?.(error);
			return { success: false, error: error.message };
		}

		const successMessage = finalMessage || "Tagging session saved successfully";
		logger.debug(TAG, "Success:", successMessage);
		onComplete?.(successMessage);
		return { success: true, message: successMessage };
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		logger.error(TAG, "Error:", error.message);
		onError?.(error);
		return { success: false, error: error.message };
	}
}

/**
 * Location permission status.
 */
export interface LocationPermissionStatus {
	granted: boolean;
	canAskAgain: boolean;
}

/**
 * Request location permission.
 * @returns Permission status
 */
export async function requestLocationPermission(): Promise<LocationPermissionStatus> {
	try {
		const { status, canAskAgain } =
			await Location.requestForegroundPermissionsAsync();
		return {
			granted: status === "granted",
			canAskAgain,
		};
	} catch (error) {
		logger.error(TAG, "Location permission error:", error);
		return { granted: false, canAskAgain: false };
	}
}

/**
 * Get current GPS coordinates.
 * @returns Coordinates or null if unavailable
 */
export async function getCurrentLocation(): Promise<{
	lat: number;
	long: number;
} | null> {
	try {
		const { status } = await Location.getForegroundPermissionsAsync();
		if (status !== "granted") {
			logger.warn(TAG, "Location permission not granted");
			return null;
		}

		const location = await Location.getCurrentPositionAsync({
			accuracy: Location.Accuracy.Balanced,
		});

		return {
			lat: location.coords.latitude,
			long: location.coords.longitude,
		};
	} catch (error) {
		logger.error(TAG, "Get location error:", error);
		return null;
	}
}

/**
 * Cached location coordinates.
 */
export interface CachedLocation {
	lat: number;
	long: number;
}

// ============================================================
// Global GPS Cache - Pre-fetched on app startup for instant access
// ============================================================

let globalCachedLocation: CachedLocation | null = null;
let globalLocationFetchPromise: Promise<CachedLocation | null> | null = null;
let lastFetchTime = 0;
const LOCATION_CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Pre-fetch GPS location on app startup.
 * Call this early (e.g., in _layout.tsx) to warm up the GPS cache.
 * Subsequent calls within 5 minutes will use the cached value.
 */
export async function prefetchLocation(): Promise<CachedLocation | null> {
	const now = Date.now();

	// If we have a recent cached location, return it
	if (globalCachedLocation && now - lastFetchTime < LOCATION_CACHE_MAX_AGE_MS) {
		logger.debug(TAG, "Using existing cached GPS location");
		return globalCachedLocation;
	}

	// If a fetch is already in progress, wait for it
	if (globalLocationFetchPromise) {
		logger.debug(TAG, "GPS fetch already in progress, waiting...");
		return globalLocationFetchPromise;
	}

	// Start a new fetch
	logger.debug(TAG, "=== PRE-FETCHING GPS LOCATION ===");
	const startTime = Date.now();

	globalLocationFetchPromise = getCurrentLocation()
		.then((location) => {
			const elapsed = Date.now() - startTime;
			globalCachedLocation = location;
			lastFetchTime = Date.now();
			globalLocationFetchPromise = null;

			if (location) {
				logger.debug(
					TAG,
					`GPS cached (${elapsed}ms): ${location.lat}, ${location.long}`,
				);
			} else {
				logger.debug(TAG, `GPS unavailable (${elapsed}ms)`);
			}

			return location;
		})
		.catch((error) => {
			logger.error(TAG, "GPS pre-fetch error:", error);
			globalLocationFetchPromise = null;
			return null;
		});

	return globalLocationFetchPromise;
}

/**
 * Get the globally cached GPS location (instant, no waiting).
 * Returns null if not yet fetched or unavailable.
 */
export function getCachedLocation(): CachedLocation | null {
	return globalCachedLocation;
}

/**
 * Refresh the global GPS cache.
 * Use this when starting a tagging session to ensure fresh coordinates.
 */
export async function refreshLocationCache(): Promise<CachedLocation | null> {
	// Force a refresh by clearing the cache
	const now = Date.now();

	// Only force refresh if cache is older than 1 minute
	if (globalCachedLocation && now - lastFetchTime < 60 * 1000) {
		logger.debug(TAG, "GPS cache is fresh (< 1 min), skipping refresh");
		return globalCachedLocation;
	}

	// Clear and re-fetch
	globalCachedLocation = null;
	return prefetchLocation();
}

/**
 * Create a tagged image with provided GPS coordinates (instant, no GPS lookup).
 *
 * @param base64 - Base64-encoded image data
 * @param source - Source of the image (glasses, phone, gallery)
 * @param cachedLocation - Pre-fetched GPS coordinates (or null for 0,0)
 * @returns TaggedImage with GPS coordinates
 */
export function createTaggedImageSync(
	base64: string,
	source: "glasses" | "phone" | "gallery",
	cachedLocation: CachedLocation | null,
): TaggedImage {
	return {
		base64,
		lat: cachedLocation?.lat ?? 0,
		long: cachedLocation?.long ?? 0,
		capturedAt: Date.now(),
		source,
	};
}

/**
 * Create a tagged image with current GPS coordinates.
 *
 * @deprecated Use createTaggedImageSync with a pre-fetched location for better performance.
 * This function blocks on GPS lookup which can take 10+ seconds.
 *
 * @param base64 - Base64-encoded image data
 * @param source - Source of the image (glasses, phone, gallery)
 * @returns TaggedImage with GPS coordinates (or 0,0 if unavailable)
 */
export async function createTaggedImage(
	base64: string,
	source: "glasses" | "phone" | "gallery",
): Promise<TaggedImage> {
	const location = await getCurrentLocation();

	return {
		base64,
		lat: location?.lat ?? 0,
		long: location?.long ?? 0,
		capturedAt: Date.now(),
		source,
	};
}
