import { StyleSheet, Text, View } from "react-native";

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
		color: "#fff",
	},
	subtitle: {
		fontSize: 14,
		color: "#888",
		marginTop: 4,
	},
});
