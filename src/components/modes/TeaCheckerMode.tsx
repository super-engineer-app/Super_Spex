import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ModeHeader } from "../shared/ModeHeader";

export function TeaCheckerMode() {
	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<ModeHeader title="Tea Checker" subtitle="Analyze your tea" />
			<View style={styles.placeholder}>
				<Text style={styles.placeholderText}>Coming Soon</Text>
				<Text style={styles.placeholderSubtext}>
					This feature is under development
				</Text>
			</View>
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
	placeholder: {
		backgroundColor: "#222",
		borderRadius: 12,
		padding: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	placeholderText: {
		color: "#888",
		fontSize: 24,
		fontWeight: "600",
	},
	placeholderSubtext: {
		color: "#666",
		fontSize: 14,
		marginTop: 8,
	},
});
