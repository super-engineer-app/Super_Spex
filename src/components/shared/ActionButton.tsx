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
type ButtonSize = "small" | "default" | "large";

interface ActionButtonProps {
	label: string;
	onPress: () => void;
	variant?: ButtonVariant;
	disabled?: boolean;
	style?: StyleProp<ViewStyle>;
	size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, ViewStyle> = {
	primary: {
		backgroundColor: COLORS.primary,
		borderWidth: 1,
		borderColor: COLORS.primary,
	},
	secondary: {
		backgroundColor: COLORS.secondary,
		borderWidth: 1,
		borderColor: "#D1D5DB",
	},
	danger: {
		backgroundColor: COLORS.destructive,
		borderWidth: 1,
		borderColor: COLORS.destructive,
	},
	success: {
		backgroundColor: COLORS.success,
		borderWidth: 1,
		borderColor: COLORS.success,
	},
};

const variantTextStyles: Record<ButtonVariant, TextStyle> = {
	primary: { color: COLORS.primaryForeground },
	secondary: { color: COLORS.secondaryForeground },
	danger: { color: COLORS.destructiveForeground },
	success: { color: COLORS.successForeground },
};

export function ActionButton({
	label,
	onPress,
	variant = "primary",
	disabled = false,
	style,
	size = "default",
}: ActionButtonProps) {
	const sizeStyle =
		size === "small"
			? styles.buttonSmall
			: size === "large"
				? styles.buttonLarge
				: styles.buttonMedium;

	const textSizeStyle =
		size === "small"
			? styles.textSmall
			: size === "large"
				? styles.textLarge
				: styles.textMedium;

	return (
		<Pressable
			style={({ pressed }) => [
				styles.button,
				sizeStyle,
				variantStyles[variant],
				disabled && styles.disabled,
				pressed && !disabled && styles.pressed,
				style,
			]}
			onPress={onPress}
			disabled={disabled}
		>
			<Text
				style={[
					styles.text,
					textSizeStyle,
					variantTextStyles[variant],
					disabled && styles.disabledText,
				]}
			>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	button: {
		alignItems: "center",
		justifyContent: "center",
	},
	buttonSmall: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
	},
	buttonMedium: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
	},
	buttonLarge: {
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 10,
	},
	disabled: {
		backgroundColor: "#F3F4F6",
		borderColor: "#E5E7EB",
	},
	disabledText: {
		color: COLORS.textMuted,
	},
	pressed: {
		opacity: 0.8,
		transform: [{ scale: 0.98 }],
	},
	text: {
		fontWeight: "500",
		textAlign: "center",
	},
	textSmall: {
		fontSize: 12,
	},
	textMedium: {
		fontSize: 14,
	},
	textLarge: {
		fontSize: 16,
	},
});
