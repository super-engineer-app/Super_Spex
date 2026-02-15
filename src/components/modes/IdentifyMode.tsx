import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { sendImage } from "../../services/backendApi";
import logger from "../../utils/logger";
import { useDashboard } from "../dashboard/DashboardContext";
import { ActionButton } from "../shared/ActionButton";
import { AIResponseDisplay } from "../shared/AIResponseDisplay";
import { CameraPreview } from "../shared/CameraPreview";
import { ModeHeader } from "../shared/ModeHeader";

const TAG = "IdentifyMode";

export function IdentifyMode() {
	const { camera } = useDashboard();
	const [aiResponse, setAiResponse] = useState("");
	const [aiStatus, setAiStatus] = useState<string | null>(null);
	const [aiError, setAiError] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [hasPhoto, setHasPhoto] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	// Auto-initialize camera on mode entry
	const initCamera = camera.initializeCamera;
	useEffect(() => {
		initCamera(false);
	}, [initCamera]);

	const handleTakePhoto = useCallback(async () => {
		await camera.captureImage();
		setHasPhoto(true);
	}, [camera]);

	const handleIdentify = useCallback(async () => {
		if (!camera.lastImage) return;
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsSending(true);
		setAiResponse("");
		setAiStatus(null);
		setAiError(null);
		try {
			logger.debug(TAG, "Sending image to AI for identification");
			await sendImage(camera.lastImage, {
				signal: controller.signal,
				onChunk: (chunk) => {
					if (controller.signal.aborted) return;
					setAiStatus(null);
					setAiResponse((prev) => prev + chunk);
				},
				onStatus: (status) => {
					if (controller.signal.aborted) return;
					setAiStatus(status);
				},
				onComplete: (fullResponse) => {
					if (controller.signal.aborted) return;
					setAiStatus(null);
					logger.debug(
						TAG,
						"AI response complete:",
						fullResponse.length,
						"chars",
					);
				},
				onError: (error) => {
					if (controller.signal.aborted) return;
					setAiStatus(null);
					setAiError(error.message);
				},
			});
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
	}, [camera.lastImage]);

	const handleReset = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setAiResponse("");
		setAiStatus(null);
		setAiError(null);
		setIsSending(false);
		setHasPhoto(false);
		camera.clearImage();
	}, [camera]);

	const hasResponse = aiResponse || aiError || aiStatus || isSending;

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<ModeHeader
				title="Auto identify"
				subtitle="Take a photo and I'll tell you what it is!"
			/>

			<CameraPreview
				key={camera.lastImage ? "captured" : "empty"}
				base64Image={camera.lastImage}
				imageSize={camera.lastImageSize}
				placeholder="Take a photo to identify something"
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

				{hasResponse ? (
					<ActionButton
						label="Re-set"
						onPress={handleReset}
						variant="secondary"
						style={styles.buttonFlex}
					/>
				) : (
					<ActionButton
						label={isSending ? "Identifying..." : "Identify!"}
						onPress={handleIdentify}
						variant="secondary"
						disabled={isSending || !hasPhoto || !camera.lastImage}
						style={styles.buttonFlex}
					/>
				)}
			</View>

			{camera.error ? (
				<AIResponseDisplay
					response=""
					status={null}
					error={camera.error}
					isSending={false}
					onClear={() => {}}
				/>
			) : null}

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
	buttonsRow: {
		flexDirection: "row",
		gap: 12,
		marginTop: 12,
	},
	buttonFlex: {
		flex: 1,
	},
});
