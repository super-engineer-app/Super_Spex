import { useState } from "react";
import {
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useXRGlasses } from "../../src/hooks/useXRGlasses";

/**
 * Display controls screen.
 *
 * Provides controls for managing the glasses display,
 * including screen always-on and brightness settings.
 */
export default function DisplayControlsScreen() {
	const {
		connected,
		engagementMode,
		emulationMode,
		keepScreenOn,
		simulateInputEvent,
	} = useXRGlasses();

	const [screenAlwaysOn, setScreenAlwaysOn] = useState(false);
	const [brightness, setBrightness] = useState(70);

	// Handle brightness change
	const handleBrightnessChange = (delta: number) => {
		setBrightness((prev) => Math.max(0, Math.min(100, prev + delta)));
		if (emulationMode) {
			simulateInputEvent(delta > 0 ? "BRIGHTNESS_UP" : "BRIGHTNESS_DOWN");
		}
	};

	// Handle screen always-on toggle
	const handleScreenAlwaysOn = async (value: boolean) => {
		setScreenAlwaysOn(value);
		await keepScreenOn(value);
	};

	// Handle visuals toggle
	const handleToggleVisuals = () => {
		if (emulationMode) {
			simulateInputEvent("TOGGLE_VISUALS");
		}
	};

	if (!connected) {
		return (
			<SafeAreaView style={styles.container} edges={["bottom"]}>
				<View style={styles.notConnectedContainer}>
					<Text style={styles.notConnectedText}>Not connected to glasses</Text>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container} edges={["bottom"]}>
			<ScrollView
				style={styles.scrollView}
				contentContainerStyle={styles.scrollContent}
			>
				{/* Display Status */}
				<View style={styles.card}>
					<Text style={styles.cardTitle}>Display Status</Text>
					<View style={styles.statusItem}>
						<Text style={styles.statusLabel}>Visuals</Text>
						<View
							style={[
								styles.statusBadge,
								engagementMode.visualsOn && styles.statusBadgeActive,
							]}
						>
							<Text
								style={[
									styles.statusBadgeText,
									engagementMode.visualsOn && styles.statusBadgeTextActive,
								]}
							>
								{engagementMode.visualsOn ? "ON" : "OFF"}
							</Text>
						</View>
					</View>
					{emulationMode && (
						<Pressable
							style={styles.toggleButton}
							onPress={handleToggleVisuals}
						>
							<Text style={styles.toggleButtonText}>
								Toggle Visuals (Emulation)
							</Text>
						</Pressable>
					)}
				</View>

				{/* Screen Settings */}
				<View style={styles.card}>
					<Text style={styles.cardTitle}>Screen Settings</Text>

					<View style={styles.settingRow}>
						<View style={styles.settingInfo}>
							<Text style={styles.settingLabel}>Keep Screen On</Text>
							<Text style={styles.settingDescription}>
								Prevent the glasses display from turning off
							</Text>
						</View>
						<Switch
							value={screenAlwaysOn}
							onValueChange={handleScreenAlwaysOn}
							trackColor={{ false: "#333333", true: "#004499" }}
							thumbColor={screenAlwaysOn ? "#0066cc" : "#888888"}
						/>
					</View>
				</View>

				{/* Display Info */}
				<View style={styles.card}>
					<Text style={styles.cardTitle}>Display Information</Text>
					<View style={styles.infoGrid}>
						<View style={styles.infoItem}>
							<Text style={styles.infoValue}>--</Text>
							<Text style={styles.infoLabel}>Resolution</Text>
						</View>
						<View style={styles.infoItem}>
							<Text style={styles.infoValue}>--</Text>
							<Text style={styles.infoLabel}>Refresh Rate</Text>
						</View>
						<View style={styles.infoItem}>
							<Text style={styles.infoValue}>--</Text>
							<Text style={styles.infoLabel}>FOV</Text>
						</View>
					</View>
					<Text style={styles.infoNote}>
						Display specifications will be available when connected to real
						hardware.
					</Text>
				</View>

				{/* Brightness Control */}
				<View style={styles.card}>
					<Text style={styles.cardTitle}>Brightness</Text>
					<View style={styles.brightnessContainer}>
						<View style={styles.brightnessBar}>
							<View
								style={[styles.brightnessLevel, { width: `${brightness}%` }]}
							/>
						</View>
						<Text style={styles.brightnessValue}>{brightness}%</Text>
					</View>
					<View style={styles.brightnessButtons}>
						<Pressable
							style={[
								styles.brightnessButton,
								brightness <= 0 && styles.brightnessButtonDisabled,
							]}
							onPress={() => handleBrightnessChange(-10)}
							disabled={brightness <= 0}
						>
							<Text style={styles.brightnessButtonText}>-</Text>
						</Pressable>
						<Pressable
							style={[
								styles.brightnessButton,
								brightness >= 100 && styles.brightnessButtonDisabled,
							]}
							onPress={() => handleBrightnessChange(10)}
							disabled={brightness >= 100}
						>
							<Text style={styles.brightnessButtonText}>+</Text>
						</Pressable>
					</View>
					<Text style={styles.infoNote}>
						{emulationMode
							? "Simulated brightness control"
							: "Brightness control available on supported hardware."}
					</Text>
				</View>

				{/* Emulation Note */}
				{emulationMode && (
					<View style={styles.emulationNote}>
						<Text style={styles.emulationNoteText}>
							Running in emulation mode. Some display controls are simulated.
						</Text>
					</View>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#0a0a0a",
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {
		padding: 16,
		paddingBottom: 32,
	},
	notConnectedContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	notConnectedText: {
		color: "#888888",
		fontSize: 16,
	},
	card: {
		backgroundColor: "#1a1a1a",
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
	},
	cardTitle: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "600",
		marginBottom: 16,
	},
	statusItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 8,
	},
	statusLabel: {
		color: "#cccccc",
		fontSize: 14,
	},
	statusBadge: {
		backgroundColor: "#333333",
		borderRadius: 4,
		paddingVertical: 4,
		paddingHorizontal: 12,
	},
	statusBadgeActive: {
		backgroundColor: "#1a4d1a",
	},
	statusBadgeText: {
		color: "#888888",
		fontSize: 12,
		fontWeight: "600",
	},
	statusBadgeTextActive: {
		color: "#4ade80",
	},
	toggleButton: {
		backgroundColor: "#2a2a2a",
		borderRadius: 8,
		padding: 12,
		alignItems: "center",
		marginTop: 12,
	},
	toggleButtonText: {
		color: "#0066cc",
		fontSize: 14,
	},
	settingRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 8,
	},
	settingInfo: {
		flex: 1,
		marginRight: 16,
	},
	settingLabel: {
		color: "#ffffff",
		fontSize: 14,
		marginBottom: 4,
	},
	settingDescription: {
		color: "#666666",
		fontSize: 12,
	},
	infoGrid: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginBottom: 16,
	},
	infoItem: {
		alignItems: "center",
	},
	infoValue: {
		color: "#ffffff",
		fontSize: 20,
		fontWeight: "600",
		marginBottom: 4,
	},
	infoLabel: {
		color: "#888888",
		fontSize: 12,
	},
	infoNote: {
		color: "#666666",
		fontSize: 12,
		fontStyle: "italic",
		textAlign: "center",
	},
	brightnessContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 16,
	},
	brightnessBar: {
		flex: 1,
		height: 8,
		backgroundColor: "#333333",
		borderRadius: 4,
		marginRight: 12,
		overflow: "hidden",
	},
	brightnessLevel: {
		height: "100%",
		backgroundColor: "#0066cc",
		borderRadius: 4,
	},
	brightnessValue: {
		color: "#ffffff",
		fontSize: 14,
		fontWeight: "500",
		width: 40,
		textAlign: "right",
	},
	brightnessButtons: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 16,
		marginBottom: 16,
	},
	brightnessButton: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: "#2a2a2a",
		justifyContent: "center",
		alignItems: "center",
	},
	brightnessButtonDisabled: {
		opacity: 0.3,
	},
	brightnessButtonText: {
		color: "#ffffff",
		fontSize: 24,
		fontWeight: "300",
	},
	emulationNote: {
		backgroundColor: "#3b3b00",
		borderRadius: 8,
		padding: 12,
	},
	emulationNoteText: {
		color: "#ffd700",
		fontSize: 12,
		textAlign: "center",
	},
});
