import { Image, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../theme";

interface CameraPreviewProps {
	base64Image: string | null;
	imageSize: { width: number; height: number } | null;
	placeholder?: string;
}

export function CameraPreview({
	base64Image,
	placeholder = "No image captured",
}: CameraPreviewProps) {
	if (!base64Image) {
		return (
			<View style={styles.placeholder}>
				<Text style={styles.placeholderText}>{placeholder}</Text>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<Image
				source={{ uri: `data:image/jpeg;base64,${base64Image}` }}
				style={styles.image}
				resizeMode="contain"
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginVertical: 8,
	},
	placeholder: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		marginVertical: 8,
		borderWidth: 1,
		borderColor: COLORS.input,
		borderStyle: "dashed",
		aspectRatio: 640 / 480,
		width: "100%",
	},
	placeholderText: {
		color: COLORS.textMuted,
		fontSize: 14,
	},
	image: {
		width: "100%",
		aspectRatio: 640 / 480,
		borderRadius: 8,
		backgroundColor: COLORS.secondary,
	},
});
