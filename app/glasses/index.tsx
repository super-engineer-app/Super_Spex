import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Platform,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getXRGlassesService } from "../../modules/xr-glasses";
import { DashboardLayout } from "../../src/components/dashboard/DashboardLayout";
import logger from "../../src/utils/logger";

const TAG = "GlassesDashboard";

// Fallback timeout in case the projected permission event never fires
// (e.g. permissions already granted from a previous session)
const FALLBACK_TIMEOUT_MS = 2000;

/**
 * Wrapper that shows a loading screen while XR projected permissions complete,
 * then mounts the real dashboard with fresh native views.
 *
 * On first cold-boot connection, the XR SDK overlays RequestPermissionsOnHostActivity
 * on the phone which corrupts RN's text rendering. By deferring the real dashboard
 * until after that overlay dismisses (signaled by onProjectedPermissionsCompleted),
 * all native views are created fresh and uncorrupted.
 */
export default function GlassesDashboardWrapper() {
	const [ready, setReady] = useState(Platform.OS === "web");

	useEffect(() => {
		if (ready) return;

		const service = getXRGlassesService();

		// Listen for projected permissions to complete (event-driven, no guessing)
		const sub = service.onProjectedPermissionsCompleted(() => {
			logger.debug(TAG, "Projected permissions completed — mounting dashboard");
			setReady(true);
		});

		// Fallback: if the event never fires (permissions already granted), mount anyway
		const timer = setTimeout(() => {
			logger.debug(TAG, "Fallback timeout — mounting dashboard");
			setReady(true);
		}, FALLBACK_TIMEOUT_MS);

		return () => {
			sub.remove();
			clearTimeout(timer);
		};
	}, [ready]);

	if (!ready) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.center}>
					<ActivityIndicator size="large" color="#07f" />
					<Text style={styles.initText}>Initializing glasses...</Text>
				</View>
			</SafeAreaView>
		);
	}

	return <DashboardLayout />;
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#111",
	},
	center: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	initText: {
		color: "#888",
		fontSize: 16,
		marginTop: 16,
	},
});
