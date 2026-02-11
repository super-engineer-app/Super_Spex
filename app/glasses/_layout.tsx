import { Stack } from "expo-router";
import { COLORS } from "../../src/theme";

/**
 * Layout component for the glasses section.
 *
 * Provides nested navigation for glasses-related screens
 * including dashboard, display controls, and input events.
 */
export default function GlassesLayout() {
	return (
		<Stack
			screenOptions={{
				headerStyle: {
					backgroundColor: COLORS.background,
				},
				headerTintColor: COLORS.foreground,
				headerTitleStyle: {
					fontWeight: "600",
				},
				contentStyle: {
					backgroundColor: COLORS.background,
				},
			}}
		>
			<Stack.Screen
				name="index"
				options={{
					headerShown: false,
				}}
			/>
			<Stack.Screen
				name="display"
				options={{
					title: "Display Controls",
				}}
			/>
			<Stack.Screen
				name="input"
				options={{
					title: "Input Events",
				}}
			/>
		</Stack>
	);
}
