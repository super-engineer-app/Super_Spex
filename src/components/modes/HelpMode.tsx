import { useCallback, useEffect, useRef, useState } from "react";
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
	const { camera, speech, activeMode } = useDashboard();
	const [aiResponse, setAiResponse] = useState("");
	const [aiStatus, setAiStatus] = useState<string | null>(null);
	const [aiError, setAiError] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [hasPhoto, setHasPhoto] = useState(false);
	const [questionText, setQuestionText] = useState("");
	const abortRef = useRef<AbortController | null>(null);
	// Text that existed before the current recording session started
	const questionBaseRef = useRef("");

	// Merge speech transcript into the editable text field (only when this mode is active)
	// speech.transcript already accumulates within a session, so we prepend the static base.
	useEffect(() => {
		if (activeMode !== "help") return;
		const transcript = speech.partialTranscript || speech.transcript || "";
		if (transcript) {
			const base = questionBaseRef.current;
			setQuestionText(base ? `${base} ${transcript}` : transcript);
		}
	}, [speech.partialTranscript, speech.transcript, activeMode]);

	// Auto-initialize camera on mode entry
	const initCamera = camera.initializeCamera;
	useEffect(() => {
		initCamera(false);
	}, [initCamera]);

	const handleTakePhoto = useCallback(async () => {
		await camera.captureImage();
		setHasPhoto(true);
	}, [camera]);

	const handleTalkToMe = useCallback(async () => {
		if (speech.isListening) {
			await speech.stopListening();
		} else {
			// Save current text so new recording appends to it
			questionBaseRef.current = questionText;
			await speech.startListening(true);
		}
	}, [speech, questionText]);

	const handleSubmit = useCallback(async () => {
		const text = questionText.trim();
		const image = camera.lastImage;
		if (!text && !image) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsSending(true);
		setAiResponse("");
		setAiStatus(null);
		setAiError(null);

		const callbacks = {
			signal: controller.signal,
			onChunk: (chunk: string) => {
				if (controller.signal.aborted) return;
				setAiStatus(null);
				setAiResponse((prev) => prev + chunk);
			},
			onStatus: (status: string) => {
				if (controller.signal.aborted) return;
				setAiStatus(status);
			},
			onComplete: (fullResponse: string) => {
				if (controller.signal.aborted) return;
				setAiStatus(null);
				logger.debug(
					TAG,
					"AI response complete:",
					fullResponse.length,
					"chars",
				);
			},
			onError: (error: Error) => {
				if (controller.signal.aborted) return;
				setAiStatus(null);
				setAiError(error.message);
			},
		};

		try {
			logger.debug(TAG, "Sending text+image to AI");
			if (text && image) {
				await sendTextAndImage(text, image, callbacks);
			} else if (text) {
				const { sendText } = await import("../../services/backendApi");
				await sendText(text, callbacks);
			} else if (image) {
				const { sendImage } = await import("../../services/backendApi");
				await sendImage(image, callbacks);
			}
		} catch (error) {
			if (!controller.signal.aborted) {
				logger.error(TAG, "Error:", error);
				setAiError(error instanceof Error ? error.message : "Unknown error");
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsSending(false);
			}
		}
	}, [questionText, camera.lastImage]);

	const handleReset = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setAiResponse("");
		setAiStatus(null);
		setAiError(null);
		setIsSending(false);
		setHasPhoto(false);
		setQuestionText("");
		questionBaseRef.current = "";
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

			<CameraPreview
				key={camera.lastImage ? "captured" : "empty"}
				base64Image={camera.lastImage}
				imageSize={camera.lastImageSize}
				placeholder="Take a photo of what you need help with"
			/>

			<View style={styles.buttonsRow}>
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
					style={styles.buttonFlex}
				/>

				<ActionButton
					label={speech.isListening ? "Stop" : "Talk to me!"}
					onPress={handleTalkToMe}
					variant={speech.isListening ? "danger" : "secondary"}
					style={styles.buttonFlex}
				/>
			</View>

			<View style={styles.buttonsRow}>
				{hasContent && !isSending && !speech.isListening ? (
					<ActionButton
						label="Submit"
						onPress={handleSubmit}
						variant="secondary"
						style={styles.buttonFlex}
					/>
				) : null}

				{(hasContent || hasResponse) && !speech.isListening ? (
					<ActionButton
						label="Reset"
						onPress={handleReset}
						variant="secondary"
						style={styles.buttonFlex}
					/>
				) : null}
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
				alwaysShow
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
		padding: 16,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	buttonsRow: {
		flexDirection: "row",
		gap: 12,
		marginTop: 12,
	},
	buttonFlex: {
		flex: 1,
	},
	fieldLabel: {
		fontSize: 14,
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
		fontSize: 14,
		lineHeight: 20,
		minHeight: 80,
	},
	error: {
		color: COLORS.destructive,
		fontSize: 13,
		marginTop: 8,
	},
});
