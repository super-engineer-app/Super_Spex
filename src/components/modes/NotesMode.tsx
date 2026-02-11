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
import { ModeHeader } from "../shared/ModeHeader";
import { RecordingIndicator } from "../shared/RecordingIndicator";
import { TaggingMode } from "../TaggingMode";

type NotesTab = "photo" | "video";

export function NotesMode() {
	const { speech } = useDashboard();
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
		processSpeechResult,
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

	// Track if tagging was active before recording for auto-resume
	const wasTaggingBeforeRecordingRef = useRef(false);

	// Process speech results for tagging keyword detection
	useEffect(() => {
		if (!speech.transcript) return;
		if (speech.transcript === lastProcessedTranscriptRef.current) return;
		lastProcessedTranscriptRef.current = speech.transcript;
		processSpeechResult(speech.transcript);
	}, [speech.transcript, processSpeechResult]);

	// Live transcription: populate video note text while recording
	useEffect(() => {
		if (activeTab !== "video") return;
		const transcript = speech.partialTranscript || speech.transcript || "";
		if (transcript && isRecording) {
			setVideoNoteText(transcript);
		}
	}, [speech.partialTranscript, speech.transcript, isRecording, activeTab]);

	const handleRecordNote = useCallback(async () => {
		if (isRecording) {
			await stopRecording();
			await speech.stopListening();
		} else {
			if (isTaggingActive) {
				wasTaggingBeforeRecordingRef.current = true;
				cancelTagging();
			}
			setVideoNoteSaved(false);
			// Start both video recording and speech recognition for live transcription
			await startRecording();
			await speech.startListening(true);
		}
	}, [
		isRecording,
		stopRecording,
		startRecording,
		isTaggingActive,
		cancelTagging,
		speech,
	]);

	const handleSaveVideoNote = useCallback(async () => {
		await saveVideo();
		setVideoNoteSaved(true);
		if (wasTaggingBeforeRecordingRef.current) {
			wasTaggingBeforeRecordingRef.current = false;
			startTagging();
		}
	}, [saveVideo, startTagging]);

	const handleNewNote = useCallback(() => {
		dismissRecording();
		setVideoNoteText("");
		setVideoNoteSaved(false);
		speech.clearTranscript();
	}, [dismissRecording, speech]);

	const handleDiscardVideoNote = useCallback(() => {
		dismissRecording();
		setVideoNoteText("");
		setVideoNoteSaved(false);
		speech.clearTranscript();
		if (wasTaggingBeforeRecordingRef.current) {
			wasTaggingBeforeRecordingRef.current = false;
			startTagging();
		}
	}, [dismissRecording, speech, startTagging]);

	const hasVideoRecording =
		recordingState.recordingState === "stopped" ||
		recordingState.recordingState === "recording";

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<View style={styles.headerRow}>
				<View style={styles.headerLeft}>
					<ModeHeader title="Notes" subtitle="Make a video or photo note" />
				</View>
				{isRecording || speech.isListening ? (
					<RecordingIndicator label="" />
				) : null}
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
			</View>

			{activeTab === "video" ? (
				<>
					<View style={styles.row}>
						<View style={styles.previewColumn}>
							<View style={styles.placeholder}>
								<Text style={styles.placeholderText}>
									{isRecording ? "Recording..." : "Video preview"}
								</Text>
							</View>
						</View>

						<View style={styles.buttonsColumn}>
							<ActionButton
								label={isRecording ? "Stop" : "Record note"}
								onPress={handleRecordNote}
								variant={isRecording ? "danger" : "secondary"}
							/>
							<View style={styles.saveRow}>
								{videoNoteSaved ? (
									<ActionButton
										label="New note"
										onPress={handleNewNote}
										variant="secondary"
										style={styles.saveButton}
									/>
								) : (
									<ActionButton
										label="Save"
										onPress={handleSaveVideoNote}
										variant="secondary"
										disabled={!hasVideoRecording || isRecording}
										style={styles.saveButton}
									/>
								)}
								<Pressable
									style={styles.trashButton}
									onPress={handleDiscardVideoNote}
								>
									<Text style={styles.trashIcon}>🗑</Text>
								</Pressable>
							</View>
						</View>
					</View>

					<View style={styles.noteSection}>
						<Text style={styles.noteLabel}>Your note</Text>
						<TextInput
							style={styles.noteInput}
							value={videoNoteText}
							onChangeText={setVideoNoteText}
							placeholder="Transcribing . . ."
							placeholderTextColor={COLORS.textMuted}
							multiline
							textAlignVertical="top"
						/>
					</View>
				</>
			) : (
				<TaggingMode
					isActive={isTaggingActive}
					transcript={taggingTranscript}
					images={taggingImages}
					isSaving={isTaggingSaving}
					error={taggingError}
					statusMessage={taggingStatus}
					isGlassesCameraReady={taggingCameraReady}
					isGlassesCapturing={taggingCameraCapturing}
					onStartTagging={startTagging}
					onCancelTagging={cancelTagging}
					onSaveTagging={saveTaggingSession}
					onCaptureFromGlasses={captureFromGlasses}
					onCaptureFromPhone={captureFromPhone}
					onPickFromGallery={pickFromGallery}
					onRemoveImage={removeTaggingImage}
					onEditTranscript={editTranscript}
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
		marginBottom: 8,
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
	},
	tabButton: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		backgroundColor: COLORS.secondary,
	},
	tabButtonActive: {
		backgroundColor: COLORS.primary,
	},
	tabButtonText: {
		color: COLORS.textSecondary,
		fontSize: 14,
		fontWeight: "600",
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
	},
	buttonsColumn: {
		flex: 2,
		gap: 12,
	},
	placeholder: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		padding: 32,
		alignItems: "center",
		justifyContent: "center",
		marginVertical: 8,
		borderWidth: 1,
		borderColor: COLORS.input,
		borderStyle: "dashed",
		minHeight: 160,
	},
	placeholderText: {
		color: COLORS.textMuted,
		fontSize: 14,
	},
	saveRow: {
		flexDirection: "row",
		gap: 8,
	},
	saveButton: {
		flex: 1,
	},
	trashButton: {
		backgroundColor: COLORS.secondary,
		borderRadius: 6,
		paddingHorizontal: 12,
		paddingVertical: 12,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	trashIcon: {
		fontSize: 18,
	},
	noteSection: {
		marginTop: 16,
	},
	noteLabel: {
		fontSize: 16,
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
		fontSize: 15,
		lineHeight: 22,
		minHeight: 120,
	},
});
