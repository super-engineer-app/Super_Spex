import {
	Pressable,
	type StyleProp,
	StyleSheet,
	Text,
	type ViewStyle,
} from "react-native";

type ButtonVariant = "primary" | "secondary" | "danger" | "success";

interface ActionButtonProps {
	label: string;
	onPress: () => void;
	variant?: ButtonVariant;
	disabled?: boolean;
	style?: StyleProp<ViewStyle>;
}

const variantStyles: Record<ButtonVariant, ViewStyle> = {
	primary: { backgroundColor: "#07f" },
	secondary: { backgroundColor: "#444" },
	danger: { backgroundColor: "#a33" },
	success: { backgroundColor: "#2a7a2a" },
};

export function ActionButton({
	label,
	onPress,
	variant = "primary",
	disabled = false,
	style,
}: ActionButtonProps) {
	return (
		<Pressable
			style={[
				styles.button,
				variantStyles[variant],
				disabled && styles.disabled,
				style,
			]}
			onPress={onPress}
			disabled={disabled}
		>
			<Text style={styles.text}>{label}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	button: {
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
	},
	disabled: {
		opacity: 0.5,
	},
	text: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
});
