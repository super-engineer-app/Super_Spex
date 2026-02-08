/**
 * Cross-platform file operations for FormData and file sharing.
 * Native (Android/iOS) version — uses expo-file-system and expo-sharing.
 *
 * The .web.ts variant handles browser APIs (Blob, download links).
 */

import { File, Paths } from "expo-file-system/next";
import * as Sharing from "expo-sharing";
import type { ReactNativeFile } from "../types/reactNativeFile";
import logger from "./logger";

const TAG = "FormDataHelper";

/**
 * Append a base64 image to FormData using a temp file.
 * Returns the temp file URI for cleanup, or null if no cleanup needed.
 */
export async function appendImageFileToFormData(
	formData: FormData,
	fieldName: string,
	base64: string,
	fileName = "capture.jpg",
	mimeType = "image/jpeg",
): Promise<string | null> {
	const tempFileName = `${Date.now()}_${fileName}`;
	const file = new File(Paths.cache, tempFileName);
	file.write(base64, { encoding: "base64" });

	formData.append(fieldName, {
		uri: file.uri,
		type: mimeType,
		name: fileName,
	} as ReactNativeFile as unknown as Blob);

	return file.uri;
}

/**
 * Append a base64 image to FormData using a data URI.
 * No temp file needed — suitable for smaller/multiple images.
 */
export function appendImageDataUriToFormData(
	formData: FormData,
	fieldName: string,
	base64: string,
	fileName = "capture.jpg",
	mimeType = "image/jpeg",
): void {
	formData.append(fieldName, {
		uri: `data:${mimeType};base64,${base64}`,
		type: mimeType,
		name: fileName,
	} as ReactNativeFile as unknown as Blob);
}

/**
 * Clean up a temp file created by appendImageFileToFormData.
 */
export async function cleanupTempFile(uri: string): Promise<void> {
	try {
		const file = new File(uri);
		file.delete();
	} catch (e) {
		logger.warn(TAG, "Failed to delete temp file:", e);
	}
}

/**
 * Share a file via the system share dialog.
 * Returns true if sharing was available.
 */
export async function shareFileFromUri(
	fileUri: string,
	mimeType: string,
	title: string,
): Promise<boolean> {
	const isAvailable = await Sharing.isAvailableAsync();
	if (isAvailable) {
		await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: title });
		return true;
	}
	return false;
}

/**
 * Create a text file and share it via the system share dialog.
 * Returns true if sharing was available.
 */
export async function shareTextFile(
	text: string,
	fileName: string,
): Promise<boolean> {
	const file = new File(Paths.cache, fileName);
	file.write(text);

	const isAvailable = await Sharing.isAvailableAsync();
	if (isAvailable) {
		await Sharing.shareAsync(file.uri, {
			mimeType: "text/plain",
			dialogTitle: "Share Transcript",
		});
		return true;
	}
	return false;
}
