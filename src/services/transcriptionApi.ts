/**
 * Transcription API types and formatting utilities.
 *
 * Used by the useVideoRecording hook to process and display
 * speaker-diarized transcription results from the backend.
 */

/** A single segment from speaker-diarized transcription */
export interface TranscriptionSegment {
	speaker: string;
	text: string;
	start: number;
	end: number;
}

/** Response from the transcription backend */
export interface TranscriptionResult {
	segments: TranscriptionSegment[];
}

/**
 * Format a number of seconds as MM:SS.
 */
function formatTimestamp(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format transcription segments as human-readable text.
 *
 * Output format:
 * [00:01 - 00:05] Speaker 0: Hello, how are you?
 * [00:06 - 00:10] Speaker 1: I'm doing well, thanks!
 */
export function formatTranscriptAsText(
	segments: TranscriptionSegment[],
): string {
	return segments
		.map(
			(seg) =>
				`[${formatTimestamp(seg.start)} - ${formatTimestamp(seg.end)}] ${seg.speaker}: ${seg.text}`,
		)
		.join("\n");
}

/**
 * Runtime validation that a value matches the TranscriptionResult shape.
 * Used to validate responses from the native bridge before trusting the data.
 */
export function isValidTranscriptionResult(
	data: unknown,
): data is TranscriptionResult {
	if (data === null || data === undefined || typeof data !== "object") {
		return false;
	}

	const obj = data as Record<string, unknown>;

	if (!Array.isArray(obj.segments)) {
		return false;
	}

	return obj.segments.every((segment: unknown) => {
		if (
			segment === null ||
			segment === undefined ||
			typeof segment !== "object"
		) {
			return false;
		}
		const seg = segment as Record<string, unknown>;
		return (
			typeof seg.speaker === "string" &&
			typeof seg.text === "string" &&
			typeof seg.start === "number" &&
			typeof seg.end === "number"
		);
	});
}
