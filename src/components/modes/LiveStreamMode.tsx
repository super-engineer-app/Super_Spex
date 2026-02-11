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
import { ActionButton } from "../shared/ActionButton";
import { ModeHeader } from "../shared/ModeHeader";
import { RecordingIndicator } from "../shared/RecordingIndicator";

const TAG = "LiveStreamMode";

export function LiveStreamMode() {
	const {
		isStreaming,
		viewerUrl,
		viewerCount,
		error: streamError,
		loading: streamLoading,
		startStream,
		stopStream,
	} = useRemoteView();

	const [copiedUrl, setCopiedUrl] = useState(false);
	const [stopped, setStopped] = useState(false);

	const handleStartStream = useCallback(async () => {
		setStopped(false);
		await startStream();
	}, [startStream]);

	const handleStopStream = useCallback(async () => {
		await stopStream();
		setStopped(true);
	}, [stopStream]);

	const handleReset = useCallback(() => {
		setStopped(false);
	}, []);

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
			<View style={styles.headerRow}>
				<ModeHeader
					title="Live Stream"
					subtitle="Start & share a live video stream"
				/>
				{isStreaming ? <RecordingIndicator label="" /> : null}
			</View>

			<View style={styles.row}>
				<View style={styles.previewColumn}>
					<View style={styles.placeholder}>
						<Text style={styles.placeholderText}>
							{isStreaming ? "Streaming..." : "Stream preview"}
						</Text>
					</View>
				</View>

				<View style={styles.buttonsColumn}>
					{isStreaming ? (
						<ActionButton
							label={streamLoading ? "Stopping..." : "Stop"}
							onPress={handleStopStream}
							variant="danger"
							disabled={streamLoading}
						/>
					) : stopped ? (
						<ActionButton
							label="Re-set"
							onPress={handleReset}
							variant="secondary"
						/>
					) : (
						<ActionButton
							label={streamLoading ? "Starting..." : "Start Stream"}
							onPress={handleStartStream}
							variant="secondary"
							disabled={streamLoading}
						/>
					)}
				</View>
			</View>

			{streamError ? <Text style={styles.error}>{streamError}</Text> : null}

			<View style={styles.section}>
				<Text style={styles.sectionLabel}>Share your Stream</Text>
				<View style={styles.linkRow}>
					<Text style={styles.linkText} numberOfLines={1}>
						{viewerUrl || "[LINK]"}
					</Text>
					<Pressable style={styles.copyButton} onPress={handleCopyUrl}>
						<Text style={styles.copyButtonText}>
							{copiedUrl ? "Copied!" : "Copy"}
						</Text>
					</Pressable>
				</View>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionLabel}>Number of viewers</Text>
				<View style={styles.viewerBox}>
					<Text style={styles.viewerCount}>{viewerCount}</Text>
				</View>
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
	section: {
		marginTop: 16,
	},
	sectionLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: COLORS.textPrimary,
		marginBottom: 8,
	},
	linkRow: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: 12,
		gap: 8,
	},
	linkText: {
		color: COLORS.textSecondary,
		fontSize: 14,
		fontFamily: Platform.OS === "web" ? "monospace" : undefined,
		flex: 1,
	},
	copyButton: {
		backgroundColor: COLORS.secondary,
		borderRadius: 6,
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	copyButtonText: {
		color: COLORS.textPrimary,
		fontSize: 14,
		fontWeight: "600",
	},
	viewerBox: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: 16,
		alignItems: "center",
	},
	viewerCount: {
		color: COLORS.textPrimary,
		fontSize: 24,
		fontWeight: "bold",
	},
	error: {
		color: COLORS.destructive,
		fontSize: 13,
		marginTop: 8,
	},
});
