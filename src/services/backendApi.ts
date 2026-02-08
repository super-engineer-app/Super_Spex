/**
 * Backend API Service
 *
 * Sends captured audio transcripts and images to the AI backend
 * and handles streaming responses.
 *
 * Cross-platform: delegates image handling to formDataHelper
 * (platform-split via .web.ts).
 */

import {
	appendImageFileToFormData,
	cleanupTempFile,
} from "../utils/formDataHelper";
import logger from "../utils/logger";

const TAG = "BackendAPI";

const BACKEND_URL =
	process.env.EXPO_PUBLIC_BACKEND_URL || "http://10.0.2.2:8000";
const GENERATE_ENDPOINT = `${BACKEND_URL}/generate_temp`;

function generateUUID(): string {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

// Session state
let sessionUserId: string | null = null;
let currentConversationId: string | null = null;

export function getSessionUserId(): string {
	if (!sessionUserId) {
		sessionUserId = generateUUID();
		logger.debug(TAG, "Created session user ID:", sessionUserId);
	}
	return sessionUserId;
}

export function getConversationId(): string | null {
	return currentConversationId;
}

export function setConversationId(id: string | null): void {
	currentConversationId = id;
	logger.debug(TAG, "Conversation ID set to:", id);
}

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
 * Send data to the backend and handle streaming response.
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
			tempFileUri = await appendImageFileToFormData(
				formData,
				"image",
				imageBase64,
			);
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

		const responseText = await response.text();
		logger.debug(TAG, "Raw response:", responseText.substring(0, 500));

		let fullResponse = "";
		let newConversationId: string | null = null;

		// Parse SSE format: "data: {...}\n"
		const lines = responseText.split("\n");
		for (const line of lines) {
			if (line.startsWith("data: ")) {
				const data = line.slice(6);
				try {
					const parsed: Record<string, unknown> = JSON.parse(data);
					if (typeof parsed.conversation_id === "string") {
						newConversationId = parsed.conversation_id;
						setConversationId(newConversationId);
					}
					if (typeof parsed.text === "string") {
						fullResponse += parsed.text;
					}
					if (typeof parsed.content === "string") {
						fullResponse += parsed.content;
					}
					if (typeof parsed.response === "string") {
						fullResponse += parsed.response;
					}
				} catch {
					// Not JSON, treat as plain text
					fullResponse += data;
				}
			} else if (line.trim() && !line.startsWith(":")) {
				try {
					const parsed: Record<string, unknown> = JSON.parse(line);
					if (typeof parsed.conversation_id === "string") {
						newConversationId = parsed.conversation_id;
						setConversationId(newConversationId);
					}
					if (typeof parsed.text === "string") {
						fullResponse += parsed.text;
					}
					if (typeof parsed.content === "string") {
						fullResponse += parsed.content;
					}
					if (typeof parsed.response === "string") {
						fullResponse += parsed.response;
					}
				} catch {
					// Plain text line
					fullResponse += line;
				}
			}
		}

		if (!fullResponse.trim()) {
			fullResponse = responseText;
		}

		logger.debug(TAG, "Response complete, length:", fullResponse.length);
		onChunk?.(fullResponse);
		onComplete?.(fullResponse, newConversationId);

		if (tempFileUri) {
			await cleanupTempFile(tempFileUri);
		}

		return {
			success: true,
			response: fullResponse,
			conversationId: newConversationId || currentConversationId || undefined,
		};
	} catch (error) {
		if (tempFileUri) {
			await cleanupTempFile(tempFileUri);
		}

		const err = error instanceof Error ? error : new Error(String(error));
		logger.error(TAG, "Error:", err.message);
		onError?.(err);
		return { success: false, error: err.message };
	}
}

/**
 * Send text (speech transcript) to the backend.
 */
export async function sendText(
	text: string,
	callbacks?: Omit<SendToBackendOptions, "text" | "imageBase64">,
): Promise<BackendResponse> {
	return sendToBackend({ text, ...callbacks });
}

/**
 * Send image to the backend.
 */
export async function sendImage(
	imageBase64: string,
	callbacks?: Omit<SendToBackendOptions, "text" | "imageBase64">,
): Promise<BackendResponse> {
	return sendToBackend({ imageBase64, ...callbacks });
}

/**
 * Send both text and image to the backend.
 */
export async function sendTextAndImage(
	text: string,
	imageBase64: string,
	callbacks?: Omit<SendToBackendOptions, "text" | "imageBase64">,
): Promise<BackendResponse> {
	return sendToBackend({ text, imageBase64, ...callbacks });
}
