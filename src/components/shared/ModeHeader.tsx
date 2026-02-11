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
		fontSize: 18,
		fontWeight: "700",
		color: COLORS.textPrimary,
	},
	subtitle: {
		fontSize: 13,
		color: COLORS.textTertiary,
		marginTop: 4,
		lineHeight: 16,
	},
});
