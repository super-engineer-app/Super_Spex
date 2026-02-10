import { useCallback, useState } from "react";
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

	const handleTakePhoto = useCallback(async () => {
		if (!camera.isReady) {
			await camera.initializeCamera(false);
		} else {
			await camera.captureImage();
			setHasPhoto(true);
		}
	}, [camera]);

	const handleIdentify = useCallback(async () => {
		if (!camera.lastImage) return;
		setIsSending(true);
		setAiResponse("");
		setAiStatus(null);
		setAiError(null);
		try {
			logger.debug(TAG, "Sending image to AI for identification");
			await sendImage(camera.lastImage, {
				onChunk: (chunk) => {
					setAiStatus(null);
					setAiResponse((prev) => prev + chunk);
				},
				onStatus: (status) => {
					setAiStatus(status);
				},
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
		} catch (error) {
			logger.error(TAG, "Error:", error);
			setAiError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsSending(false);
		}
	}, [camera.lastImage]);

	const handleReset = useCallback(() => {
		setAiResponse("");
		setAiStatus(null);
		setAiError(null);
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
				title="Identify"
				subtitle="Take a photo and let AI identify it"
			/>

			<CameraPreview
				base64Image={camera.lastImage}
				imageSize={camera.lastImageSize}
				placeholder="Take a photo to identify something"
			/>

			{camera.error ? (
				<AIResponseDisplay
					response=""
					status={null}
					error={camera.error}
					isSending={false}
					onClear={() => {}}
				/>
			) : null}

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

				{hasPhoto && camera.lastImage ? (
					<ActionButton
						label={isSending ? "Identifying..." : "Identify!"}
						onPress={handleIdentify}
						variant="primary"
						disabled={isSending}
					/>
				) : null}

				{hasResponse ? (
					<ActionButton
						label="Reset"
						onPress={handleReset}
						variant="secondary"
					/>
				) : null}
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
	buttons: {
		gap: 12,
		marginTop: 12,
	},
});
