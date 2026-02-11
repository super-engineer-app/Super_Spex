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

	// Photo mode audio recording state
	const [isPhotoAudioRecording, setIsPhotoAudioRecording] = useState(false);

	// Process speech results for tagging keyword detection
	useEffect(() => {
		if (!speech.transcript) return;
		if (speech.transcript === lastProcessedTranscriptRef.current) return;
		lastProcessedTranscriptRef.current = speech.transcript;

		if (activeTab === "photo") {
			// In photo mode, append speech to tagging transcript
			editTranscript(
				taggingTranscript
					? `${taggingTranscript} ${speech.transcript}`
					: speech.transcript,
			);
		} else {
			processSpeechResult(speech.transcript);
		}
	}, [
		speech.transcript,
		processSpeechResult,
		activeTab,
		editTranscript,
		taggingTranscript,
	]);

	// Live transcription: populate video note text while recording
	useEffect(() => {
		if (activeTab !== "video") return;
		const transcript = speech.partialTranscript || speech.transcript || "";
		if (transcript && isRecording) {
			setVideoNoteText(transcript);
		}
	}, [speech.partialTranscript, speech.transcript, isRecording, activeTab]);

	// Photo mode: update transcript with partial speech results in real-time
	useEffect(() => {
		if (activeTab !== "photo" || !isPhotoAudioRecording) return;
		const partial = speech.partialTranscript;
		if (partial) {
			// Show partial as preview in transcript field
			const base = taggingTranscript || "";
			editTranscript(base ? `${base} ${partial}` : partial);
		}
	}, [
		speech.partialTranscript,
		activeTab,
		isPhotoAudioRecording,
		editTranscript,
		taggingTranscript,
	]);

	const handleRecordNote = useCallback(async () => {
		if (isRecording) {
			await stopRecording();
			await speech.stopListening();
		} else {
			setVideoNoteSaved(false);
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
			await speech.startListening(true);
			setIsPhotoAudioRecording(true);
		}
	}, [isPhotoAudioRecording, speech]);

	const handleSaveVideoNote = useCallback(async () => {
		await saveVideo();
		setVideoNoteSaved(true);
	}, [saveVideo]);

	const handleClearVideoNote = useCallback(() => {
		dismissRecording();
		setVideoNoteText("");
		setVideoNoteSaved(false);
		speech.clearTranscript();
	}, [dismissRecording, speech]);

	const isStopped = recordingState.recordingState === "stopped";
	const hasVideoContent = isStopped || videoNoteText.trim();
	const playbackUrl = isStopped ? (recordingState.fileUri ?? null) : null;

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<View style={styles.headerRow}>
				<View style={styles.headerLeft}>
					<ModeHeader title="Notes" subtitle="Make a video or photo note" />
				</View>
				{isRecording || isPhotoAudioRecording || speech.isListening ? (
					<RecordingIndicator label="" />
				) : null}
			</View>

			<View style={styles.toggleRow}>
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
							<LiveCameraPreview active playbackUrl={playbackUrl} />
						</View>

						<View style={styles.buttonsColumn}>
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
	toggleRow: {
		marginBottom: 12,
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
		paddingVertical: 12,
		backgroundColor: COLORS.secondary,
	},
	tabButtonActive: {
		backgroundColor: COLORS.primary,
	},
	tabButtonText: {
		color: COLORS.textSecondary,
		fontSize: 16,
		fontWeight: "600",
	},
	tabButtonTextActive: {
		color: COLORS.primaryForeground,
	},
	row: {
		flexDirection: "row",
		gap: 16,
		alignItems: "center",
	},
	previewColumn: {
		flex: 1,
	},
	buttonsColumn: {
		flex: 1,
		gap: 12,
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
