import { useEffect, useRef } from "react";
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
	const containerRef = useRef<View>(null);
	const liveVideoRef = useRef<HTMLVideoElement | null>(null);
	const playbackVideoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);

	// Camera stream setup
	useEffect(() => {
		if (!active) {
			if (streamRef.current) {
				for (const track of streamRef.current.getTracks()) {
					track.stop();
				}
				streamRef.current = null;
			}
			if (liveVideoRef.current) {
				liveVideoRef.current.srcObject = null;
				liveVideoRef.current.remove();
				liveVideoRef.current = null;
			}
			return;
		}

		let cancelled = false;

		async function startPreview() {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: { width: 640, height: 480 },
					audio: false,
				});
				if (cancelled) {
					for (const track of stream.getTracks()) {
						track.stop();
					}
					return;
				}
				streamRef.current = stream;

				const node = containerRef.current as unknown as HTMLElement;
				if (!node) return;

				let video = liveVideoRef.current;
				if (!video) {
					video = document.createElement("video");
					video.autoplay = true;
					video.playsInline = true;
					video.muted = true;
					video.style.width = "100%";
					video.style.height = "100%";
					video.style.objectFit = "cover";
					video.style.borderRadius = "8px";
					liveVideoRef.current = video;
				}
				video.srcObject = stream;

				if (!node.contains(video)) {
					node.appendChild(video);
				}
			} catch (_err) {
				// Camera access denied or unavailable
			}
		}

		startPreview();

		return () => {
			cancelled = true;
			if (streamRef.current) {
				for (const track of streamRef.current.getTracks()) {
					track.stop();
				}
				streamRef.current = null;
			}
			if (liveVideoRef.current) {
				liveVideoRef.current.srcObject = null;
				liveVideoRef.current.remove();
				liveVideoRef.current = null;
			}
		};
	}, [active]);

	// Playback mode: show recorded video instead of live camera
	useEffect(() => {
		const node = containerRef.current as unknown as HTMLElement;
		if (!node) return;

		if (playbackUrl) {
			// Hide live video
			if (liveVideoRef.current) {
				liveVideoRef.current.style.display = "none";
			}

			let video = playbackVideoRef.current;
			if (!video) {
				video = document.createElement("video");
				video.controls = true;
				video.playsInline = true;
				video.loop = true;
				video.style.width = "100%";
				video.style.height = "100%";
				video.style.objectFit = "cover";
				video.style.borderRadius = "8px";
				playbackVideoRef.current = video;
			}
			video.src = playbackUrl;

			if (!node.contains(video)) {
				node.appendChild(video);
			}
		} else {
			// Remove playback video, restore live
			if (playbackVideoRef.current) {
				playbackVideoRef.current.remove();
				playbackVideoRef.current = null;
			}
			if (liveVideoRef.current) {
				liveVideoRef.current.style.display = "";
			}
		}
	}, [playbackUrl]);

	if (!active && !playbackUrl) {
		return (
			<View style={styles.placeholder}>
				<Text style={styles.placeholderText}>Video preview</Text>
			</View>
		);
	}

	return <View ref={containerRef} style={styles.container} />;
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
