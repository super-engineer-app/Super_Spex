/**
 * Tagging API Service
 *
 * Sends tagging sessions (transcript + geotagged images) to the backend.
 * The backend saves these to Google Drive.
 */

import * as Location from 'expo-location';
import type {
  TaggingSessionRequest,
  TaggingStatusEvent,
  TaggedImage,
} from '../types/tagging';

// For Android emulator: 10.0.2.2 maps to host machine's localhost
// For real device on same network: use host machine's local IP (e.g., 192.168.x.x)
const BACKEND_URL = 'http://10.0.2.2:8000';
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
  console.log('[TaggingAPI] Using dev user_id:', DEV_USER_ID);
  return DEV_USER_ID;
}

/**
 * Get org ID for tagging.
 * Currently using fixed ID for dev testing.
 * TODO: Replace with proper authentication.
 */
export function getTaggingOrgId(): number {
  console.log('[TaggingAPI] Using dev org_id:', DEV_ORG_ID);
  return DEV_ORG_ID;
}

/**
 * Reset session (no-op in dev mode with fixed IDs).
 */
export function resetTaggingSession(): void {
  console.log('[TaggingAPI] Session reset (no-op in dev mode)');
}

/**
 * Format today's date as YYYY-MM-DD.
 */
function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
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
  options?: SubmitTaggingSessionOptions
): Promise<SubmitTaggingSessionResult> {
  const { onStatus, onComplete, onError } = options ?? {};

  // Validate inputs
  if (!transcript.trim()) {
    const error = new Error('Transcript cannot be empty');
    onError?.(error);
    return { success: false, error: error.message };
  }

  if (images.length === 0) {
    const error = new Error('At least one image is required');
    onError?.(error);
    return { success: false, error: error.message };
  }

  // Build request payload
  const payload: TaggingSessionRequest = {
    user_id: getTaggingUserId(),
    org_id: getTaggingOrgId(),
    transcript: transcript.trim(),
    images: images.map((img) => ({
      base64: img.base64,
      lat: img.lat,
      long: img.long,
    })),
    local_date: getLocalDateString(),
  };

  console.log('[TaggingAPI] Submitting tagging session:', {
    user_id: payload.user_id,
    org_id: payload.org_id,
    transcript_length: payload.transcript.length,
    image_count: payload.images.length,
    local_date: payload.local_date,
  });

  try {
    onStatus?.({ type: 'tagging_status', content: 'Connecting to server...' });

    const response = await fetch(TAGGING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error (${response.status}): ${errorText}`);
    }

    // Parse SSE response
    const responseText = await response.text();
    console.log('[TaggingAPI] Raw response:', responseText.substring(0, 500));

    let finalMessage = '';
    let hasError = false;

    // Parse SSE format: "data: {...}\n\n"
    const lines = responseText.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const event = JSON.parse(data) as TaggingStatusEvent;
          onStatus?.(event);

          if (event.type === 'done') {
            finalMessage = event.content;
          } else if (event.type === 'error') {
            hasError = true;
            finalMessage = event.content;
          }
        } catch {
          // Not JSON, ignore
          console.log('[TaggingAPI] Non-JSON SSE line:', data);
        }
      }
    }

    if (hasError) {
      const error = new Error(finalMessage || 'Unknown server error');
      onError?.(error);
      return { success: false, error: error.message };
    }

    const successMessage = finalMessage || 'Tagging session saved successfully';
    console.log('[TaggingAPI] Success:', successMessage);
    onComplete?.(successMessage);
    return { success: true, message: successMessage };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[TaggingAPI] Error:', error.message);
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
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    return {
      granted: status === 'granted',
      canAskAgain,
    };
  } catch (error) {
    console.error('[TaggingAPI] Location permission error:', error);
    return { granted: false, canAskAgain: false };
  }
}

/**
 * Get current GPS coordinates.
 * @returns Coordinates or null if unavailable
 */
export async function getCurrentLocation(): Promise<{ lat: number; long: number } | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[TaggingAPI] Location permission not granted');
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
    console.error('[TaggingAPI] Get location error:', error);
    return null;
  }
}

/**
 * Create a tagged image with current GPS coordinates.
 *
 * @param base64 - Base64-encoded image data
 * @param source - Source of the image (glasses, phone, gallery)
 * @returns TaggedImage with GPS coordinates (or 0,0 if unavailable)
 */
export async function createTaggedImage(
  base64: string,
  source: 'glasses' | 'phone' | 'gallery'
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
