import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../theme";

interface ModeHeaderProps {
	title: string;
	subtitle?: string;
}

export function ModeHeader({ title, subtitle }: ModeHeaderProps) {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>{title}</Text>
			{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 16,
	},
	title: {
		fontSize: 22,
		fontWeight: "bold",
		color: COLORS.textPrimary,
	},
	subtitle: {
		fontSize: 14,
		color: COLORS.textSecondary,
		marginTop: 4,
	},
});
