import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { sendTextAndImage } from "../../services/backendApi";
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
	const [typedText, setTypedText] = useState("");

	const displayTranscript = speech.partialTranscript || speech.transcript || "";

	const handleTakePhoto = useCallback(async () => {
		if (!camera.isReady) {
			await camera.initializeCamera(false);
		} else {
			await camera.captureImage();
			setHasPhoto(true);
		}
	}, [camera]);

	const handleTalkToMe = useCallback(async () => {
		if (speech.isListening) {
			await speech.stopListening();
		} else {
			await speech.startListening(true);
		}
	}, [speech]);

	const handleSubmit = useCallback(async () => {
		// Combine typed text with speech transcript
		const parts = [typedText.trim(), speech.transcript].filter(Boolean);
		const text = parts.join("\n\n") || "";
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
	}, [speech.transcript, camera.lastImage, typedText]);

	const handleReset = useCallback(() => {
		setAiResponse("");
		setAiStatus(null);
		setAiError(null);
		setHasPhoto(false);
		setTypedText("");
		camera.clearImage();
		speech.clearTranscript();
	}, [camera, speech]);

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<ModeHeader
				title="Help"
				subtitle="Show what you need help with and describe it"
			/>

			<CameraPreview
				base64Image={camera.lastImage}
				imageSize={camera.lastImageSize}
				placeholder="Take a photo of what you need help with"
			/>

			<View style={styles.buttons}>
				<ActionButton
					label={
						camera.isCapturing
							? "Capturing..."
							: camera.isReady
								? hasPhoto
									? "Re-take Photo"
									: "Take Photo"
								: "Enable Camera"
					}
					onPress={handleTakePhoto}
					variant="success"
					disabled={camera.isCapturing}
				/>

				<ActionButton
					label={speech.isListening ? "Stop Listening" : "Talk to me!"}
					onPress={handleTalkToMe}
					variant={speech.isListening ? "danger" : "primary"}
				/>
			</View>

			{speech.isListening ? <RecordingIndicator label="Listening..." /> : null}

			{displayTranscript ? (
				<View style={styles.transcriptBox}>
					<Text style={styles.transcriptLabel}>What you need help with:</Text>
					<Text style={styles.transcriptText}>{displayTranscript}</Text>
				</View>
			) : null}

			{/* Text input */}
			<View style={styles.textInputBox}>
				<Text style={styles.transcriptLabel}>Type your question:</Text>
				<TextInput
					style={styles.textInput}
					value={typedText}
					onChangeText={setTypedText}
					placeholder="Describe what you need help with..."
					placeholderTextColor="#666"
					multiline
					textAlignVertical="top"
				/>
			</View>

			{speech.error ? <Text style={styles.error}>{speech.error}</Text> : null}

			{(speech.transcript || typedText.trim() || camera.lastImage) &&
			!isSending ? (
				<ActionButton
					label="Submit"
					onPress={handleSubmit}
					variant="primary"
					style={styles.submitButton}
				/>
			) : null}

			{aiResponse || aiError || aiStatus || isSending ? (
				<ActionButton
					label="Reset"
					onPress={handleReset}
					variant="secondary"
					style={styles.resetButton}
				/>
			) : null}

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
	buttons: {
		gap: 12,
		marginTop: 12,
	},
	transcriptBox: {
		backgroundColor: "#222",
		borderRadius: 8,
		padding: 12,
		marginTop: 12,
	},
	transcriptLabel: {
		color: "#888",
		fontSize: 12,
		marginBottom: 4,
	},
	transcriptText: {
		color: "#fff",
		fontSize: 16,
	},
	textInputBox: {
		backgroundColor: "#222",
		borderRadius: 8,
		padding: 12,
		marginTop: 12,
	},
	textInput: {
		color: "#fff",
		fontSize: 15,
		lineHeight: 22,
		minHeight: 60,
	},
	error: {
		color: "#f66",
		fontSize: 13,
		marginTop: 8,
	},
	submitButton: {
		marginTop: 12,
	},
	resetButton: {
		marginTop: 8,
	},
});
