import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { sendTextAndImage } from "../../services/backendApi";
import { COLORS } from "../../theme";
import logger from "../../utils/logger";
import { useDashboard } from "../dashboard/DashboardContext";
import { ActionButton } from "../shared/ActionButton";
import { AIResponseDisplay } from "../shared/AIResponseDisplay";
import { CameraPreview } from "../shared/CameraPreview";
import { ModeHeader } from "../shared/ModeHeader";
import { RecordingIndicator } from "../shared/RecordingIndicator";

const TAG = "HelpMode";

export function HelpMode() {
	const { camera, speech } = useDashboard();
	const [aiResponse, setAiResponse] = useState("");
	const [aiStatus, setAiStatus] = useState<string | null>(null);
	const [aiError, setAiError] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [hasPhoto, setHasPhoto] = useState(false);
	const [questionText, setQuestionText] = useState("");

	// Merge speech transcript into the editable text field
	useEffect(() => {
		const transcript = speech.partialTranscript || speech.transcript || "";
		if (transcript) {
			setQuestionText(transcript);
		}
	}, [speech.partialTranscript, speech.transcript]);

	// Auto-initialize camera on mode entry
	useEffect(() => {
		if (!camera.isReady) {
			camera.initializeCamera(false);
		}
	}, [camera]);

	const handleTakePhoto = useCallback(async () => {
		await camera.captureImage();
		setHasPhoto(true);
	}, [camera]);

	const handleTalkToMe = useCallback(async () => {
		if (speech.isListening) {
			await speech.stopListening();
		} else {
			await speech.startListening(true);
		}
	}, [speech]);

	const handleSubmit = useCallback(async () => {
		const text = questionText.trim();
		const image = camera.lastImage;
		if (!text && !image) return;

		setIsSending(true);
		setAiResponse("");
		setAiStatus(null);
		setAiError(null);

		try {
			logger.debug(TAG, "Sending text+image to AI");
			if (text && image) {
				await sendTextAndImage(text, image, {
					onChunk: (chunk) => {
						setAiStatus(null);
						setAiResponse((prev) => prev + chunk);
					},
					onStatus: (status) => setAiStatus(status),
					onComplete: (fullResponse) => {
						setAiStatus(null);
						logger.debug(
							TAG,
							"AI response complete:",
							fullResponse.length,
							"chars",
						);
					},
					onError: (error) => {
						setAiStatus(null);
						setAiError(error.message);
					},
				});
			} else if (text) {
				const { sendText } = await import("../../services/backendApi");
				await sendText(text, {
					onChunk: (chunk) => {
						setAiStatus(null);
						setAiResponse((prev) => prev + chunk);
					},
					onStatus: (status) => setAiStatus(status),
					onComplete: (fullResponse) => {
						setAiStatus(null);
						logger.debug(
							TAG,
							"AI response complete:",
							fullResponse.length,
							"chars",
						);
					},
					onError: (error) => {
						setAiStatus(null);
						setAiError(error.message);
					},
				});
			} else if (image) {
				const { sendImage } = await import("../../services/backendApi");
				await sendImage(image, {
					onChunk: (chunk) => {
						setAiStatus(null);
						setAiResponse((prev) => prev + chunk);
					},
					onStatus: (status) => setAiStatus(status),
					onComplete: (fullResponse) => {
						setAiStatus(null);
						logger.debug(
							TAG,
							"AI response complete:",
							fullResponse.length,
							"chars",
						);
					},
					onError: (error) => {
						setAiStatus(null);
						setAiError(error.message);
					},
				});
			}
		} catch (error) {
			logger.error(TAG, "Error:", error);
			setAiError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsSending(false);
		}
	}, [questionText, camera.lastImage]);

	const handleReset = useCallback(() => {
		setAiResponse("");
		setAiStatus(null);
		setAiError(null);
		setHasPhoto(false);
		setQuestionText("");
		camera.clearImage();
		speech.clearTranscript();
	}, [camera, speech]);

	const hasContent = questionText.trim() || camera.lastImage;
	const hasResponse = aiResponse || aiError || aiStatus || isSending;

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<View style={styles.headerRow}>
				<ModeHeader
					title="Help Mode"
					subtitle="Snap an image and ask for help!"
				/>
				{speech.isListening ? <RecordingIndicator label="" /> : null}
			</View>

			<View style={styles.row}>
				<View style={styles.previewColumn}>
					<CameraPreview
						base64Image={camera.lastImage}
						imageSize={camera.lastImageSize}
						placeholder="Take a photo of what you need help with"
					/>
				</View>

				<View style={styles.buttonsColumn}>
					<ActionButton
						label={
							camera.isCapturing
								? "Capturing..."
								: hasPhoto
									? "Re-take photo"
									: "Take photo"
						}
						onPress={handleTakePhoto}
						variant="secondary"
						disabled={camera.isCapturing || !camera.isReady}
					/>

					{speech.isListening ? (
						<ActionButton
							label="Stop"
							onPress={handleTalkToMe}
							variant="danger"
						/>
					) : hasResponse ? (
						<ActionButton
							label="Reset"
							onPress={handleReset}
							variant="secondary"
						/>
					) : hasContent && !isSending ? (
						<ActionButton
							label="Submit"
							onPress={handleSubmit}
							variant="secondary"
						/>
					) : (
						<ActionButton
							label="Talk to me!"
							onPress={handleTalkToMe}
							variant="secondary"
						/>
					)}
				</View>
			</View>

			{speech.error ? <Text style={styles.error}>{speech.error}</Text> : null}

			<View style={styles.textInputBox}>
				<Text style={styles.fieldLabel}>What you need help with</Text>
				<TextInput
					style={styles.textInput}
					value={questionText}
					onChangeText={setQuestionText}
					placeholder="Describe what you need help with..."
					placeholderTextColor={COLORS.textMuted}
					multiline
					textAlignVertical="top"
				/>
			</View>

			<AIResponseDisplay
				response={aiResponse}
				status={aiStatus}
				error={aiError}
				isSending={isSending}
				onClear={() => {
					setAiResponse("");
					setAiStatus(null);
					setAiError(null);
				}}
			/>
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
		alignItems: "center",
		gap: 12,
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
	fieldLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: COLORS.textPrimary,
		marginBottom: 8,
	},
	textInputBox: {
		marginTop: 12,
	},
	textInput: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		padding: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
		color: COLORS.textPrimary,
		fontSize: 15,
		lineHeight: 22,
		minHeight: 80,
	},
	error: {
		color: COLORS.destructive,
		fontSize: 13,
		marginTop: 8,
	},
});
