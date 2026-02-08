import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Image,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { QualitySelector } from "../../src/components/QualitySelector";
import { TaggingMode } from "../../src/components/TaggingMode";
import { TimePicker } from "../../src/components/TimePicker";
import { useGlassesCamera } from "../../src/hooks/useGlassesCamera";
import { useParkingTimer } from "../../src/hooks/useParkingTimer";
import { useRemoteView } from "../../src/hooks/useRemoteView";
import { useSpeechRecognition } from "../../src/hooks/useSpeechRecognition";
import { useTaggingSession } from "../../src/hooks/useTaggingSession";
import { useVideoRecording } from "../../src/hooks/useVideoRecording";
import { useXRGlasses } from "../../src/hooks/useXRGlasses";
import { sendImage, sendText } from "../../src/services";
import logger from "../../src/utils/logger";

const TAG = "GlassesDashboard";

/**
 * Simplified Glasses Dashboard
 *
 * Core features only:
 * - Capture Audio (with transcript display)
 * - Capture Image (with preview)
 * - Send to AI buttons
 * - Disconnect
 */
export default function GlassesDashboard() {
	const router = useRouter();
	const { connected, emulationMode, disconnect, refreshKey } = useXRGlasses();
	const initialRefreshKey = useRef(refreshKey);

	const {
		isListening,
		transcript,
		partialTranscript,
		error: speechError,
		startListening,
		stopListening,
	} = useSpeechRecognition();

	const {
		isReady: cameraReady,
		isCapturing,
		lastImage,
		lastImageSize,
		error: cameraError,
		isEmulated: cameraEmulated,
		initializeCamera,
		captureImage,
		releaseCamera,
	} = useGlassesCamera();

	const {
		isStreaming,
		viewerUrl,
		viewerCount,
		selectedQuality,
		error: streamError,
		loading: streamLoading,
		cameraSource,
		isDemoMode: streamDemoMode,
		startStream,
		stopStream,
		setQuality,
		shareLink,
	} = useRemoteView();

	const {
		isActive: timerActive,
		formattedTime,
		durationMinutes: timerDuration,
		warningShown: timerWarning,
		expired: timerExpired,
		loading: timerLoading,
		error: timerError,
		startTimer,
		cancelTimer,
		stopAlarm,
	} = useParkingTimer();

	// Tagging session hook
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

	// Video recording hook
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

	// Handle record press - auto-stops tagging if active
	const handleRecordPress = useCallback(async () => {
		if (isRecording) {
			await stopRecording();
			// Restore tagging if it was active before recording
			if (wasTaggingBeforeRecordingRef.current) {
				wasTaggingBeforeRecordingRef.current = false;
				startTagging();
			}
		} else {
			// Save tagging state and stop it
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

	// Handle dismiss - restore tagging if needed
	const handleDismissRecording = useCallback(() => {
		dismissRecording();
		if (wasTaggingBeforeRecordingRef.current) {
			wasTaggingBeforeRecordingRef.current = false;
			startTagging();
		}
	}, [dismissRecording, startTagging]);

	// Format duration for display
	const formatDuration = (ms: number): string => {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	};

	const [isSendingAudio, setIsSendingAudio] = useState(false);
	const [isSendingImage, setIsSendingImage] = useState(false);
	const [aiResponse, setAiResponse] = useState("");
	const [aiError, setAiError] = useState<string | null>(null);
	const [copiedUrl, setCopiedUrl] = useState(false);

	// Track whether a UI refresh is pending but deferred due to active operations
	const pendingRefreshRef = useRef(false);

	// Check if any operation is active that would be disrupted by a page refresh
	const hasActiveOperation =
		isStreaming ||
		isRecording ||
		recordingState.recordingState === "stopped" ||
		recordingState.transcriptionState === "loading" ||
		isTaggingActive ||
		isTaggingSaving;

	// When refreshKey changes (after XR SDK corrupts RN UI), do a navigation refresh.
	// Deferred if any operation (streaming, recording, tagging) is active.
	useEffect(() => {
		if (refreshKey > initialRefreshKey.current) {
			if (hasActiveOperation) {
				logger.debug(TAG, "UI refresh deferred - operation in progress");
				pendingRefreshRef.current = true;
			} else {
				logger.debug(TAG, "UI refresh triggered, doing navigation refresh");
				pendingRefreshRef.current = false;
				router.replace("/glasses");
			}
		}
	}, [refreshKey, router, hasActiveOperation]);

	// Apply deferred refresh when all operations complete
	useEffect(() => {
		if (pendingRefreshRef.current && !hasActiveOperation) {
			logger.debug(TAG, "Applying deferred UI refresh");
			pendingRefreshRef.current = false;
			router.replace("/glasses");
		}
	}, [hasActiveOperation, router]);

	// Share link — on web, copies to clipboard and shows feedback
	const handleShareLink = useCallback(async () => {
		await shareLink();
		if (Platform.OS === "web") {
			setCopiedUrl(true);
			setTimeout(() => setCopiedUrl(false), 2000);
		}
	}, [shareLink]);

	// Copy URL to clipboard
	const handleCopyUrl = useCallback(async () => {
		if (!viewerUrl) return;
		try {
			await Clipboard.setStringAsync(viewerUrl);
			setCopiedUrl(true);
			setTimeout(() => setCopiedUrl(false), 2000);
		} catch (error) {
			logger.error(TAG, "Failed to copy URL:", error);
		}
	}, [viewerUrl]);

	// Cleanup camera on unmount
	useEffect(() => {
		return () => {
			if (cameraReady) {
				releaseCamera();
			}
		};
	}, [cameraReady, releaseCamera]);

	// Process speech results for tagging keyword detection
	useEffect(() => {
		// Only process final transcript (not partial)
		if (!transcript) return;

		// Avoid processing the same transcript multiple times
		if (transcript === lastProcessedTranscriptRef.current) return;
		lastProcessedTranscriptRef.current = transcript;

		// Pass to tagging processor for keyword detection
		processSpeechResult(transcript);
	}, [transcript, processSpeechResult]);

	// Toggle audio capture
	const handleAudioPress = useCallback(async () => {
		if (isListening) {
			await stopListening();
		} else {
			await startListening(true);
		}
	}, [isListening, startListening, stopListening]);

	// Initialize camera or capture image
	const handleImagePress = useCallback(async () => {
		if (!cameraReady) {
			await initializeCamera(false);
		} else {
			await captureImage();
		}
	}, [cameraReady, initializeCamera, captureImage]);

	// Send audio transcript to AI
	const handleSendAudio = useCallback(async () => {
		if (!transcript) return;
		setIsSendingAudio(true);
		setAiResponse("");
		setAiError(null);
		try {
			logger.debug(TAG, "Sending transcript to AI:", transcript);
			await sendText(transcript, {
				onChunk: (chunk) => {
					setAiResponse((prev) => prev + chunk);
				},
				onComplete: (fullResponse) => {
					logger.debug(
						TAG,
						"AI response complete:",
						fullResponse.length,
						"chars",
					);
				},
				onError: (error) => {
					setAiError(error.message);
				},
			});
		} catch (error) {
			logger.error(TAG, "Error:", error);
			setAiError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsSendingAudio(false);
		}
	}, [transcript]);

	// Send image to AI
	const handleSendImage = useCallback(async () => {
		if (!lastImage) return;
		setIsSendingImage(true);
		setAiResponse("");
		setAiError(null);
		try {
			logger.debug(TAG, "Sending image to AI:", lastImageSize);
			await sendImage(lastImage, {
				onChunk: (chunk) => {
					setAiResponse((prev) => prev + chunk);
				},
				onComplete: (fullResponse) => {
					logger.debug(
						TAG,
						"AI response complete:",
						fullResponse.length,
						"chars",
					);
				},
				onError: (error) => {
					setAiError(error.message);
				},
			});
		} catch (error) {
			logger.error(TAG, "Error:", error);
			setAiError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsSendingImage(false);
		}
	}, [lastImage, lastImageSize]);

	// Disconnect and go home
	const handleDisconnect = async () => {
		if (isStreaming) {
			await stopStream();
		}
		if (cameraReady) {
			await releaseCamera();
		}
		await disconnect();
		router.replace("/");
	};

	// Not connected - show message
	if (!connected) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.center}>
					<Text style={styles.title}>Not Connected</Text>
					<Pressable style={styles.button} onPress={() => router.replace("/")}>
						<Text style={styles.buttonText}>Go to Connect</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	const displayTranscript = partialTranscript || transcript || "";

	return (
		<SafeAreaView style={styles.container}>
			<View
				style={Platform.OS === "web" ? styles.webWrapper : styles.nativeWrapper}
			>
				<ScrollView
					style={styles.scroll}
					contentContainerStyle={styles.scrollContent}
				>
					{/* Header */}
					<Text style={styles.header}>Glasses Dashboard</Text>
					{emulationMode && <Text style={styles.badge}>EMULATION MODE</Text>}

					{/* Audio Section */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Audio Capture</Text>

						<Pressable
							style={[
								styles.captureButton,
								isListening && styles.captureButtonActive,
							]}
							onPress={handleAudioPress}
						>
							<Text style={styles.captureButtonText}>
								{isListening ? "STOP" : "RECORD"}
							</Text>
						</Pressable>

						{displayTranscript ? (
							<View style={styles.resultBox}>
								<Text style={styles.resultLabel}>Transcript:</Text>
								<Text style={styles.resultText}>{displayTranscript}</Text>
							</View>
						) : null}

						{transcript ? (
							<Pressable
								style={[
									styles.sendButton,
									isSendingAudio && styles.sendButtonDisabled,
								]}
								onPress={handleSendAudio}
								disabled={isSendingAudio}
							>
								<Text style={styles.sendButtonText}>
									{isSendingAudio ? "Sending..." : "Send Audio to AI"}
								</Text>
							</Pressable>
						) : null}

						{speechError ? (
							<Text style={styles.error}>{speechError}</Text>
						) : null}
					</View>

					{/* Tagging Section */}
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

					{/* Image Section */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Image Capture</Text>

						<Pressable
							style={[
								styles.captureButton,
								styles.captureButtonGreen,
								cameraReady && styles.captureButtonActive,
							]}
							onPress={handleImagePress}
							disabled={isCapturing}
						>
							<Text style={styles.captureButtonText}>
								{isCapturing
									? "CAPTURING..."
									: cameraReady
										? "CAPTURE"
										: "ENABLE CAM"}
							</Text>
						</Pressable>

						{cameraReady && (
							<Pressable style={styles.releaseButton} onPress={releaseCamera}>
								<Text style={styles.releaseButtonText}>Release Camera</Text>
							</Pressable>
						)}

						{lastImage && lastImageSize ? (
							<View style={styles.imageContainer}>
								<Text style={styles.imageInfo}>
									{lastImageSize.width}x{lastImageSize.height}
								</Text>
								<Image
									source={{ uri: `data:image/jpeg;base64,${lastImage}` }}
									style={styles.imagePreview}
									resizeMode="contain"
								/>
								<Pressable
									style={[
										styles.sendButton,
										styles.sendButtonGreen,
										isSendingImage && styles.sendButtonDisabled,
									]}
									onPress={handleSendImage}
									disabled={isSendingImage}
								>
									<Text style={styles.sendButtonText}>
										{isSendingImage ? "Sending..." : "Send Image to AI"}
									</Text>
								</Pressable>
							</View>
						) : null}

						{cameraError ? (
							<Text style={styles.error}>{cameraError}</Text>
						) : null}
					</View>

					{/* Video Recording Section */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Video Recording</Text>

						{/* Camera Source Toggle */}
						{canRecord && (
							<View style={styles.cameraSourceToggle}>
								<Text style={styles.cameraSourceToggleLabel}>Camera:</Text>
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
									styles.captureButton,
									isRecording
										? styles.recordButtonRecording
										: styles.recordButtonIdle,
								]}
								onPress={handleRecordPress}
							>
								<Text style={styles.captureButtonText}>
									{isRecording ? "STOP" : "RECORD"}
								</Text>
							</Pressable>
						)}

						{/* Recording in progress */}
						{isRecording && (
							<View style={styles.recordingIndicator}>
								<View style={styles.recordingDot} />
								<Text style={styles.recordingText}>
									Recording... {formatDuration(recordingState.durationMs)}
								</Text>
							</View>
						)}

						{/* Tagging disabled notice */}
						{isRecording && (
							<Text style={styles.mutualExclusionNotice}>
								Tagging paused during recording
							</Text>
						)}

						{/* After recording - actions */}
						{recordingState.recordingState === "stopped" && (
							<View style={styles.recordingActions}>
								<Text style={styles.recordingCompleteText}>
									Recording complete (
									{formatDuration(recordingState.durationMs)})
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
												styles.sendButtonDisabled,
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
									style={styles.recordingDiscardButton}
									onPress={handleDismissRecording}
								>
									<Text style={styles.recordingDiscardButtonText}>Discard</Text>
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
											{recordingState.transcriptionResult.segments.map(
												(seg) => (
													<View
														key={`${seg.speaker}-${seg.start}-${seg.end}`}
														style={styles.transcriptionSegment}
													>
														<Text style={styles.transcriptionSpeaker}>
															{seg.speaker}
														</Text>
														<Text style={styles.transcriptionText}>
															{seg.text}
														</Text>
														<Text style={styles.transcriptionTime}>
															{formatDuration(seg.start * 1000)} -{" "}
															{formatDuration(seg.end * 1000)}
														</Text>
													</View>
												),
											)}
										</ScrollView>
									</View>
									<Pressable
										style={({ pressed }) => [
											styles.recordingActionButton,
											{ marginTop: 12, opacity: pressed ? 0.7 : 1 },
										]}
										onPress={downloadTranscript}
										android_ripple={{ color: "rgba(255,255,255,0.2)" }}
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

					{/* Remote View Section */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Remote View</Text>

						{!isStreaming ? (
							<>
								<QualitySelector
									value={selectedQuality}
									onChange={setQuality}
									disabled={streamLoading}
								/>
								<Pressable
									style={[
										styles.captureButton,
										styles.captureButtonPurple,
										streamLoading && styles.captureButtonActive,
									]}
									onPress={startStream}
									disabled={streamLoading}
								>
									<Text style={styles.captureButtonText}>
										{streamLoading ? "STARTING..." : "START STREAM"}
									</Text>
								</Pressable>
							</>
						) : (
							<>
								<View style={styles.streamInfo}>
									<Text style={styles.streamLabel}>Viewers</Text>
									<Text style={styles.viewerCount}>{viewerCount}</Text>
								</View>

								{/* Camera Source Label */}
								{cameraSource && (
									<View
										style={[
											styles.cameraSourceBox,
											streamDemoMode && styles.cameraSourceBoxEmulation,
										]}
									>
										<Text style={styles.cameraSourceLabel}>Camera Source:</Text>
										<Text
											style={[
												styles.cameraSourceText,
												streamDemoMode && styles.cameraSourceTextEmulation,
											]}
										>
											{cameraSource}
										</Text>
									</View>
								)}

								{viewerUrl && (
									<View style={styles.resultBox}>
										<Text style={styles.resultLabel}>Viewer Link:</Text>
										<View style={styles.urlRow}>
											<Text style={styles.linkText} numberOfLines={1}>
												{viewerUrl}
											</Text>
											<Pressable
												style={styles.copyButton}
												onPress={handleCopyUrl}
											>
												<Text style={styles.copyButtonText}>
													{copiedUrl ? "✓" : "Copy"}
												</Text>
											</Pressable>
										</View>
									</View>
								)}

								<View style={styles.streamButtons}>
									<Pressable
										style={styles.shareButton}
										onPress={handleShareLink}
									>
										<Text style={styles.shareButtonText}>
											{copiedUrl ? "Copied!" : "Share Link"}
										</Text>
									</Pressable>

									<Pressable
										style={[
											styles.stopButton,
											streamLoading && styles.sendButtonDisabled,
										]}
										onPress={stopStream}
										disabled={streamLoading}
									>
										<Text style={styles.stopButtonText}>
											{streamLoading ? "STOPPING..." : "STOP"}
										</Text>
									</Pressable>
								</View>
							</>
						)}

						{streamError ? (
							<Text style={styles.error}>{streamError}</Text>
						) : null}
					</View>

					{/* Parking Timer Section */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Parking Timer</Text>

						{timerExpired ? (
							// Timer expired - show alarm state
							<View style={styles.timerExpiredContainer}>
								<Text style={styles.timerExpiredText}>TIME'S UP!</Text>
								<Text style={styles.timerExpiredSubtext}>Move your car!</Text>
								<Pressable style={styles.stopAlarmButton} onPress={stopAlarm}>
									<Text style={styles.stopAlarmButtonText}>STOP ALARM</Text>
								</Pressable>
							</View>
						) : timerActive ? (
							// Timer running - show countdown
							<View style={styles.timerActiveContainer}>
								<Text
									style={[
										styles.timerCountdown,
										timerWarning && styles.timerCountdownWarning,
									]}
								>
									{formattedTime}
								</Text>
								{timerWarning && (
									<Text style={styles.timerWarningText}>
										5 minutes remaining!
									</Text>
								)}
								<Text style={styles.timerDurationText}>
									{timerDuration} min timer
								</Text>
								<Pressable
									style={[
										styles.cancelTimerButton,
										timerLoading && styles.sendButtonDisabled,
									]}
									onPress={cancelTimer}
									disabled={timerLoading}
								>
									<Text style={styles.cancelTimerButtonText}>
										{timerLoading ? "Cancelling..." : "Cancel Timer"}
									</Text>
								</Pressable>
							</View>
						) : (
							// No timer - show time picker
							<TimePicker
								initialHours={1}
								initialMinutes={0}
								maxHours={4}
								onConfirm={startTimer}
								disabled={timerLoading}
							/>
						)}

						{timerError ? <Text style={styles.error}>{timerError}</Text> : null}
					</View>

					{/* AI Response Section */}
					{aiResponse || aiError || isSendingAudio || isSendingImage ? (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>AI Response</Text>
							{aiError ? (
								<Text style={styles.error}>{aiError}</Text>
							) : aiResponse ? (
								<View style={styles.resultBox}>
									<Text style={styles.resultText}>{aiResponse}</Text>
								</View>
							) : (
								<Text style={styles.loadingText}>Waiting for response...</Text>
							)}
							{aiResponse ? (
								<Pressable
									style={styles.clearButton}
									onPress={() => {
										setAiResponse("");
										setAiError(null);
									}}
								>
									<Text style={styles.clearButtonText}>Clear Response</Text>
								</Pressable>
							) : null}
						</View>
					) : null}

					{/* Disconnect */}
					<Pressable style={styles.disconnectButton} onPress={handleDisconnect}>
						<Text style={styles.disconnectText}>Disconnect</Text>
					</Pressable>
				</ScrollView>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#111",
	},
	center: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	webWrapper: {
		flex: 1,
		maxWidth: 480,
		width: "100%",
		alignSelf: "center",
	},
	nativeWrapper: {
		flex: 1,
	},
	scroll: {
		flex: 1,
	},
	scrollContent: {
		padding: 20,
	},
	header: {
		fontSize: 24,
		fontWeight: "bold",
		color: "#fff",
		marginBottom: 8,
	},
	badge: {
		color: "#ffd700",
		fontSize: 12,
		marginBottom: 20,
	},
	title: {
		fontSize: 20,
		color: "#fff",
		marginBottom: 20,
	},
	section: {
		backgroundColor: "#222",
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "#fff",
		marginBottom: 12,
	},
	captureButton: {
		backgroundColor: "#c44",
		borderRadius: 8,
		padding: 16,
		alignItems: "center",
	},
	captureButtonGreen: {
		backgroundColor: "#2a5a2a",
	},
	captureButtonPurple: {
		backgroundColor: "#5a2a8a",
	},
	captureButtonActive: {
		backgroundColor: "#a33",
	},
	captureButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "bold",
	},
	resultBox: {
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 12,
		marginTop: 12,
	},
	resultLabel: {
		color: "#888",
		fontSize: 12,
		marginBottom: 4,
	},
	resultText: {
		color: "#fff",
		fontSize: 16,
	},
	sendButton: {
		backgroundColor: "#07f",
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
		marginTop: 12,
	},
	sendButtonGreen: {
		backgroundColor: "#2a7a2a",
	},
	sendButtonDisabled: {
		opacity: 0.5,
	},
	sendButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	releaseButton: {
		backgroundColor: "#444",
		borderRadius: 8,
		padding: 10,
		alignItems: "center",
		marginTop: 8,
	},
	releaseButtonText: {
		color: "#aaa",
		fontSize: 14,
	},
	imageContainer: {
		marginTop: 12,
	},
	imageInfo: {
		color: "#888",
		fontSize: 12,
		marginBottom: 8,
	},
	imagePreview: {
		width: "100%",
		height: 200,
		borderRadius: 8,
		backgroundColor: "#000",
	},
	error: {
		color: "#f66",
		fontSize: 13,
		marginTop: 8,
	},
	loadingText: {
		color: "#888",
		fontSize: 14,
		fontStyle: "italic",
	},
	clearButton: {
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 10,
		alignItems: "center",
		marginTop: 12,
	},
	clearButtonText: {
		color: "#aaa",
		fontSize: 14,
	},
	disconnectButton: {
		backgroundColor: "transparent",
		borderWidth: 1,
		borderColor: "#a33",
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
		marginTop: 8,
	},
	disconnectText: {
		color: "#f66",
		fontSize: 16,
	},
	button: {
		backgroundColor: "#07f",
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
	},
	buttonText: {
		color: "#fff",
		fontSize: 16,
	},
	// Remote View styles
	streamInfo: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 12,
		marginBottom: 12,
	},
	streamLabel: {
		color: "#888",
		fontSize: 14,
	},
	viewerCount: {
		color: "#4af",
		fontSize: 24,
		fontWeight: "bold",
	},
	linkText: {
		color: "#4af",
		fontSize: 14,
		fontFamily: "monospace",
		flex: 1,
	},
	urlRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	copyButton: {
		backgroundColor: "#444",
		borderRadius: 6,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	copyButtonText: {
		color: "#fff",
		fontSize: 13,
		fontWeight: "600",
	},
	streamButtons: {
		flexDirection: "row",
		gap: 12,
		marginTop: 12,
	},
	shareButton: {
		flex: 1,
		backgroundColor: "#2a7a2a",
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
	},
	shareButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	stopButton: {
		flex: 1,
		backgroundColor: "#a33",
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
	},
	stopButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "bold",
	},
	// Camera source styles
	cameraSourceBox: {
		backgroundColor: "#1a3a1a",
		borderRadius: 8,
		padding: 10,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: "#2a5a2a",
	},
	cameraSourceBoxEmulation: {
		backgroundColor: "#3a3a1a",
		borderColor: "#8a8a2a",
	},
	cameraSourceLabel: {
		color: "#888",
		fontSize: 11,
		marginBottom: 2,
	},
	cameraSourceText: {
		color: "#4a4",
		fontSize: 13,
		fontWeight: "600",
	},
	cameraSourceTextEmulation: {
		color: "#cc4",
	},
	// Parking Timer styles
	timerExpiredContainer: {
		alignItems: "center",
		padding: 16,
		backgroundColor: "#4a1a1a",
		borderRadius: 12,
		borderWidth: 2,
		borderColor: "#f44",
	},
	timerExpiredText: {
		fontSize: 28,
		fontWeight: "bold",
		color: "#f44",
		marginBottom: 4,
	},
	timerExpiredSubtext: {
		fontSize: 16,
		color: "#faa",
		marginBottom: 16,
	},
	stopAlarmButton: {
		backgroundColor: "#f44",
		borderRadius: 8,
		paddingVertical: 14,
		paddingHorizontal: 32,
	},
	stopAlarmButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "bold",
	},
	timerActiveContainer: {
		alignItems: "center",
		padding: 16,
	},
	timerCountdown: {
		fontSize: 48,
		fontWeight: "bold",
		color: "#4af",
		fontFamily: "monospace",
	},
	timerCountdownWarning: {
		color: "#fa4",
	},
	timerWarningText: {
		fontSize: 14,
		color: "#fa4",
		fontWeight: "600",
		marginTop: 4,
	},
	timerDurationText: {
		fontSize: 13,
		color: "#888",
		marginTop: 8,
		marginBottom: 16,
	},
	cancelTimerButton: {
		backgroundColor: "#444",
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 24,
	},
	cancelTimerButtonText: {
		color: "#aaa",
		fontSize: 14,
	},
	// Video Recording styles
	cameraSourceToggle: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
		gap: 12,
	},
	cameraSourceToggleLabel: {
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
	recordButtonIdle: {
		backgroundColor: "#c44",
	},
	recordButtonRecording: {
		backgroundColor: "#a33",
	},
	recordingIndicator: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 12,
		gap: 8,
	},
	recordingDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		backgroundColor: "#f44",
	},
	recordingText: {
		color: "#f88",
		fontSize: 16,
		fontWeight: "600",
		fontFamily: "monospace",
	},
	mutualExclusionNotice: {
		color: "#888",
		fontSize: 12,
		fontStyle: "italic",
		marginTop: 8,
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
	recordingDiscardButton: {
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 10,
		alignItems: "center",
		marginTop: 8,
	},
	recordingDiscardButtonText: {
		color: "#a88",
		fontSize: 13,
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
});
