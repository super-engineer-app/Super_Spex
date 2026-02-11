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
type ButtonSize = "default" | "small";

interface ActionButtonProps {
	label: string;
	onPress: () => void;
	variant?: ButtonVariant;
	disabled?: boolean;
	style?: StyleProp<ViewStyle>;
	size?: ButtonSize;
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
	size = "default",
}: ActionButtonProps) {
	return (
		<Pressable
			style={[
				styles.button,
				variantStyles[variant],
				size === "small" && styles.buttonSmall,
				disabled && styles.disabled,
				style,
			]}
			onPress={onPress}
			disabled={disabled}
		>
			<Text
				style={[
					styles.text,
					variantTextStyles[variant],
					size === "small" && styles.textSmall,
				]}
			>
				{label}
			</Text>
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
	buttonSmall: {
		paddingVertical: 8,
		paddingHorizontal: 12,
	},
	disabled: {
		opacity: 0.6,
	},
	text: {
		fontSize: 16,
		fontWeight: "600",
	},
	textSmall: {
		fontSize: 13,
	},
});
