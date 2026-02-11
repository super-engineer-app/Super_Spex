import { useMemo, useState } from "react";
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
	const [loaded, setLoaded] = useState(false);

	const imageSource = useMemo(
		() =>
			base64Image
				? { uri: `data:image/jpeg;base64,${base64Image}` }
				: undefined,
		[base64Image],
	);

	// Always render a single container — never switch between two different
	// root Views, which can cause Android layout invalidation bugs.
	return (
		<View style={styles.container}>
			{imageSource ? (
				<Image
					// Force full remount when source changes to avoid stale native state
					key={base64Image ? base64Image.slice(-16) : "empty"}
					source={imageSource}
					style={styles.image}
					resizeMode="contain"
					fadeDuration={0}
					onLoad={() => setLoaded(true)}
				/>
			) : (
				<View style={styles.placeholderInner}>
					<Text style={styles.placeholderText}>{placeholder}</Text>
				</View>
			)}
			{imageSource && !loaded ? (
				<View style={styles.loadingOverlay}>
					<Text style={styles.placeholderText}>Loading image...</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		width: "100%",
		aspectRatio: 4 / 3,
		borderRadius: 8,
		overflow: "hidden",
		marginVertical: 8,
		backgroundColor: COLORS.backgroundSecondary,
	},
	placeholderInner: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: COLORS.input,
		borderStyle: "dashed",
		borderRadius: 8,
	},
	placeholderText: {
		color: COLORS.textMuted,
		fontSize: 14,
	},
	image: {
		width: "100%",
		height: "100%",
	},
	loadingOverlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: COLORS.backgroundSecondary,
	},
});
