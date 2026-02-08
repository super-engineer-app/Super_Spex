/**
 * Cross-platform file operations for FormData and file sharing.
 * Web version — uses Blob, object URLs, and download links.
 */

/**
 * Convert a base64 string to a Blob.
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
	const byteString = atob(base64);
	const bytes = new Uint8Array(byteString.length);
	for (let i = 0; i < byteString.length; i++) {
		bytes[i] = byteString.charCodeAt(i);
	}
	return new Blob([bytes], { type: mimeType });
}

/**
 * Trigger a browser file download.
 */
function triggerDownload(url: string, fileName: string): void {
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

/**
 * Append a base64 image to FormData as a Blob.
 * Returns null (no temp file to clean up on web).
 */
export async function appendImageFileToFormData(
	formData: FormData,
	fieldName: string,
	base64: string,
	fileName = "capture.jpg",
	mimeType = "image/jpeg",
): Promise<string | null> {
	const blob = base64ToBlob(base64, mimeType);
	formData.append(fieldName, blob, fileName);
	return null;
}

/**
 * Append a base64 image to FormData as a Blob.
 * On web, this is identical to appendImageFileToFormData.
 */
export function appendImageDataUriToFormData(
	formData: FormData,
	fieldName: string,
	base64: string,
	fileName = "capture.jpg",
	mimeType = "image/jpeg",
): void {
	const blob = base64ToBlob(base64, mimeType);
	formData.append(fieldName, blob, fileName);
}

/**
 * No-op on web — no temp files to clean up.
 */
export async function cleanupTempFile(_uri: string): Promise<void> {
	// No-op
}

/**
 * Trigger a browser download for a file.
 * Returns true.
 */
export async function shareFileFromUri(
	fileUri: string,
	_mimeType: string,
	_title: string,
): Promise<boolean> {
	triggerDownload(fileUri, "recording.mp4");
	return true;
}

/**
 * Create a text file and trigger browser download.
 * Returns true.
 */
export async function shareTextFile(
	text: string,
	fileName: string,
): Promise<boolean> {
	const blob = new Blob([text], { type: "text/plain" });
	const url = URL.createObjectURL(blob);
	triggerDownload(url, fileName);
	URL.revokeObjectURL(url);
	return true;
}
