import {
	Image,
	Platform,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";

interface CameraPreviewProps {
	base64Image: string | null;
	imageSize: { width: number; height: number } | null;
	placeholder?: string;
}

export function CameraPreview({
	base64Image,
	imageSize,
	placeholder = "No image captured",
}: CameraPreviewProps) {
	const { width: screenWidth } = useWindowDimensions();
	const isWeb = Platform.OS === "web";

	if (!base64Image) {
		return (
			<View style={styles.placeholder}>
				<Text style={styles.placeholderText}>{placeholder}</Text>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			{imageSize ? (
				<Text style={styles.imageInfo}>
					{imageSize.width}x{imageSize.height}
				</Text>
			) : null}
			<Image
				source={{ uri: `data:image/jpeg;base64,${base64Image}` }}
				style={[styles.image, isWeb && screenWidth > 600 && { height: 320 }]}
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
		backgroundColor: "#1a1a1a",
		borderRadius: 8,
		padding: 32,
		alignItems: "center",
		justifyContent: "center",
		marginVertical: 8,
		borderWidth: 1,
		borderColor: "#333",
		borderStyle: "dashed",
	},
	placeholderText: {
		color: "#666",
		fontSize: 14,
	},
	imageInfo: {
		color: "#888",
		fontSize: 12,
		marginBottom: 4,
	},
	image: {
		width: "100%",
		height: 200,
		borderRadius: 8,
		backgroundColor: "#000",
	},
});
