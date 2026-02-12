import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Image,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	useWindowDimensions,
	View,
} from "react-native";
import { COLORS } from "../src/theme";
import { getCookie } from "../src/utils/cookies";

const IMAGE_URL =
	"https://pub-804a3b17f3a543eeaf93c26368b87df3.r2.dev/Spex-2.jpg";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
if (!BACKEND_URL) {
	throw new Error("EXPO_PUBLIC_BACKEND_URL is not set — check your .env");
}

export default function AuthScreen() {
	const router = useRouter();
	const { width } = useWindowDimensions();
	const isWide = width > 800;

	const [name, setName] = useState("");
	const [orgName, setOrgName] = useState("");
	const [loading, setLoading] = useState(false);

	// If cookies already exist, skip straight to home
	useEffect(() => {
		const hasSession =
			getCookie("name") &&
			getCookie("user_id") &&
			getCookie("organisation_id") &&
			getCookie("organisation_name");
		if (hasSession) {
			router.replace("/home");
		}
	}, []);

	const showError = (msg: string) => {
		if (Platform.OS === "web") {
			window.alert(msg);
		} else {
			Alert.alert("Error", msg);
		}
	};

	const handleSignUp = async () => {
		if (!name.trim() || !orgName.trim()) {
			showError("Please fill in all fields");
			return;
		}
		setLoading(true);
		try {
			const res = await fetch(`${BACKEND_URL}/auth/signup`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					name: name.trim(),
					organisation_name: orgName.trim(),
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				showError(data.detail ?? "Sign up failed");
				return;
			}
			router.replace("/home");
		} catch (e: any) {
			showError(e.message ?? "Network error");
		} finally {
			setLoading(false);
		}
	};

	return (
		<View style={styles.root}>
			{/* Form half */}
			<View style={[styles.formHalf, !isWide && styles.formFull]}>
				<View style={styles.formContainer}>
					<Text style={styles.title}>Create a Demo Account</Text>

					<TextInput
						style={styles.input}
						placeholder="Name"
						value={name}
						onChangeText={setName}
						placeholderTextColor={COLORS.textMuted}
						autoCapitalize="words"
					/>
					<TextInput
						style={styles.input}
						placeholder="Organisation name"
						value={orgName}
						onChangeText={setOrgName}
						placeholderTextColor={COLORS.textMuted}
						autoCapitalize="words"
					/>
					<Pressable
						style={({ pressed }) => [
							styles.primaryButton,
							pressed && styles.buttonPressed,
						]}
						onPress={handleSignUp}
						disabled={loading}
					>
						{loading ? (
							<ActivityIndicator color={COLORS.primaryForeground} />
						) : (
							<Text style={styles.buttonText}>Sign up</Text>
						)}
					</Pressable>
				</View>
			</View>

			{/* Image half — only shown on wide screens */}
			{isWide && (
				<View style={styles.imageHalf}>
					<Image
						source={{ uri: IMAGE_URL }}
						style={StyleSheet.absoluteFill}
						resizeMode="contain"
					/>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		flexDirection: "row",
		backgroundColor: COLORS.background,
	},
	imageHalf: {
		width: "50%",
		height: "100%",
		backgroundColor: "#0A0A0A",
		overflow: "hidden",
	},
	formHalf: {
		width: "50%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
		padding: 32,
	},
	formFull: {
		width: "100%",
		flex: 1,
	},
	formContainer: {
		width: "100%",
		maxWidth: 380,
	},
	title: {
		fontSize: 28,
		fontWeight: "700",
		color: COLORS.textPrimary,
		marginBottom: 32,
	},
	input: {
		borderWidth: 1,
		borderColor: COLORS.border,
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 14,
		fontSize: 15,
		color: COLORS.textPrimary,
		backgroundColor: COLORS.background,
		marginBottom: 14,
		...(Platform.OS === "web"
			? ({ outlineStyle: "none" } as Record<string, string>)
			: {}),
	},
	primaryButton: {
		backgroundColor: COLORS.primary,
		borderRadius: 8,
		paddingVertical: 13,
		alignItems: "center",
		marginTop: 4,
		marginBottom: 20,
	},
	buttonPressed: {
		opacity: 0.85,
		transform: [{ scale: 0.98 }],
	},
	buttonText: {
		color: COLORS.primaryForeground,
		fontSize: 15,
		fontWeight: "600",
	},
});
