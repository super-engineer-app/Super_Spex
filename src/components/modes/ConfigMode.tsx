import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useParkingTimer } from "../../hooks/useParkingTimer";
import { useDashboard } from "../dashboard/DashboardContext";
import { ModeHeader } from "../shared/ModeHeader";
import { TimePicker } from "../TimePicker";

export function ConfigMode() {
	const router = useRouter();
	const { glasses, camera } = useDashboard();

	const {
		isActive: timerActive,
		formattedTime,
		durationMinutes: timerDuration,
		warningShown: timerWarning,
		expired: timerExpired,
		loading: timerLoading,
		error: timerError,
		startTimer,
		cancelTimer,
		stopAlarm,
	} = useParkingTimer();

	const handleDisconnect = useCallback(async () => {
		if (camera.isReady) {
			await camera.releaseCamera();
		}
		await glasses.disconnect();
		router.replace("/");
	}, [camera, glasses, router]);

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<ModeHeader title="Config" subtitle="Settings and tools" />

			{glasses.emulationMode && (
				<Text style={styles.badge}>EMULATION MODE</Text>
			)}

			{/* Parking Timer */}
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Parking Timer</Text>

				{timerExpired ? (
					<View style={styles.timerExpiredContainer}>
						<Text style={styles.timerExpiredText}>TIME'S UP!</Text>
						<Text style={styles.timerExpiredSubtext}>Move your car!</Text>
						<Pressable style={styles.stopAlarmButton} onPress={stopAlarm}>
							<Text style={styles.stopAlarmButtonText}>STOP ALARM</Text>
						</Pressable>
					</View>
				) : timerActive ? (
					<View style={styles.timerActiveContainer}>
						<Text
							style={[
								styles.timerCountdown,
								timerWarning && styles.timerCountdownWarning,
							]}
						>
							{formattedTime}
						</Text>
						{timerWarning && (
							<Text style={styles.timerWarningText}>5 minutes remaining!</Text>
						)}
						<Text style={styles.timerDurationText}>
							{timerDuration} min timer
						</Text>
						<Pressable
							style={[
								styles.cancelTimerButton,
								timerLoading && styles.buttonDisabled,
							]}
							onPress={cancelTimer}
							disabled={timerLoading}
						>
							<Text style={styles.cancelTimerButtonText}>
								{timerLoading ? "Cancelling..." : "Cancel Timer"}
							</Text>
						</Pressable>
					</View>
				) : (
					<TimePicker
						initialHours={1}
						initialMinutes={0}
						maxHours={4}
						onConfirm={startTimer}
						disabled={timerLoading}
					/>
				)}

				{timerError ? <Text style={styles.error}>{timerError}</Text> : null}
			</View>

			{/* Disconnect */}
			<Pressable style={styles.disconnectButton} onPress={handleDisconnect}>
				<Text style={styles.disconnectText}>Disconnect</Text>
			</Pressable>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	scroll: {
		flex: 1,
	},
	scrollContent: {
		padding: 20,
	},
	badge: {
		color: "#ffd700",
		fontSize: 12,
		marginBottom: 16,
	},
	section: {
		backgroundColor: "#222",
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "#fff",
		marginBottom: 12,
	},
	timerExpiredContainer: {
		alignItems: "center",
		padding: 16,
		backgroundColor: "#4a1a1a",
		borderRadius: 12,
		borderWidth: 2,
		borderColor: "#f44",
	},
	timerExpiredText: {
		fontSize: 28,
		fontWeight: "bold",
		color: "#f44",
		marginBottom: 4,
	},
	timerExpiredSubtext: {
		fontSize: 16,
		color: "#faa",
		marginBottom: 16,
	},
	stopAlarmButton: {
		backgroundColor: "#f44",
		borderRadius: 8,
		paddingVertical: 14,
		paddingHorizontal: 32,
	},
	stopAlarmButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "bold",
	},
	timerActiveContainer: {
		alignItems: "center",
		padding: 16,
	},
	timerCountdown: {
		fontSize: 48,
		fontWeight: "bold",
		color: "#4af",
		fontFamily: "monospace",
	},
	timerCountdownWarning: {
		color: "#fa4",
	},
	timerWarningText: {
		fontSize: 14,
		color: "#fa4",
		fontWeight: "600",
		marginTop: 4,
	},
	timerDurationText: {
		fontSize: 13,
		color: "#888",
		marginTop: 8,
		marginBottom: 16,
	},
	cancelTimerButton: {
		backgroundColor: "#444",
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 24,
	},
	cancelTimerButtonText: {
		color: "#aaa",
		fontSize: 14,
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	error: {
		color: "#f66",
		fontSize: 13,
		marginTop: 8,
	},
	disconnectButton: {
		backgroundColor: "transparent",
		borderWidth: 1,
		borderColor: "#a33",
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
		marginTop: 8,
	},
	disconnectText: {
		color: "#f66",
		fontSize: 16,
	},
});
