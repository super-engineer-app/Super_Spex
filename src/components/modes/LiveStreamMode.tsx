import * as Clipboard from "expo-clipboard";
import { useCallback, useState } from "react";
import {
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useRemoteView } from "../../hooks/useRemoteView";
import { COLORS } from "../../theme";
import logger from "../../utils/logger";
import { QualitySelector } from "../QualitySelector";
import { ModeHeader } from "../shared/ModeHeader";

const TAG = "LiveStreamMode";

export function LiveStreamMode() {
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

	const [copiedUrl, setCopiedUrl] = useState(false);

	const handleShareLink = useCallback(async () => {
		await shareLink();
		if (Platform.OS === "web") {
			setCopiedUrl(true);
			setTimeout(() => setCopiedUrl(false), 2000);
		}
	}, [shareLink]);

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

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<ModeHeader
				title="Live Stream"
				subtitle="Stream your glasses view to viewers"
			/>

			<View style={styles.section}>
				{!isStreaming ? (
					<>
						<QualitySelector
							value={selectedQuality}
							onChange={setQuality}
							disabled={streamLoading}
						/>
						<Pressable
							style={[
								styles.startButton,
								streamLoading && styles.buttonDisabled,
							]}
							onPress={startStream}
							disabled={streamLoading}
						>
							<Text style={styles.startButtonText}>
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
									<Pressable style={styles.copyButton} onPress={handleCopyUrl}>
										<Text style={styles.copyButtonText}>
											{copiedUrl ? "✓" : "Copy"}
										</Text>
									</Pressable>
								</View>
							</View>
						)}

						<View style={styles.streamButtons}>
							<Pressable style={styles.shareButton} onPress={handleShareLink}>
								<Text style={styles.shareButtonText}>
									{copiedUrl ? "Copied!" : "Share Link"}
								</Text>
							</Pressable>

							<Pressable
								style={[
									styles.stopButton,
									streamLoading && styles.buttonDisabled,
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

				{streamError ? <Text style={styles.error}>{streamError}</Text> : null}
			</View>
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
	section: {
		backgroundColor: COLORS.card,
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	startButton: {
		backgroundColor: COLORS.primary,
		borderRadius: 8,
		padding: 16,
		alignItems: "center",
		marginTop: 12,
	},
	startButtonText: {
		color: COLORS.primaryForeground,
		fontSize: 18,
		fontWeight: "bold",
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	streamInfo: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		padding: 12,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	streamLabel: {
		color: COLORS.textSecondary,
		fontSize: 14,
	},
	viewerCount: {
		color: COLORS.accent,
		fontSize: 24,
		fontWeight: "bold",
	},
	cameraSourceBox: {
		backgroundColor: COLORS.successBg,
		borderRadius: 8,
		padding: 10,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: COLORS.success,
	},
	cameraSourceBoxEmulation: {
		backgroundColor: "#FFFBEB",
		borderColor: COLORS.warning,
	},
	cameraSourceLabel: {
		color: COLORS.textSecondary,
		fontSize: 11,
		marginBottom: 2,
	},
	cameraSourceText: {
		color: COLORS.success,
		fontSize: 13,
		fontWeight: "600",
	},
	cameraSourceTextEmulation: {
		color: COLORS.warning,
	},
	resultBox: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		padding: 12,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	resultLabel: {
		color: COLORS.textSecondary,
		fontSize: 12,
		marginBottom: 4,
	},
	urlRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	linkText: {
		color: COLORS.accent,
		fontSize: 14,
		fontFamily: "monospace",
		flex: 1,
	},
	copyButton: {
		backgroundColor: COLORS.secondary,
		borderRadius: 6,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	copyButtonText: {
		color: COLORS.textPrimary,
		fontSize: 13,
		fontWeight: "600",
	},
	streamButtons: {
		flexDirection: "row",
		gap: 12,
	},
	shareButton: {
		flex: 1,
		backgroundColor: COLORS.success,
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
	},
	shareButtonText: {
		color: COLORS.successForeground,
		fontSize: 16,
		fontWeight: "600",
	},
	stopButton: {
		flex: 1,
		backgroundColor: COLORS.destructive,
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
	},
	stopButtonText: {
		color: COLORS.destructiveForeground,
		fontSize: 16,
		fontWeight: "bold",
	},
	error: {
		color: COLORS.destructive,
		fontSize: 13,
		marginTop: 8,
	},
});
