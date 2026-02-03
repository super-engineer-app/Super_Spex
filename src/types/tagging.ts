/**
 * Tagging Session Types
 *
 * Types for the voice-activated tagging feature that sends
 * transcripts and geotagged images to the backend.
 */

/**
 * A single tagged image with GPS coordinates.
 * Coordinates are required by the backend API.
 */
export interface TaggedImage {
  /** Base64-encoded image data (JPEG) */
  base64: string;
  /** Latitude coordinate (-90 to 90) */
  lat: number;
  /** Longitude coordinate (-180 to 180) */
  long: number;
  /** Timestamp when image was captured */
  capturedAt: number;
  /** Source of the image */
  source: 'glasses' | 'phone' | 'gallery';
}

/**
 * Request payload for the /tagging-sessions endpoint.
 */
export interface TaggingSessionRequest {
  /** User ID (random UUID for now - TODO: implement proper auth) */
  user_id: number;
  /** Organization ID (random for now - TODO: implement proper auth) */
  org_id: number;
  /** Text transcript from speech recognition */
  transcript: string;
  /** Array of tagged images with GPS coordinates */
  images: Array<{
    base64: string;
    lat: number;
    long: number;
  }>;
  /** Date in YYYY-MM-DD format */
  local_date: string;
}

/**
 * Status update from the tagging endpoint (SSE stream).
 */
export interface TaggingStatusEvent {
  type: 'tagging_status' | 'done' | 'error';
  content: string;
}

/**
 * State of an active tagging session.
 */
export interface TaggingSessionState {
  /** Whether a tagging session is currently active */
  isActive: boolean;
  /** Transcript accumulated during the tagging session */
  transcript: string;
  /** Images captured during the tagging session */
  images: TaggedImage[];
  /** Whether the session is being saved to backend */
  isSaving: boolean;
  /** Error message if save failed */
  error: string | null;
  /** Status message from backend during save */
  statusMessage: string | null;
}

/**
 * Keywords that trigger tagging mode.
 * Case-insensitive matching.
 */
export const TAGGING_START_KEYWORDS = ['note', 'tag', 'start tagging', 'new tag'] as const;

/**
 * Keywords that end tagging mode and save.
 * Case-insensitive matching.
 */
export const TAGGING_END_KEYWORDS = ['done', 'save', 'finish', 'end tag', 'save tag'] as const;

/**
 * Check if text contains any of the start keywords.
 * Returns the keyword found, or null if none.
 * Detects keywords anywhere in the text (e.g., "make a note", "call mom note this").
 */
export function detectTaggingStartKeyword(text: string): string | null {
  const lowerText = text.toLowerCase().trim();

  for (const keyword of TAGGING_START_KEYWORDS) {
    // Check if text contains the keyword as a word (not part of another word)
    // Match: "note", "note this", "make a note", "take note please"
    // Don't match: "notebook", "noted", "denote"
    const wordBoundaryPattern = new RegExp(`\\b${keyword}\\b`, 'i');
    if (wordBoundaryPattern.test(lowerText)) {
      return keyword;
    }
  }

  return null;
}

/**
 * Check if text contains any of the end keywords.
 * Returns the keyword found, or null if none.
 * Detects keywords anywhere in the text (e.g., "I'm done", "save this").
 */
export function detectTaggingEndKeyword(text: string): string | null {
  const lowerText = text.toLowerCase().trim();

  for (const keyword of TAGGING_END_KEYWORDS) {
    // Check if text contains the keyword as a word (not part of another word)
    const wordBoundaryPattern = new RegExp(`\\b${keyword}\\b`, 'i');
    if (wordBoundaryPattern.test(lowerText)) {
      return keyword;
    }
  }

  return null;
}

/**
 * Extract the text after the trigger keyword.
 * E.g., "call mom make a note there is a crack" -> "there is a crack"
 * E.g., "note this is important" -> "this is important"
 */
export function removeStartKeyword(text: string, keyword: string): string {
  const lowerText = text.toLowerCase();
  const keywordIndex = lowerText.indexOf(keyword.toLowerCase());

  if (keywordIndex !== -1) {
    // Return everything after the keyword
    return text.slice(keywordIndex + keyword.length).trim();
  }

  return text.trim();
}

/**
 * Extract the text before the end keyword.
 * E.g., "there is a crack here done please" -> "there is a crack here"
 * E.g., "save the photo" -> "" (keyword at start means no content before)
 */
export function removeEndKeyword(text: string, keyword: string): string {
  const lowerText = text.toLowerCase();
  const keywordIndex = lowerText.indexOf(keyword.toLowerCase());

  if (keywordIndex !== -1) {
    // Return everything before the keyword
    return text.slice(0, keywordIndex).trim();
  }

  return text.trim();
}
