import { Pressable, StyleSheet, Text, View } from "react-native";

interface AIResponseDisplayProps {
	response: string;
	status: string | null;
	error: string | null;
	isSending: boolean;
	onClear: () => void;
}

export function AIResponseDisplay({
	response,
	status,
	error,
	isSending,
	onClear,
}: AIResponseDisplayProps) {
	// Nothing to show
	if (!response && !error && !status && !isSending) return null;

	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>AI Response</Text>
			{error ? (
				<Text style={styles.error}>{error}</Text>
			) : (
				<>
					{status && !response ? (
						<Text style={styles.statusText}>{status}</Text>
					) : null}
					{response ? (
						<View style={styles.resultBox}>
							<Text style={styles.resultText}>{response}</Text>
						</View>
					) : !status ? (
						<Text style={styles.loadingText}>Waiting for response...</Text>
					) : null}
				</>
			)}
			{response ? (
				<Pressable style={styles.clearButton} onPress={onClear}>
					<Text style={styles.clearButtonText}>Clear Response</Text>
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	section: {
		backgroundColor: "#222",
		borderRadius: 12,
		padding: 16,
		marginTop: 12,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "#fff",
		marginBottom: 12,
	},
	resultBox: {
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 12,
	},
	resultText: {
		color: "#fff",
		fontSize: 16,
	},
	error: {
		color: "#f66",
		fontSize: 13,
	},
	loadingText: {
		color: "#888",
		fontSize: 14,
		fontStyle: "italic",
	},
	statusText: {
		color: "#4af",
		fontSize: 14,
		fontStyle: "italic",
	},
	clearButton: {
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 10,
		alignItems: "center",
		marginTop: 12,
	},
	clearButtonText: {
		color: "#aaa",
		fontSize: 14,
	},
});
