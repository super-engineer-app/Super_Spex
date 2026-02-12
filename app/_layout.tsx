import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initializeErrorReporting } from "../src/services";
import { COLORS } from "../src/theme";

export default function RootLayout() {
	useEffect(() => {
		initializeErrorReporting();
	}, []);

	return (
		<SafeAreaProvider>
			<View style={styles.container}>
				<StatusBar style="dark" />
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
						animation: "slide_from_right",
					}}
				>
				<Stack.Screen
					name="index"
					options={{
						headerShown: false,
					}}
				/>
				<Stack.Screen
					name="home"
					options={{
						title: "XR Glasses",
						headerShown: true,
					}}
				/>
				<Stack.Screen
					name="connect"
						options={{
							title: "Connect",
							presentation: "modal",
						}}
					/>
					<Stack.Screen
						name="glasses"
						options={{
							headerShown: false,
						}}
					/>
				</Stack>
			</View>
		</SafeAreaProvider>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: COLORS.background,
	},
});
