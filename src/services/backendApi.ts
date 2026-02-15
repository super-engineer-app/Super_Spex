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
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || "";

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
	onStatus?: (status: string) => void;
	onComplete?: (fullResponse: string, conversationId: string | null) => void;
	onError?: (error: Error) => void;
	/** AbortSignal to cancel the in-flight request (e.g. on user reset). */
	signal?: AbortSignal;
}

export interface BackendResponse {
	success: boolean;
	response?: string;
	conversationId?: string;
	error?: string;
}

/**
 * Parse a single SSE data payload and dispatch to the appropriate callback.
 * Returns the answer text content (if any) so the caller can accumulate it.
 */
function processSSEData(
	data: string,
	callbacks: {
		onChunk?: (chunk: string) => void;
		onStatus?: (status: string) => void;
		onError?: (error: Error) => void;
	},
	state: { conversationId: string | null },
): string {
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(data);
	} catch {
		// Not JSON — treat as plain answer text
		callbacks.onChunk?.(data);
		return data;
	}

	// Store conversation_id whenever we see it, regardless of event type
	if (typeof parsed.conversation_id === "string") {
		state.conversationId = parsed.conversation_id;
		setConversationId(parsed.conversation_id);
	}

	const eventType = typeof parsed.type === "string" ? parsed.type : null;

	switch (eventType) {
		case "answer": {
			const content = typeof parsed.content === "string" ? parsed.content : "";
			if (content) {
				callbacks.onChunk?.(content);
			}
			return content;
		}
		case "status": {
			const msg = typeof parsed.content === "string" ? parsed.content : "";
			if (msg) {
				callbacks.onStatus?.(msg);
			}
			return "";
		}
		case "conversation_id":
			// Already handled above — no display content
			return "";
		case "error": {
			const errMsg =
				typeof parsed.content === "string"
					? parsed.content
					: typeof parsed.error === "string"
						? parsed.error
						: "Backend error";
			callbacks.onError?.(new Error(errMsg));
			return "";
		}
		case "thought":
		case "done":
			return "";
		default: {
			// No type field — legacy format, extract text content
			let content = "";
			if (typeof parsed.content === "string") {
				content = parsed.content;
			} else if (typeof parsed.text === "string") {
				content = parsed.text;
			} else if (typeof parsed.response === "string") {
				content = parsed.response;
			}
			if (content) {
				callbacks.onChunk?.(content);
			}
			return content;
		}
	}
}

/**
 * Send data to the backend and handle streaming response via XHR.
 *
 * Uses XMLHttpRequest so that `onprogress` fires incrementally as
 * data arrives — unlike fetch which buffers the entire body in RN.
 */
export async function sendToBackend(
	options: SendToBackendOptions,
): Promise<BackendResponse> {
	const { text, imageBase64, onChunk, onStatus, onComplete, onError, signal } =
		options;

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

		// Already aborted before the request was sent
		if (signal?.aborted) {
			if (tempFileUri) await cleanupTempFile(tempFileUri);
			return { success: false, error: "Aborted" };
		}

		const result = await new Promise<BackendResponse>((resolve) => {
			const xhr = new XMLHttpRequest();
			let processedLength = 0;
			let lineBuffer = "";
			let fullResponse = "";
			const convState = { conversationId: null as string | null };
			const sseCallbacks = { onChunk, onStatus, onError };

			function processLines(raw: string) {
				lineBuffer += raw;
				const lines = lineBuffer.split("\n");
				// Keep the last element — it may be an incomplete line
				lineBuffer = lines.pop() ?? "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith(":")) continue;

					const data = trimmed.startsWith("data: ")
						? trimmed.slice(6)
						: trimmed;
					fullResponse += processSSEData(data, sseCallbacks, convState);
				}
			}

			// React Native's XHR only sends incremental progress events when
			// _incrementalEvents is true. The property setter for onprogress
			// doesn't set this flag — only addEventListener does. We set it
			// explicitly to ensure onprogress fires as chunks arrive.
			// No-op on web (property doesn't exist).
			// biome-ignore lint/suspicious/noExplicitAny: RN-specific non-standard property
			(xhr as any)._incrementalEvents = true; // eslint-disable-line @typescript-eslint/no-explicit-any

			xhr.open("POST", GENERATE_ENDPOINT);
			if (API_KEY) xhr.setRequestHeader("X-API-Key", API_KEY);

			xhr.onprogress = () => {
				const newData = xhr.responseText.slice(processedLength);
				processedLength = xhr.responseText.length;
				if (newData) {
					processLines(newData);
				}
			};

			xhr.onload = () => {
				// Process any remaining data not yet seen by onprogress
				const remaining = xhr.responseText.slice(processedLength);
				if (remaining) {
					processLines(remaining);
				}
				// Flush any remaining partial line in the buffer
				if (lineBuffer.trim()) {
					const data = lineBuffer.trim().startsWith("data: ")
						? lineBuffer.trim().slice(6)
						: lineBuffer.trim();
					fullResponse += processSSEData(data, sseCallbacks, convState);
					lineBuffer = "";
				}

				if (xhr.status >= 200 && xhr.status < 300) {
					logger.debug(TAG, "Response complete, length:", fullResponse.length);
					const convId = convState.conversationId;
					onComplete?.(fullResponse, convId);

					if (tempFileUri) {
						cleanupTempFile(tempFileUri);
					}

					resolve({
						success: true,
						response: fullResponse,
						conversationId: convId || currentConversationId || undefined,
					});
				} else {
					const err = new Error(
						`Backend error (${xhr.status}): ${xhr.responseText.substring(0, 200)}`,
					);
					logger.error(TAG, "HTTP error:", err.message);
					onError?.(err);

					if (tempFileUri) {
						cleanupTempFile(tempFileUri);
					}

					resolve({ success: false, error: err.message });
				}
			};

			xhr.onerror = () => {
				const err = new Error("Network error communicating with backend");
				logger.error(TAG, "XHR error");
				onError?.(err);

				if (tempFileUri) {
					cleanupTempFile(tempFileUri);
				}

				resolve({ success: false, error: err.message });
			};

			xhr.onabort = () => {
				logger.debug(TAG, "Request aborted");
				if (tempFileUri) {
					cleanupTempFile(tempFileUri);
				}
				resolve({ success: false, error: "Aborted" });
			};

			// Wire up AbortSignal to cancel the XHR
			if (signal) {
				signal.addEventListener("abort", () => xhr.abort());
			}

			xhr.send(formData);
		});

		return result;
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
