import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../theme";

interface LiveCameraPreviewProps {
	active?: boolean;
	playbackUrl?: string | null;
}

export function LiveCameraPreview({
	active = true,
	playbackUrl,
}: LiveCameraPreviewProps) {
	const label = playbackUrl
		? "Recording saved"
		: active
			? "Camera preview"
			: "Video preview";

	return (
		<View style={styles.placeholder}>
			<Text style={styles.placeholderText}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	placeholder: {
		width: "100%",
		aspectRatio: 640 / 480,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		marginVertical: 8,
		borderWidth: 1,
		borderColor: COLORS.input,
		borderStyle: "dashed",
		backgroundColor: COLORS.backgroundSecondary,
	},
	placeholderText: {
		color: COLORS.textMuted,
		fontSize: 14,
	},
});
