import { Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../theme";

interface AIResponseDisplayProps {
	response: string;
	status: string | null;
	error: string | null;
	isSending: boolean;
	onClear: () => void;
	alwaysShow?: boolean;
}

export function AIResponseDisplay({
	response,
	status,
	error,
	isSending,
	onClear,
	alwaysShow = false,
}: AIResponseDisplayProps) {
	const hasContent = response || error || status || isSending;

	if (!hasContent && !alwaysShow) return null;

	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>Response</Text>
			{error ? (
				<Text style={styles.error}>{error}</Text>
			) : hasContent ? (
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
			) : (
				<View style={styles.resultBox}>
					<Text style={styles.placeholderText}>Thinking . . .</Text>
				</View>
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
		backgroundColor: COLORS.card,
		borderRadius: 12,
		padding: 16,
		marginTop: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: COLORS.textPrimary,
		marginBottom: 12,
	},
	resultBox: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		padding: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
		minHeight: 80,
	},
	resultText: {
		color: COLORS.textPrimary,
		fontSize: 16,
	},
	placeholderText: {
		color: COLORS.textMuted,
		fontSize: 14,
	},
	error: {
		color: COLORS.destructive,
		fontSize: 13,
	},
	loadingText: {
		color: COLORS.textMuted,
		fontSize: 14,
		fontStyle: "italic",
	},
	statusText: {
		color: COLORS.info,
		fontSize: 14,
		fontStyle: "italic",
	},
	clearButton: {
		backgroundColor: COLORS.secondary,
		borderRadius: 8,
		padding: 10,
		alignItems: "center",
		marginTop: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	clearButtonText: {
		color: COLORS.sidebarText,
		fontSize: 14,
	},
});
