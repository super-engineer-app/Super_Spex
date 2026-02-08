import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import {
	Alert,
	PermissionsAndroid,
	Platform,
	StyleSheet,
	useColorScheme,
	View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initializeErrorReporting } from "../src/services";
import { prefetchLocation } from "../src/services/taggingApi";
import logger from "../src/utils/logger";

const TAG = "RootLayout";

/**
 * Request all necessary permissions for the XR Glasses app.
 * This includes microphone, camera, location, and Bluetooth permissions.
 */
async function requestAllPermissions() {
	if (Platform.OS !== "android") return;

	try {
		// Define all permissions we need
		const permissions = [
			PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
			PermissionsAndroid.PERMISSIONS.CAMERA,
			PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
		];

		// Add Bluetooth permissions for Android 12+ (API 31+)
		if (Platform.Version >= 31) {
			permissions.push(
				PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
				PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
			);
		}

		// Request all permissions at once
		const results = await PermissionsAndroid.requestMultiple(permissions);

		// Log results for debugging
		logger.debug(TAG, "Permission results:", results);

		// Check if any critical permissions were denied
		const deniedPermissions = Object.entries(results)
			.filter(([_, status]) => status !== PermissionsAndroid.RESULTS.GRANTED)
			.map(([permission]) => permission.split(".").pop());

		if (deniedPermissions.length > 0) {
			logger.debug(TAG, "Some permissions were denied:", deniedPermissions);
		}
	} catch (error) {
		logger.error(TAG, "Error requesting permissions:", error);
	}
}

/**
 * Root layout component for the XR Glasses app.
 *
 * This component sets up the navigation stack and global providers.
 * It uses a dark theme to match the XR glasses aesthetic.
 */
export default function RootLayout() {
	const colorScheme = useColorScheme();

	// Initialize error reporting, request permissions, and pre-fetch GPS on app launch
	useEffect(() => {
		initializeErrorReporting();
		requestAllPermissions()
			.then(() => {
				// Pre-fetch GPS location after permissions are granted
				// This warms up the GPS cache so tagging mode images have instant coordinates
				logger.debug(TAG, "Pre-fetching GPS location for tagging...");
				prefetchLocation().catch((err) => {
					logger.error(TAG, "Failed to pre-fetch GPS location:", err);
				});
			})
			.catch((err) => {
				logger.error(TAG, "Failed to request permissions:", err);
			});
	}, []);

	return (
		<SafeAreaProvider>
			<View style={styles.container}>
				<StatusBar style="light" />
				<Stack
					screenOptions={{
						headerStyle: {
							backgroundColor: "#0a0a0a",
						},
						headerTintColor: "#ffffff",
						headerTitleStyle: {
							fontWeight: "600",
						},
						contentStyle: {
							backgroundColor: "#0a0a0a",
						},
						animation: "slide_from_right",
					}}
				>
					<Stack.Screen
						name="index"
						options={{
							title: "XR Glasses",
							headerShown: true,
						}}
					/>
					<Stack.Screen
						name="connect"
						options={{
							title: "Connect",
							presentation: "modal",
						}}
					/>
					<Stack.Screen
						name="glasses"
						options={{
							headerShown: false,
						}}
					/>
				</Stack>
			</View>
		</SafeAreaProvider>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#0a0a0a",
	},
});
