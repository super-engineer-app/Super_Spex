/**
 * Backend API Service
 *
 * Sends captured audio transcripts and images to the AI backend
 * and handles streaming responses.
 */

import { File, Paths } from "expo-file-system/next";
import type { ReactNativeFile } from "../types/reactNativeFile";
import logger from "../utils/logger";

const TAG = "BackendAPI";

const BACKEND_URL =
	process.env.EXPO_PUBLIC_BACKEND_URL || "https://superspexwins.fly.dev";
const GENERATE_ENDPOINT = `${BACKEND_URL}/generate_temp`;

// Generate a random UUID for the session
function generateUUID(): string {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Save base64 image to a temp file and return the URI
 */
async function saveBase64ToTempFile(base64: string): Promise<string> {
	const filename = `capture_${Date.now()}.jpg`;
	const file = new File(Paths.cache, filename);
	file.base64 = base64;
	return file.uri;
}

/**
 * Clean up temp file
 */
async function deleteTempFile(fileUri: string): Promise<void> {
	try {
		const file = new File(fileUri);
		file.delete();
	} catch (e) {
		logger.warn(TAG, "Failed to delete temp file:", e);
	}
}

// Session state
let sessionUserId: string | null = null;
let currentConversationId: string | null = null;

/**
 * Get or create a session user ID
 */
export function getSessionUserId(): string {
	if (!sessionUserId) {
		sessionUserId = generateUUID();
		logger.debug(TAG, "Created session user ID:", sessionUserId);
	}
	return sessionUserId;
}

/**
 * Get the current conversation ID
 */
export function getConversationId(): string | null {
	return currentConversationId;
}

/**
 * Set the conversation ID (returned from backend)
 */
export function setConversationId(id: string | null): void {
	currentConversationId = id;
	logger.debug(TAG, "Conversation ID set to:", id);
}

/**
 * Reset session (new user ID and clear conversation)
 */
export function resetSession(): void {
	sessionUserId = generateUUID();
	currentConversationId = null;
	logger.debug(TAG, "Session reset, new user ID:", sessionUserId);
}

export interface SendToBackendOptions {
	text?: string;
	imageBase64?: string;
	onChunk?: (chunk: string) => void;
	onComplete?: (fullResponse: string, conversationId: string | null) => void;
	onError?: (error: Error) => void;
}

export interface BackendResponse {
	success: boolean;
	response?: string;
	conversationId?: string;
	error?: string;
}

/**
 * Send data to the backend and handle streaming response
 */
export async function sendToBackend(
	options: SendToBackendOptions,
): Promise<BackendResponse> {
	const { text, imageBase64, onChunk, onComplete, onError } = options;

	if (!text && !imageBase64) {
		const error = new Error("Must provide either text or image");
		onError?.(error);
		return { success: false, error: error.message };
	}

	const userId = getSessionUserId();
	let tempFileUri: string | null = null;

	try {
		const formData = new FormData();
		formData.append("user_id", userId);

		if (currentConversationId) {
			formData.append("conversation_id", currentConversationId);
		}

		if (text) {
			formData.append("text", text);
		}

		if (imageBase64) {
			// Save base64 to temp file and use file URI (React Native compatible)
			tempFileUri = await saveBase64ToTempFile(imageBase64);
			formData.append("image", {
				uri: tempFileUri,
				type: "image/jpeg",
				name: "capture.jpg",
			} as ReactNativeFile as unknown as Blob);
		}

		logger.debug(TAG, "Sending request to:", GENERATE_ENDPOINT);
		logger.debug(TAG, "user_id:", userId);
		logger.debug(TAG, "conversation_id:", currentConversationId);
		logger.debug(TAG, "has text:", !!text);
		logger.debug(TAG, "has image:", !!imageBase64);

		const response = await fetch(GENERATE_ENDPOINT, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Backend error (${response.status}): ${errorText}`);
		}

		// Get full response (React Native doesn't support streaming)
		const responseText = await response.text();
		logger.debug(TAG, "Raw response:", responseText.substring(0, 500));

		let fullResponse = "";
		let newConversationId: string | null = null;

		// Parse SSE format if applicable
		const lines = responseText.split("\n");
		for (const line of lines) {
			if (line.startsWith("data: ")) {
				const data = line.slice(6);
				try {
					const parsed = JSON.parse(data);
					if (parsed.conversation_id) {
						newConversationId = parsed.conversation_id;
						setConversationId(newConversationId);
					}
					if (parsed.text) {
						fullResponse += parsed.text;
					}
					if (parsed.content) {
						fullResponse += parsed.content;
					}
					if (parsed.response) {
						fullResponse += parsed.response;
					}
				} catch {
					// Not JSON, treat as plain text
					fullResponse += data;
				}
			} else if (line.trim() && !line.startsWith(":")) {
				// Try to parse as JSON directly
				try {
					const parsed = JSON.parse(line);
					if (parsed.conversation_id) {
						newConversationId = parsed.conversation_id;
						setConversationId(newConversationId);
					}
					if (parsed.text) {
						fullResponse += parsed.text;
					}
					if (parsed.content) {
						fullResponse += parsed.content;
					}
					if (parsed.response) {
						fullResponse += parsed.response;
					}
				} catch {
					// Plain text line
					fullResponse += line;
				}
			}
		}

		// If no parsed content, use raw response
		if (!fullResponse.trim()) {
			fullResponse = responseText;
		}

		logger.debug(TAG, "Response complete, length:", fullResponse.length);
		onChunk?.(fullResponse);
		onComplete?.(fullResponse, newConversationId);

		// Clean up temp file
		if (tempFileUri) {
			await deleteTempFile(tempFileUri);
		}

		return {
			success: true,
			response: fullResponse,
			conversationId: newConversationId || currentConversationId || undefined,
		};
	} catch (error) {
		// Clean up temp file on error
		if (tempFileUri) {
			await deleteTempFile(tempFileUri);
		}

		const err = error instanceof Error ? error : new Error(String(error));
		logger.error(TAG, "Error:", err.message);
		onError?.(err);
		return { success: false, error: err.message };
	}
}

/**
 * Send text (speech transcript) to the backend
 */
export async function sendText(
	text: string,
	callbacks?: Omit<SendToBackendOptions, "text" | "imageBase64">,
): Promise<BackendResponse> {
	return sendToBackend({ text, ...callbacks });
}

/**
 * Send image to the backend
 */
export async function sendImage(
	imageBase64: string,
	callbacks?: Omit<SendToBackendOptions, "text" | "imageBase64">,
): Promise<BackendResponse> {
	return sendToBackend({ imageBase64, ...callbacks });
}

/**
 * Send both text and image to the backend
 */
export async function sendTextAndImage(
	text: string,
	imageBase64: string,
	callbacks?: Omit<SendToBackendOptions, "text" | "imageBase64">,
): Promise<BackendResponse> {
	return sendToBackend({ text, imageBase64, ...callbacks });
}
