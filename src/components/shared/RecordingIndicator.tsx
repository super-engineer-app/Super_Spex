import { StyleSheet, Text, View } from "react-native";

interface RecordingIndicatorProps {
	label?: string;
}

export function RecordingIndicator({
	label = "Recording...",
}: RecordingIndicatorProps) {
	return (
		<View style={styles.container}>
			<View style={styles.dot} />
			<Text style={styles.text}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginVertical: 8,
	},
	dot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		backgroundColor: "#f44",
	},
	text: {
		color: "#f88",
		fontSize: 16,
		fontWeight: "600",
	},
});
