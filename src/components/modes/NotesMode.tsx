import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTaggingSession } from "../../hooks/useTaggingSession";
import { useVideoRecording } from "../../hooks/useVideoRecording";
import { useDashboard } from "../dashboard/DashboardContext";
import { ModeHeader } from "../shared/ModeHeader";
import { RecordingIndicator } from "../shared/RecordingIndicator";
import { TaggingMode } from "../TaggingMode";

type NotesTab = "photo" | "video";

export function NotesMode() {
	const { speech } = useDashboard();
	const [activeTab, setActiveTab] = useState<NotesTab>("photo");

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
		setCameraSource: setRecordingCameraSource,
		startRecording,
		stopRecording,
		transcribe,
		saveVideo,
		downloadTranscript,
		dismiss: dismissRecording,
		isRecording,
		canRecord,
	} = useVideoRecording();

	// Track last processed transcript to avoid duplicates
	const lastProcessedTranscriptRef = useRef<string>("");

	// Track if tagging was active before recording for auto-resume
	const wasTaggingBeforeRecordingRef = useRef(false);

	// Process speech results for tagging keyword detection
	useEffect(() => {
		if (!speech.transcript) return;
		if (speech.transcript === lastProcessedTranscriptRef.current) return;
		lastProcessedTranscriptRef.current = speech.transcript;
		processSpeechResult(speech.transcript);
	}, [speech.transcript, processSpeechResult]);

	const handleRecordPress = useCallback(async () => {
		if (isRecording) {
			await stopRecording();
			if (wasTaggingBeforeRecordingRef.current) {
				wasTaggingBeforeRecordingRef.current = false;
				startTagging();
			}
		} else {
			if (isTaggingActive) {
				wasTaggingBeforeRecordingRef.current = true;
				cancelTagging();
			}
			await startRecording();
		}
	}, [
		isRecording,
		stopRecording,
		startRecording,
		isTaggingActive,
		cancelTagging,
		startTagging,
	]);

	const handleDismissRecording = useCallback(() => {
		dismissRecording();
		if (wasTaggingBeforeRecordingRef.current) {
			wasTaggingBeforeRecordingRef.current = false;
			startTagging();
		}
	}, [dismissRecording, startTagging]);

	const formatDuration = (ms: number): string => {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	};

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<ModeHeader
				title="Notes"
				subtitle="Capture photos or video with voice notes"
			/>

			{/* Tab selector */}
			<View style={styles.tabs}>
				<Pressable
					style={[styles.tab, activeTab === "photo" && styles.tabActive]}
					onPress={() => setActiveTab("photo")}
				>
					<Text
						style={[
							styles.tabText,
							activeTab === "photo" && styles.tabTextActive,
						]}
					>
						Photo
					</Text>
				</Pressable>
				<Pressable
					style={[styles.tab, activeTab === "video" && styles.tabActive]}
					onPress={() => setActiveTab("video")}
				>
					<Text
						style={[
							styles.tabText,
							activeTab === "video" && styles.tabTextActive,
						]}
					>
						Video
					</Text>
				</Pressable>
			</View>

			{activeTab === "photo" ? (
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
			) : (
				<View style={styles.videoSection}>
					{/* Camera Source Toggle */}
					{canRecord && (
						<View style={styles.cameraSourceToggle}>
							<Text style={styles.cameraSourceLabel}>Camera:</Text>
							<View style={styles.segmentedControl}>
								<Pressable
									style={[
										styles.segmentButton,
										recordingState.cameraSource === "phone" &&
											styles.segmentButtonActive,
									]}
									onPress={() => setRecordingCameraSource("phone")}
								>
									<Text
										style={[
											styles.segmentButtonText,
											recordingState.cameraSource === "phone" &&
												styles.segmentButtonTextActive,
										]}
									>
										Phone
									</Text>
								</Pressable>
								<Pressable
									style={[
										styles.segmentButton,
										recordingState.cameraSource === "glasses" &&
											styles.segmentButtonActive,
									]}
									onPress={() => setRecordingCameraSource("glasses")}
								>
									<Text
										style={[
											styles.segmentButtonText,
											recordingState.cameraSource === "glasses" &&
												styles.segmentButtonTextActive,
										]}
									>
										Glasses
									</Text>
								</Pressable>
							</View>
						</View>
					)}

					{/* Record / Stop Button */}
					{(canRecord || isRecording) && (
						<Pressable
							style={[
								styles.recordButton,
								isRecording
									? styles.recordButtonRecording
									: styles.recordButtonIdle,
							]}
							onPress={handleRecordPress}
						>
							<Text style={styles.recordButtonText}>
								{isRecording ? "STOP" : "RECORD"}
							</Text>
						</Pressable>
					)}

					{isRecording && (
						<>
							<RecordingIndicator
								label={`Recording... ${formatDuration(recordingState.durationMs)}`}
							/>
							<Text style={styles.mutualExclusionNotice}>
								Tagging paused during recording
							</Text>
						</>
					)}

					{/* After recording - actions */}
					{recordingState.recordingState === "stopped" && (
						<View style={styles.recordingActions}>
							<Text style={styles.recordingCompleteText}>
								Recording complete ({formatDuration(recordingState.durationMs)})
							</Text>
							<View style={styles.recordingButtonRow}>
								<Pressable
									style={styles.recordingActionButton}
									onPress={saveVideo}
								>
									<Text style={styles.recordingActionButtonText}>
										Save Video
									</Text>
								</Pressable>
								<Pressable
									style={[
										styles.recordingActionButton,
										styles.recordingActionButtonTranscribe,
										recordingState.transcriptionState === "loading" &&
											styles.buttonDisabled,
									]}
									onPress={() => transcribe()}
									disabled={recordingState.transcriptionState === "loading"}
								>
									<Text style={styles.recordingActionButtonText}>
										{recordingState.transcriptionState === "loading"
											? "Transcribing..."
											: "Transcribe"}
									</Text>
								</Pressable>
							</View>
							<Pressable
								style={styles.discardButton}
								onPress={handleDismissRecording}
							>
								<Text style={styles.discardButtonText}>Discard</Text>
							</Pressable>
						</View>
					)}

					{/* Transcription Result */}
					{recordingState.transcriptionState === "done" &&
						recordingState.transcriptionResult && (
							<>
								<View style={styles.transcriptionResult}>
									<Text style={styles.transcriptionTitle}>Transcription</Text>
									<ScrollView
										style={styles.transcriptionScroll}
										nestedScrollEnabled
									>
										{recordingState.transcriptionResult.segments.map((seg) => (
											<View
												key={`${seg.speaker}-${seg.start}-${seg.end}`}
												style={styles.transcriptionSegment}
											>
												<Text style={styles.transcriptionSpeaker}>
													{seg.speaker}
												</Text>
												<Text style={styles.transcriptionText}>{seg.text}</Text>
												<Text style={styles.transcriptionTime}>
													{formatDuration(seg.start * 1000)} -{" "}
													{formatDuration(seg.end * 1000)}
												</Text>
											</View>
										))}
									</ScrollView>
								</View>
								<Pressable
									style={[styles.recordingActionButton, { marginTop: 12 }]}
									onPress={downloadTranscript}
								>
									<Text style={styles.recordingActionButtonText}>
										Save Transcript
									</Text>
								</Pressable>
							</>
						)}

					{/* Transcription Error */}
					{recordingState.transcriptionState === "error" && (
						<View style={styles.transcriptionError}>
							<Text style={styles.error}>
								{recordingState.transcriptionError ?? "Transcription failed"}
							</Text>
							<Pressable
								style={styles.recordingActionButton}
								onPress={() => transcribe()}
							>
								<Text style={styles.recordingActionButtonText}>Retry</Text>
							</Pressable>
						</View>
					)}

					{/* Stopping indicator */}
					{recordingState.recordingState === "stopping" && (
						<Text style={styles.loadingText}>Stopping recording...</Text>
					)}
				</View>
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
	tabs: {
		flexDirection: "row",
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#444",
		overflow: "hidden",
		marginBottom: 16,
	},
	tab: {
		flex: 1,
		paddingVertical: 10,
		alignItems: "center",
		backgroundColor: "#222",
	},
	tabActive: {
		backgroundColor: "#07f",
	},
	tabText: {
		color: "#888",
		fontSize: 15,
		fontWeight: "600",
	},
	tabTextActive: {
		color: "#fff",
	},
	videoSection: {
		backgroundColor: "#222",
		borderRadius: 12,
		padding: 16,
	},
	cameraSourceToggle: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
		gap: 12,
	},
	cameraSourceLabel: {
		color: "#888",
		fontSize: 14,
	},
	segmentedControl: {
		flexDirection: "row",
		flex: 1,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#444",
		overflow: "hidden",
	},
	segmentButton: {
		flex: 1,
		paddingVertical: 8,
		alignItems: "center",
		backgroundColor: "#333",
	},
	segmentButtonActive: {
		backgroundColor: "#07f",
	},
	segmentButtonText: {
		color: "#888",
		fontSize: 14,
		fontWeight: "600",
	},
	segmentButtonTextActive: {
		color: "#fff",
	},
	recordButton: {
		borderRadius: 8,
		padding: 16,
		alignItems: "center",
	},
	recordButtonIdle: {
		backgroundColor: "#c44",
	},
	recordButtonRecording: {
		backgroundColor: "#a33",
	},
	recordButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "bold",
	},
	mutualExclusionNotice: {
		color: "#888",
		fontSize: 12,
		fontStyle: "italic",
		marginTop: 4,
	},
	recordingActions: {
		marginTop: 12,
	},
	recordingCompleteText: {
		color: "#4a4",
		fontSize: 15,
		fontWeight: "600",
		marginBottom: 12,
	},
	recordingButtonRow: {
		flexDirection: "row",
		gap: 12,
	},
	recordingActionButton: {
		flex: 1,
		backgroundColor: "#2a5a2a",
		borderRadius: 8,
		padding: 12,
		alignItems: "center",
	},
	recordingActionButtonTranscribe: {
		backgroundColor: "#2a3a7a",
	},
	recordingActionButtonText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	discardButton: {
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 10,
		alignItems: "center",
		marginTop: 8,
	},
	discardButtonText: {
		color: "#a88",
		fontSize: 13,
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	transcriptionResult: {
		backgroundColor: "#1a1a2a",
		borderRadius: 8,
		padding: 12,
		marginTop: 12,
	},
	transcriptionTitle: {
		color: "#8af",
		fontSize: 14,
		fontWeight: "600",
		marginBottom: 8,
	},
	transcriptionScroll: {
		maxHeight: 200,
		marginBottom: 8,
	},
	transcriptionSegment: {
		paddingVertical: 6,
		borderBottomWidth: 1,
		borderBottomColor: "#2a2a3a",
	},
	transcriptionSpeaker: {
		color: "#8af",
		fontSize: 12,
		fontWeight: "600",
	},
	transcriptionText: {
		color: "#fff",
		fontSize: 14,
		marginTop: 2,
	},
	transcriptionTime: {
		color: "#666",
		fontSize: 11,
		marginTop: 2,
		fontFamily: "monospace",
	},
	transcriptionError: {
		marginTop: 12,
	},
	error: {
		color: "#f66",
		fontSize: 13,
		marginBottom: 8,
	},
	loadingText: {
		color: "#888",
		fontSize: 14,
		fontStyle: "italic",
		marginTop: 8,
	},
});
