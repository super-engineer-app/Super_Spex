import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../theme";

interface RecordingIndicatorProps {
	label?: string;
}

export function RecordingIndicator({
	label = "Recording...",
}: RecordingIndicatorProps) {
	const opacity = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		const animation = Animated.loop(
			Animated.sequence([
				Animated.timing(opacity, {
					toValue: 0.2,
					duration: 500,
					useNativeDriver: true,
				}),
				Animated.timing(opacity, {
					toValue: 1,
					duration: 500,
					useNativeDriver: true,
				}),
			]),
		);
		animation.start();
		return () => animation.stop();
	}, [opacity]);

	return (
		<View style={styles.container}>
			<Animated.View style={[styles.dot, { opacity }]} />
			<Text style={styles.text}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginVertical: 8,
	},
	dot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		backgroundColor: COLORS.destructive,
	},
	text: {
		color: COLORS.destructive,
		fontSize: 14,
		fontWeight: "600",
	},
});
