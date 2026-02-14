import { useCallback, useEffect, useRef, useState } from "react";
import {
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useTaggingSession } from "../../hooks/useTaggingSession";
import { useVideoRecording } from "../../hooks/useVideoRecording";
import { COLORS } from "../../theme";
import { useDashboard } from "../dashboard/DashboardContext";
import { ActionButton } from "../shared/ActionButton";
import { LiveCameraPreview } from "../shared/LiveCameraPreview";
import { ModeHeader } from "../shared/ModeHeader";
import { RecordingIndicator } from "../shared/RecordingIndicator";
import { TaggingMode } from "../TaggingMode";

type NotesTab = "photo" | "video";

export function NotesMode() {
	const { speech, activeMode } = useDashboard();
	const [activeTab, setActiveTab] = useState<NotesTab>("video");

	const {
		isTaggingActive,
		taggingTranscript,
		taggingImages,
		isSaving: isTaggingSaving,
		error: taggingError,
		statusMessage: taggingStatus,
		isGlassesCameraReady: taggingCameraReady,
		isGlassesCapturing: taggingCameraCapturing,
		startTagging,
		cancelTagging,
		saveTaggingSession,
		captureFromGlasses,
		captureFromPhone,
		pickFromGallery,
		removeImage: removeTaggingImage,
		editTranscript,
	} = useTaggingSession();

	const {
		state: recordingState,
		startRecording,
		stopRecording,
		saveVideo,
		dismiss: dismissRecording,
		isRecording,
	} = useVideoRecording();

	// Track last processed transcript to avoid duplicates
	const lastProcessedTranscriptRef = useRef<string>("");

	// Live transcription note text for video mode
	const [videoNoteText, setVideoNoteText] = useState("");
	const [videoNoteSaved, setVideoNoteSaved] = useState(false);

	// Tracks whether we're in a video recording session (start → stop/dismiss).
	// Used instead of speech.isListening because native speech events can arrive
	// after stopListening(), leaving speech.isListening stuck on true.
	const [isVideoSession, setIsVideoSession] = useState(false);

	// Video playback paused state (paused by default after recording)
	const [isVideoPaused, setIsVideoPaused] = useState(true);

	// Photo mode audio recording state
	const [isPhotoAudioRecording, setIsPhotoAudioRecording] = useState(false);

	// Base transcript captured when photo audio recording starts (prevents infinite loop)
	const photoTranscriptBaseRef = useRef("");

	// Process speech final results for photo mode only.
	// Gated on isPhotoAudioRecording so video-mode transcription never leaks into photo mode.
	// Video tab uses its own videoNoteText state (effect below).
	useEffect(() => {
		if (activeMode !== "notes") return;
		if (activeTab !== "photo" || !isPhotoAudioRecording) return;
		if (!speech.transcript) return;
		if (speech.transcript === lastProcessedTranscriptRef.current) return;
		lastProcessedTranscriptRef.current = speech.transcript;

		// In photo mode, prepend base (text before recording started).
		// speech.transcript already accumulates all results, so don't update base.
		const base = photoTranscriptBaseRef.current;
		const newTranscript = base
			? `${base} ${speech.transcript}`
			: speech.transcript;
		editTranscript(newTranscript);
	}, [
		speech.transcript,
		activeTab,
		isPhotoAudioRecording,
		editTranscript,
		activeMode,
	]);

	// Live transcription: populate video note text during video recording session
	useEffect(() => {
		if (activeTab !== "video") return;
		if (!isVideoSession) return;
		const transcript = speech.partialTranscript || speech.transcript || "";
		if (transcript) {
			setVideoNoteText(transcript);
		}
	}, [speech.partialTranscript, speech.transcript, isVideoSession, activeTab]);

	// No server-side auto-transcribe — on-device speech recognition provides
	// real-time transcription during recording. MediaRecorder is not started
	// so SpeechRecognizer gets exclusive mic access.

	// Photo mode: update transcript with partial speech results in real-time
	// speech.partialTranscript already includes accumulated results + current partial,
	// so we only prepend the static base (text that existed before recording started).
	useEffect(() => {
		if (activeMode !== "notes") return;
		if (activeTab !== "photo" || !isPhotoAudioRecording) return;
		const partial = speech.partialTranscript;
		if (partial) {
			const base = photoTranscriptBaseRef.current;
			editTranscript(base ? `${base} ${partial}` : partial);
		}
	}, [
		speech.partialTranscript,
		activeTab,
		activeMode,
		isPhotoAudioRecording,
		editTranscript,
	]);

	const handleRecordNote = useCallback(async () => {
		if (isRecording) {
			setIsVideoSession(false);
			await stopRecording();
			await speech.stopListening();
		} else {
			setVideoNoteSaved(false);
			setVideoNoteText("");
			speech.clearTranscript();
			setIsVideoSession(true);
			await startRecording();
			await speech.startListening(true);
		}
	}, [isRecording, stopRecording, startRecording, speech]);

	// Photo mode: toggle audio recording (speech only, no video)
	const handlePhotoRecordNote = useCallback(async () => {
		if (isPhotoAudioRecording) {
			await speech.stopListening();
			setIsPhotoAudioRecording(false);
		} else {
			photoTranscriptBaseRef.current = taggingTranscript || "";
			await speech.startListening(true);
			setIsPhotoAudioRecording(true);
		}
	}, [isPhotoAudioRecording, speech, taggingTranscript]);

	const handleSaveVideoNote = useCallback(async () => {
		await saveVideo();
		setVideoNoteSaved(true);
	}, [saveVideo]);

	const handleClearVideoNote = useCallback(() => {
		setIsVideoSession(false);
		dismissRecording();
		setVideoNoteText("");
		setVideoNoteSaved(false);
		setIsVideoPaused(true);
		speech.clearTranscript();
	}, [dismissRecording, speech]);

	const isStopped = recordingState.recordingState === "stopped";
	const hasVideoContent = isStopped || videoNoteText.trim();
	const playbackUrl = isStopped ? (recordingState.fileUri ?? null) : null;

	const tabToggle = (
		<View style={styles.tabToggle}>
			<Pressable
				style={[
					styles.tabButton,
					activeTab === "video" && styles.tabButtonActive,
				]}
				onPress={() => setActiveTab("video")}
			>
				<Text
					style={[
						styles.tabButtonText,
						activeTab === "video" && styles.tabButtonTextActive,
					]}
				>
					Video
				</Text>
			</Pressable>
			<Pressable
				style={[
					styles.tabButton,
					activeTab === "photo" && styles.tabButtonActive,
				]}
				onPress={() => setActiveTab("photo")}
			>
				<Text
					style={[
						styles.tabButtonText,
						activeTab === "photo" && styles.tabButtonTextActive,
					]}
				>
					Photo
				</Text>
			</Pressable>
		</View>
	);

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<View style={styles.headerRow}>
				<View style={styles.headerLeft}>
					<ModeHeader title="Notes" subtitle="Make a video or photo note" />
				</View>
				{isRecording || isPhotoAudioRecording ? (
					<RecordingIndicator label="" />
				) : null}
			</View>

			{activeTab === "video" ? (
				<>
					<View style={styles.row}>
						<Pressable
							style={styles.previewColumn}
							onPress={
								isStopped ? () => setIsVideoPaused((p) => !p) : undefined
							}
						>
							<LiveCameraPreview
								active={activeMode === "notes"}
								playbackUrl={playbackUrl}
								paused={isVideoPaused}
							/>
							{isStopped && isVideoPaused ? (
								<View style={styles.playOverlay}>
									<Text style={styles.playIcon}>▶</Text>
								</View>
							) : null}
						</Pressable>

						<View style={styles.buttonsColumn}>
							{tabToggle}
							<ActionButton
								label={isRecording ? "Stop" : "Record note"}
								onPress={handleRecordNote}
								variant={isRecording ? "danger" : "secondary"}
							/>
							{isStopped ? (
								<>
									{videoNoteSaved ? (
										<ActionButton
											label="New note"
											onPress={handleClearVideoNote}
											variant="secondary"
										/>
									) : (
										<ActionButton
											label="Save"
											onPress={handleSaveVideoNote}
											variant="secondary"
										/>
									)}
								</>
							) : null}
							{hasVideoContent && !isRecording ? (
								<ActionButton
									label="Clear"
									onPress={handleClearVideoNote}
									variant="secondary"
								/>
							) : null}
						</View>
					</View>

					<View style={styles.noteSection}>
						<Text style={styles.noteLabel}>Your note</Text>
						<TextInput
							style={styles.noteInput}
							value={videoNoteText}
							onChangeText={setVideoNoteText}
							placeholder={
								isRecording ? "Listening..." : "Record a note to transcribe"
							}
							placeholderTextColor={COLORS.textMuted}
							multiline
							textAlignVertical="top"
						/>
					</View>
				</>
			) : (
				<TaggingMode
					isActive={isTaggingActive}
					tabToggle={tabToggle}
					transcript={taggingTranscript}
					images={taggingImages}
					isSaving={isTaggingSaving}
					error={taggingError}
					statusMessage={taggingStatus}
					isGlassesCameraReady={taggingCameraReady}
					isGlassesCapturing={taggingCameraCapturing}
					isRecordingAudio={isPhotoAudioRecording}
					onStartTagging={startTagging}
					onCancelTagging={cancelTagging}
					onSaveTagging={saveTaggingSession}
					onCaptureFromGlasses={captureFromGlasses}
					onCaptureFromPhone={captureFromPhone}
					onPickFromGallery={pickFromGallery}
					onRemoveImage={removeTaggingImage}
					onEditTranscript={editTranscript}
					onToggleRecordNote={handlePhotoRecordNote}
				/>
			)}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	scroll: {
		flex: 1,
	},
	scrollContent: {
		padding: 20,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	headerLeft: {
		flex: 1,
	},
	tabToggle: {
		flexDirection: "row",
		borderRadius: 8,
		overflow: "hidden",
		borderWidth: 1,
		borderColor: COLORS.border,
		alignSelf: "flex-start",
	},
	tabButton: {
		paddingHorizontal: 24,
		paddingVertical: 8,
		backgroundColor: COLORS.secondary,
	},
	tabButtonActive: {
		backgroundColor: COLORS.primary,
	},
	tabButtonText: {
		color: COLORS.textTertiary,
		fontSize: 14,
		fontWeight: "500",
	},
	tabButtonTextActive: {
		color: COLORS.primaryForeground,
	},
	row: {
		flexDirection: "row",
		gap: 16,
		alignItems: "flex-start",
	},
	previewColumn: {
		flex: 3,
		position: "relative",
	},
	playOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0, 0, 0, 0.3)",
		borderRadius: 8,
		marginVertical: 8,
	},
	playIcon: {
		fontSize: 40,
		color: "#fff",
	},
	buttonsColumn: {
		flex: 2,
		gap: 12,
	},
	noteSection: {
		marginTop: 16,
	},
	noteLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: COLORS.textPrimary,
		marginBottom: 8,
	},
	noteInput: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		padding: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
		color: COLORS.textPrimary,
		fontSize: 14,
		lineHeight: 20,
		minHeight: 120,
	},
});
