import {
	Pressable,
	type StyleProp,
	StyleSheet,
	Text,
	type TextStyle,
	type ViewStyle,
} from "react-native";
import { COLORS } from "../../theme";

type ButtonVariant = "primary" | "secondary" | "danger" | "success";

interface ActionButtonProps {
	label: string;
	onPress: () => void;
	variant?: ButtonVariant;
	disabled?: boolean;
	style?: StyleProp<ViewStyle>;
}

const variantStyles: Record<ButtonVariant, ViewStyle> = {
	primary: { backgroundColor: COLORS.primary },
	secondary: {
		backgroundColor: COLORS.secondary,
		borderWidth: 1,
		borderColor: COLORS.input,
	},
	danger: { backgroundColor: COLORS.destructive },
	success: { backgroundColor: COLORS.success },
};

const variantTextStyles: Record<ButtonVariant, TextStyle> = {
	primary: { color: COLORS.primaryForeground },
	secondary: { color: COLORS.sidebarText },
	danger: { color: COLORS.destructiveForeground },
	success: { color: COLORS.successForeground },
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
			<Text style={[styles.text, variantTextStyles[variant]]}>{label}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	button: {
		borderRadius: 6,
		paddingVertical: 12,
		paddingHorizontal: 16,
		alignItems: "center",
	},
	disabled: {
		opacity: 0.6,
	},
	text: {
		fontSize: 16,
		fontWeight: "600",
	},
});
