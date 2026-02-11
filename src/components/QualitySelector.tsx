import { Pressable, StyleSheet, Text, View } from "react-native";
import type { StreamQuality } from "../../modules/xr-glasses";
import { QUALITY_OPTIONS } from "../hooks/useRemoteView";
import { COLORS } from "../theme";

interface QualitySelectorProps {
	value: StreamQuality;
	onChange: (quality: StreamQuality) => void;
	disabled?: boolean;
}

const QUALITY_KEYS: StreamQuality[] = [
	"low_latency",
	"balanced",
	"high_quality",
];

/**
 * Quality selector component for Remote View streaming.
 *
 * Displays three quality options as radio-style buttons with
 * descriptions to help users understand the tradeoffs.
 */
export function QualitySelector({
	value,
	onChange,
	disabled,
}: QualitySelectorProps) {
	return (
		<View style={styles.container}>
			<Text style={styles.label}>Quality</Text>
			<View style={styles.options}>
				{QUALITY_KEYS.map((quality) => {
					const option = QUALITY_OPTIONS[quality];
					const isSelected = value === quality;

					return (
						<Pressable
							key={quality}
							style={[
								styles.option,
								isSelected && styles.optionSelected,
								disabled && styles.optionDisabled,
							]}
							onPress={() => !disabled && onChange(quality)}
							disabled={disabled}
						>
							<View style={styles.optionContent}>
								<View style={styles.radio}>
									{isSelected && <View style={styles.radioInner} />}
								</View>
								<View style={styles.textContainer}>
									<Text
										style={[
											styles.optionLabel,
											isSelected && styles.optionLabelSelected,
										]}
									>
										{option.label}
									</Text>
									<Text style={styles.optionDescription}>
										{option.description}
									</Text>
								</View>
							</View>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 12,
	},
	label: {
		color: COLORS.textTertiary,
		fontSize: 12,
		marginBottom: 8,
	},
	options: {
		gap: 8,
	},
	option: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		padding: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	optionSelected: {
		borderColor: COLORS.primary,
		backgroundColor: COLORS.secondary,
	},
	optionDisabled: {
		opacity: 0.6,
	},
	optionContent: {
		flexDirection: "row",
		alignItems: "center",
	},
	radio: {
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 2,
		borderColor: COLORS.input,
		marginRight: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	radioInner: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: COLORS.primary,
	},
	textContainer: {
		flex: 1,
	},
	optionLabel: {
		color: COLORS.textPrimary,
		fontSize: 14,
		fontWeight: "600",
	},
	optionLabelSelected: {
		color: COLORS.primary,
	},
	optionDescription: {
		color: COLORS.textTertiary,
		fontSize: 12,
		marginTop: 2,
	},
});
