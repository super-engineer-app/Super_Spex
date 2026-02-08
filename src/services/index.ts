export type { ErrorSeverity } from "./errorReporting";
export {
	handleNativeError,
	initializeErrorReporting,
	reportError,
	sendErrorToDiscord,
} from "./errorReporting";
export type {
	LocationPermissionStatus,
	SubmitTaggingSessionOptions,
	SubmitTaggingSessionResult,
} from "./taggingApi";
// Tagging API
export {
	createTaggedImage,
	getCurrentLocation,
	getTaggingOrgId,
	getTaggingUserId,
	requestLocationPermission,
	resetTaggingSession,
	submitTaggingSession,
} from "./taggingApi";
export type {
	TranscriptionResult,
	TranscriptionSegment,
} from "./transcriptionApi";
// Transcription API
export {
	formatTranscriptAsText,
	isValidTranscriptionResult,
} from "./transcriptionApi";
