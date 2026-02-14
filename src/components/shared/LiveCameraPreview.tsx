import { StyleSheet } from "react-native";
import { NativeCameraPreview } from "../../../modules/xr-glasses";
import { COLORS } from "../../theme";

interface LiveCameraPreviewProps {
	active?: boolean;
	playbackUrl?: string | null;
	paused?: boolean;
}

export function LiveCameraPreview({
	active = true,
	playbackUrl,
	paused,
}: LiveCameraPreviewProps) {
	// Key forces React to remount the native view when switching between live/playback.
	// VideoView (SurfaceView) renders behind the window — the container's opaque background
	// covers it when transitioning within the same view instance. A fresh mount in playback
	// mode avoids this Android SurfaceView Z-ordering issue.
	const viewKey = playbackUrl ? `playback-${playbackUrl}` : "live";

	return (
		<NativeCameraPreview
			key={viewKey}
			active={active}
			playbackUri={playbackUrl}
			paused={paused}
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
