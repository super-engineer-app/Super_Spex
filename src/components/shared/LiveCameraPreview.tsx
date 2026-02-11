import { StyleSheet } from "react-native";
import { NativeCameraPreview } from "../../../modules/xr-glasses";
import { COLORS } from "../../theme";

interface LiveCameraPreviewProps {
	active?: boolean;
	playbackUrl?: string | null;
}

export function LiveCameraPreview({
	active = true,
	playbackUrl,
}: LiveCameraPreviewProps) {
	return (
		<NativeCameraPreview
			active={active}
			playbackUri={playbackUrl}
			style={styles.container}
		/>
	);
}

const styles = StyleSheet.create({
	container: {
		width: "100%",
		aspectRatio: 640 / 480,
		borderRadius: 8,
		overflow: "hidden",
		backgroundColor: COLORS.backgroundSecondary,
		marginVertical: 8,
	},
});
