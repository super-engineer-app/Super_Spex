import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
	Linking,
	PermissionsAndroid,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useXRGlasses } from "../src/hooks/useXRGlasses";
import { prefetchLocation } from "../src/services/taggingApi";
import logger from "../src/utils/logger";

const TAG = "HomeScreen";

/** Permissions we need before the app is usable */
type Permission =
	(typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

function getRequiredPermissions(): Permission[] {
	if (Platform.OS !== "android") return [];
	const perms: Permission[] = [
		PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
		PermissionsAndroid.PERMISSIONS.CAMERA,
		PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
	];
	if (Platform.Version >= 31) {
		perms.push(
			PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
			PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
		);
	}
	return perms;
}

/** Check if all required permissions are already granted */
async function checkAllGranted(): Promise<boolean> {
	if (Platform.OS !== "android") return true;
	const perms = getRequiredPermissions();
	for (const p of perms) {
		if (!(await PermissionsAndroid.check(p))) return false;
	}
	return true;
}

/** Request all permissions, returns true if all granted */
async function requestAll(): Promise<boolean> {
	if (Platform.OS !== "android") return true;
	const perms = getRequiredPermissions();
	const results = await PermissionsAndroid.requestMultiple(perms);
	logger.debug(TAG, "Permission results:", results);
	return Object.values(results).every(
		(s) => s === PermissionsAndroid.RESULTS.GRANTED,
	);
}

export default function HomeScreen() {
	const router = useRouter();
	const { width: screenWidth } = useWindowDimensions();
	const isWeb = Platform.OS === "web";
	const {
		connected,
		loading,
		emulationMode: demoMode,
		connect,
		setEmulationMode: setDemoMode,
	} = useXRGlasses();

	const [permissionsGranted, setPermissionsGranted] = useState(
		Platform.OS !== "android",
	);
	const [permissionsChecked, setPermissionsChecked] = useState(false);

	// Check permissions on mount
	useEffect(() => {
		checkAllGranted().then((granted) => {
			setPermissionsGranted(granted);
			setPermissionsChecked(true);
			if (granted) {
				prefetchLocation().catch((err) =>
					logger.error(TAG, "GPS prefetch failed:", err),
				);
			}
		});
	}, []);

	const handleGrantPermissions = useCallback(async () => {
		const granted = await requestAll();
		setPermissionsGranted(granted);
		if (granted) {
			prefetchLocation().catch((err) =>
				logger.error(TAG, "GPS prefetch failed:", err),
			);
		} else {
			// Some were denied — user may need to open settings
			logger.debug(TAG, "Some permissions denied, may need settings");
		}
	}, []);

	const handleOpenSettings = useCallback(() => {
		Linking.openSettings();
	}, []);

	const handleConnectGlasses = async () => {
		try {
			await setDemoMode(false);
			await connect();
			router.push("/glasses");
		} catch (error) {
			logger.error(TAG, "Connection failed:", error);
		}
	};

	const handleConnectDemoMode = async () => {
		try {
			await setDemoMode(true);
			await connect();
			router.push("/glasses");
		} catch (error) {
			logger.error(TAG, "Demo mode connection failed:", error);
		}
	};

	const handleGoToDashboard = () => {
		router.push("/glasses");
	};

	// Show permissions screen if not yet granted (Android only)
	if (!permissionsGranted && permissionsChecked) {
		return (
			<SafeAreaView style={styles.container}>
				<View
					style={[
						styles.content,
						isWeb && {
							maxWidth: Math.min(screenWidth * 0.9, 720),
							alignSelf: "center" as const,
							width: "100%" as const,
						},
					]}
				>
					<Text style={styles.title}>Permissions Needed</Text>
					<Text style={styles.subtitle}>
						This app needs camera, microphone, location, and Bluetooth access to
						work with XR glasses.
					</Text>

					<Pressable
						style={styles.primaryButton}
						onPress={handleGrantPermissions}
					>
						<Text style={styles.buttonText}>Grant Permissions</Text>
					</Pressable>

					<Pressable
						style={styles.secondaryButton}
						onPress={handleOpenSettings}
					>
						<Text style={styles.buttonText}>Open Settings</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<View
				style={[
					styles.content,
					isWeb && {
						maxWidth: Math.min(screenWidth * 0.9, 720),
						alignSelf: "center" as const,
						width: "100%" as const,
					},
				]}
			>
				<Text style={styles.title}>XR Glasses</Text>
				<Text style={styles.subtitle}>Connect to get started</Text>

				{connected ? (
					<>
						<View style={styles.connectedBadge}>
							<Text style={styles.connectedText}>
								Connected {demoMode ? "(Demo Mode)" : "(Real Glasses)"}
							</Text>
						</View>
						<Pressable
							style={styles.primaryButton}
							onPress={handleGoToDashboard}
						>
							<Text style={styles.buttonText}>Open Dashboard</Text>
						</Pressable>
					</>
				) : (
					<>
						<Pressable
							style={[styles.primaryButton, loading && styles.buttonDisabled]}
							onPress={handleConnectGlasses}
							disabled={loading}
						>
							<Text style={styles.buttonText}>
								{loading ? "Connecting..." : "Connect Glasses"}
							</Text>
						</Pressable>

						<Pressable
							style={[styles.secondaryButton, loading && styles.buttonDisabled]}
							onPress={handleConnectDemoMode}
							disabled={loading}
						>
							<Text style={styles.buttonText}>Demo Mode</Text>
						</Pressable>
					</>
				)}
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#111",
	},
	content: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	title: {
		fontSize: 32,
		fontWeight: "bold",
		color: "#fff",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
		color: "#888",
		marginBottom: 40,
		textAlign: "center",
	},
	connectedBadge: {
		backgroundColor: "#1a3a1a",
		borderRadius: 8,
		padding: 12,
		marginBottom: 20,
	},
	connectedText: {
		color: "#4a4",
		fontSize: 14,
		fontWeight: "600",
	},
	primaryButton: {
		backgroundColor: "#07f",
		borderRadius: 12,
		padding: 18,
		width: "100%",
		alignItems: "center",
		marginBottom: 12,
	},
	secondaryButton: {
		backgroundColor: "#333",
		borderRadius: 12,
		padding: 18,
		width: "100%",
		alignItems: "center",
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	buttonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "600",
	},
});
