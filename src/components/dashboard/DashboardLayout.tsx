import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { UseGlassesCameraReturn } from "../../hooks/useGlassesCamera";
import { COLORS } from "../../theme";
import { ContentArea } from "./ContentArea";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import { DashboardSidebar } from "./DashboardSidebar";

function DashboardInner() {
	const router = useRouter();
	const { glasses, camera } = useDashboard();

	// Keep a ref to camera so the unmount cleanup always sees latest values
	const cameraRef = useRef<UseGlassesCameraReturn>(camera);
	cameraRef.current = camera;

	// Cleanup camera on unmount only
	useEffect(() => {
		return () => {
			const cam = cameraRef.current;
			if (cam.isReady) {
				cam.releaseCamera();
			}
		};
	}, []);

	// Not connected — show message
	if (!glasses.connected) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.center}>
					<Text style={styles.title}>Not Connected</Text>
					<Pressable
						style={({ pressed }) => [
							styles.button,
							pressed && styles.buttonPressed,
						]}
						onPress={() => router.replace("/")}
					>
						<Text style={styles.buttonText}>Go to Connect</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.row}>
				<DashboardSidebar />
				<ContentArea />
			</View>
		</SafeAreaView>
	);
}

export function DashboardLayout() {
	return (
		<DashboardProvider>
			<DashboardInner />
		</DashboardProvider>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: COLORS.background,
	},
	row: {
		flex: 1,
		flexDirection: "row",
	},
	center: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	title: {
		fontSize: 18,
		fontWeight: "700",
		color: COLORS.textPrimary,
		marginBottom: 20,
	},
	button: {
		backgroundColor: COLORS.primary,
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 20,
		alignItems: "center",
	},
	buttonPressed: {
		opacity: 0.8,
		transform: [{ scale: 0.98 }],
	},
	buttonText: {
		color: COLORS.primaryForeground,
		fontSize: 14,
		fontWeight: "500",
	},
});
