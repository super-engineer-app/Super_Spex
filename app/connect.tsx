import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
	ActivityIndicator,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useXRGlasses } from "../src/hooks/useXRGlasses";

/**
 * Connection screen component.
 *
 * Handles connecting and disconnecting from XR glasses,
 * with support for emulation mode.
 */
export default function ConnectScreen() {
	const router = useRouter();
	const { width: screenWidth } = useWindowDimensions();
	const isWeb = Platform.OS === "web";
	const {
		connected,
		loading,
		error,
		emulationMode,
		connect,
		disconnect,
		setEmulationMode,
	} = useXRGlasses();

	// Track if we just connected (to auto-navigate)
	const wasConnected = useRef(connected);

	// Auto-navigate to glasses dashboard when connection is established
	useEffect(() => {
		if (connected && !wasConnected.current) {
			// Just connected - navigate to glasses dashboard
			router.replace("/glasses");
		}
		wasConnected.current = connected;
	}, [connected, router]);

	// Handle connect action
	const handleConnect = async () => {
		await connect();
	};

	// Handle disconnect action
	const handleDisconnect = async () => {
		await disconnect();
	};

	// Toggle emulation mode
	const handleToggleEmulation = async () => {
		await setEmulationMode(!emulationMode);
	};

	// Navigate to dashboard on successful connection
	const handleGoToDashboard = () => {
		router.push("/glasses");
	};

	return (
		<SafeAreaView style={styles.container} edges={["bottom"]}>
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
				{/* Error Display */}
				{error && (
					<View style={styles.errorCard}>
						<Text style={styles.errorTitle}>Connection Error</Text>
						<Text style={styles.errorText}>{error.message}</Text>
					</View>
				)}

				{/* Loading State */}
				{loading ? (
					<View style={styles.loadingContainer}>
						<ActivityIndicator size="large" color="#0066cc" />
						<Text style={styles.loadingText}>
							{connected ? "Disconnecting..." : "Connecting..."}
						</Text>
					</View>
				) : (
					<View style={styles.actionContainer}>
						{/* Connected State */}
						{connected ? (
							<>
								<View style={styles.connectedCard}>
									<View style={styles.connectedIcon}>
										<Text style={styles.connectedIconText}>OK</Text>
									</View>
									<Text style={styles.connectedTitle}>Connected</Text>
									<Text style={styles.connectedSubtitle}>
										{emulationMode
											? "Emulated Connection"
											: "XR Glasses Connected"}
									</Text>
								</View>

								<Pressable
									style={styles.dashboardButton}
									onPress={handleGoToDashboard}
								>
									<Text style={styles.dashboardButtonText}>Open Dashboard</Text>
								</Pressable>

								<Pressable
									style={styles.disconnectButton}
									onPress={handleDisconnect}
								>
									<Text style={styles.buttonText}>Disconnect</Text>
								</Pressable>
							</>
						) : (
							<>
								{/* Disconnected State */}
								<View style={styles.instructionsCard}>
									<Text style={styles.instructionsTitle}>
										Connect to Glasses
									</Text>
									<Text style={styles.instructionsText}>
										Make sure your XR glasses are powered on and nearby.
										{"\n\n"}
										If you don't have glasses available, you can enable
										emulation mode for testing.
									</Text>
								</View>

								<Pressable style={styles.connectButton} onPress={handleConnect}>
									<Text style={styles.buttonText}>
										{emulationMode ? "Connect (Emulated)" : "Connect"}
									</Text>
								</Pressable>
							</>
						)}
					</View>
				)}

				{/* Emulation Mode Toggle */}
				<View style={styles.emulationSection}>
					<View style={styles.emulationHeader}>
						<Text style={styles.emulationTitle}>Emulation Mode</Text>
						<View
							style={[
								styles.emulationBadge,
								emulationMode && styles.emulationBadgeActive,
							]}
						>
							<Text
								style={[
									styles.emulationBadgeText,
									emulationMode && styles.emulationBadgeTextActive,
								]}
							>
								{emulationMode ? "ON" : "OFF"}
							</Text>
						</View>
					</View>
					<Text style={styles.emulationDescription}>
						Test the app without physical XR glasses hardware.
					</Text>
					<Pressable
						style={[
							styles.emulationButton,
							emulationMode && styles.emulationButtonActive,
						]}
						onPress={handleToggleEmulation}
						disabled={loading}
					>
						<Text style={styles.emulationButtonText}>
							{emulationMode ? "Disable Emulation" : "Enable Emulation"}
						</Text>
					</Pressable>
				</View>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#0a0a0a",
	},
	content: {
		flex: 1,
		padding: 16,
	},
	errorCard: {
		backgroundColor: "#3d1515",
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
	},
	errorTitle: {
		color: "#ff6b6b",
		fontSize: 16,
		fontWeight: "600",
		marginBottom: 4,
	},
	errorText: {
		color: "#ffaaaa",
		fontSize: 14,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	loadingText: {
		color: "#888888",
		fontSize: 16,
		marginTop: 16,
	},
	actionContainer: {
		flex: 1,
	},
	connectedCard: {
		backgroundColor: "#153d15",
		borderRadius: 16,
		padding: 32,
		alignItems: "center",
		marginBottom: 24,
	},
	connectedIcon: {
		width: 64,
		height: 64,
		borderRadius: 32,
		backgroundColor: "#4ade80",
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 16,
	},
	connectedIconText: {
		fontSize: 24,
		color: "#0a0a0a",
		fontWeight: "bold",
	},
	connectedTitle: {
		color: "#4ade80",
		fontSize: 24,
		fontWeight: "600",
		marginBottom: 4,
	},
	connectedSubtitle: {
		color: "#88cc88",
		fontSize: 14,
	},
	instructionsCard: {
		backgroundColor: "#1a1a1a",
		borderRadius: 12,
		padding: 20,
		marginBottom: 24,
	},
	instructionsTitle: {
		color: "#ffffff",
		fontSize: 18,
		fontWeight: "600",
		marginBottom: 12,
	},
	instructionsText: {
		color: "#888888",
		fontSize: 14,
		lineHeight: 22,
	},
	connectButton: {
		backgroundColor: "#0066cc",
		borderRadius: 12,
		padding: 18,
		alignItems: "center",
	},
	dashboardButton: {
		backgroundColor: "#0066cc",
		borderRadius: 12,
		padding: 18,
		alignItems: "center",
		marginBottom: 12,
	},
	dashboardButtonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "600",
	},
	disconnectButton: {
		backgroundColor: "#cc3300",
		borderRadius: 12,
		padding: 18,
		alignItems: "center",
	},
	buttonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "600",
	},
	emulationSection: {
		marginTop: "auto",
		backgroundColor: "#1a1a1a",
		borderRadius: 12,
		padding: 16,
	},
	emulationHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	emulationTitle: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "600",
	},
	emulationBadge: {
		backgroundColor: "#333333",
		borderRadius: 4,
		paddingVertical: 4,
		paddingHorizontal: 8,
	},
	emulationBadgeActive: {
		backgroundColor: "#3b3b00",
	},
	emulationBadgeText: {
		color: "#888888",
		fontSize: 12,
		fontWeight: "600",
	},
	emulationBadgeTextActive: {
		color: "#ffd700",
	},
	emulationDescription: {
		color: "#666666",
		fontSize: 13,
		marginBottom: 12,
	},
	emulationButton: {
		backgroundColor: "#2a2a2a",
		borderRadius: 8,
		padding: 12,
		alignItems: "center",
		borderWidth: 1,
		borderColor: "#444444",
	},
	emulationButtonActive: {
		borderColor: "#666600",
	},
	emulationButtonText: {
		color: "#cccccc",
		fontSize: 14,
		fontWeight: "500",
	},
});
