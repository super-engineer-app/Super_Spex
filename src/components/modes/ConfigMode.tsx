import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useParkingTimer } from "../../hooks/useParkingTimer";
import { COLORS } from "../../theme";
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
		color: COLORS.warning,
		fontSize: 12,
		marginBottom: 16,
	},
	section: {
		backgroundColor: COLORS.card,
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: COLORS.textPrimary,
		marginBottom: 12,
	},
	timerExpiredContainer: {
		alignItems: "center",
		padding: 16,
		backgroundColor: "#FEF2F2",
		borderRadius: 12,
		borderWidth: 2,
		borderColor: COLORS.destructive,
	},
	timerExpiredText: {
		fontSize: 28,
		fontWeight: "bold",
		color: COLORS.destructive,
		marginBottom: 4,
	},
	timerExpiredSubtext: {
		fontSize: 16,
		color: COLORS.destructive,
		marginBottom: 16,
	},
	stopAlarmButton: {
		backgroundColor: COLORS.destructive,
		borderRadius: 8,
		paddingVertical: 14,
		paddingHorizontal: 32,
	},
	stopAlarmButtonText: {
		color: COLORS.destructiveForeground,
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
		color: COLORS.accent,
		fontFamily: "monospace",
	},
	timerCountdownWarning: {
		color: COLORS.warning,
	},
	timerWarningText: {
		fontSize: 14,
		color: COLORS.warning,
		fontWeight: "600",
		marginTop: 4,
	},
	timerDurationText: {
		fontSize: 13,
		color: COLORS.textSecondary,
		marginTop: 8,
		marginBottom: 16,
	},
	cancelTimerButton: {
		backgroundColor: COLORS.secondary,
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 24,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	cancelTimerButtonText: {
		color: COLORS.textSecondary,
		fontSize: 14,
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	error: {
		color: COLORS.destructive,
		fontSize: 13,
		marginTop: 8,
	},
	disconnectButton: {
		backgroundColor: "transparent",
		borderWidth: 1,
		borderColor: COLORS.destructive,
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
		marginTop: 8,
	},
	disconnectText: {
		color: COLORS.destructive,
		fontSize: 16,
	},
});
