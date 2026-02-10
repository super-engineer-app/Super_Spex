import {
	Image,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { ModeHeader } from "../shared/ModeHeader";
import { ActionButton } from "../shared/ActionButton";
import { useTeaChecker } from "../../hooks/useTeaChecker";

export function TeaCheckerMode() {
	const {
		prefImage,
		setPrefImage,
		prefUserId,
		setPrefUserId,
		prefOrgId,
		setPrefOrgId,
		prefLoading,
		prefResult,
		prefError,
		submitPreference,

		checkImage,
		setCheckImage,
		checkUserId,
		setCheckUserId,
		checkWhoseTea,
		setCheckWhoseTea,
		checkOrgId,
		setCheckOrgId,
		checkLoading,
		checkMessages,
		checkError,
		submitCheckTea,

		pickImage,
	} = useTeaChecker();

	// Platform guard — getReader() only available in browsers
	if (Platform.OS !== "web") {
		return (
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
			>
				<ModeHeader title="Tea Checker" subtitle="Analyze your tea" />
				<View style={styles.placeholder}>
					<Text style={styles.placeholderText}>Web Only</Text>
					<Text style={styles.placeholderSubtext}>
						This feature is only available in the browser
					</Text>
				</View>
			</ScrollView>
		);
	}

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<ModeHeader title="Tea Checker" subtitle="Analyze your tea" />
			<View style={styles.panels}>
				{/* Left Panel — Tea Preference */}
				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Tea Preference</Text>

					<ActionButton
						label={prefImage ? "Change Image" : "Pick Image"}
						onPress={() => pickImage(setPrefImage)}
						variant="secondary"
					/>
					{prefImage && (
						<Image
							source={{ uri: prefImage.uri }}
							style={styles.thumbnail}
						/>
					)}

					<TextInput
						style={styles.input}
						placeholder="User ID"
						placeholderTextColor="#666"
						value={prefUserId}
						onChangeText={setPrefUserId}
						keyboardType="numeric"
					/>
					<TextInput
						style={styles.input}
						placeholder="Organization ID (optional)"
						placeholderTextColor="#666"
						value={prefOrgId}
						onChangeText={setPrefOrgId}
						keyboardType="numeric"
					/>

					<ActionButton
						label={prefLoading ? "Submitting..." : "Submit"}
						onPress={submitPreference}
						disabled={prefLoading || !prefImage || !prefUserId}
					/>

					{prefResult && (
						<View style={styles.resultBox}>
							<View style={styles.resultRow}>
								<Text style={styles.resultLabel}>Hex:</Text>
								<View
									style={[
										styles.colorSwatch,
										{ backgroundColor: prefResult.hex },
									]}
								/>
								<Text style={styles.resultValue}>
									{prefResult.hex}
								</Text>
							</View>
							<View style={styles.resultRow}>
								<Text style={styles.resultLabel}>
									Lightness:
								</Text>
								<Text style={styles.resultValue}>
									{prefResult.lightness}
								</Text>
							</View>
						</View>
					)}
					{prefError ? (
						<Text style={styles.errorText}>{prefError}</Text>
					) : null}
				</View>

				{/* Right Panel — Check Someone's Tea */}
				<View style={styles.panel}>
					<Text style={styles.panelTitle}>
						Check Someone's Tea
					</Text>

					<ActionButton
						label={checkImage ? "Change Image" : "Pick Image"}
						onPress={() => pickImage(setCheckImage)}
						variant="secondary"
					/>
					{checkImage && (
						<Image
							source={{ uri: checkImage.uri }}
							style={styles.thumbnail}
						/>
					)}

					<TextInput
						style={styles.input}
						placeholder="User ID"
						placeholderTextColor="#666"
						value={checkUserId}
						onChangeText={setCheckUserId}
						keyboardType="numeric"
					/>
					<TextInput
						style={styles.input}
						placeholder="Whose tea? (e.g. Check Dev User's tea)"
						placeholderTextColor="#666"
						value={checkWhoseTea}
						onChangeText={setCheckWhoseTea}
					/>
					<TextInput
						style={styles.input}
						placeholder="Organization ID"
						placeholderTextColor="#666"
						value={checkOrgId}
						onChangeText={setCheckOrgId}
						keyboardType="numeric"
					/>

					<ActionButton
						label={checkLoading ? "Checking..." : "Check Tea"}
						onPress={submitCheckTea}
						disabled={
							checkLoading ||
							!checkImage ||
							!checkUserId ||
							!checkWhoseTea ||
							!checkOrgId
						}
					/>

					{checkMessages.length > 0 && (
						<View style={styles.resultBox}>
							{checkMessages.map((msg, i) => (
								<Text
									key={`msg-${i}`}
									style={styles.resultValue}
								>
									{msg}
								</Text>
							))}
						</View>
					)}
					{checkError ? (
						<Text style={styles.errorText}>{checkError}</Text>
					) : null}
				</View>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	scroll: {
		flex: 1,
	},
	scrollContent: {
		padding: 20,
	},
	placeholder: {
		backgroundColor: "#222",
		borderRadius: 12,
		padding: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	placeholderText: {
		color: "#888",
		fontSize: 24,
		fontWeight: "600",
	},
	placeholderSubtext: {
		color: "#666",
		fontSize: 14,
		marginTop: 8,
	},
	panels: {
		flexDirection: "row",
		gap: 16,
	},
	panel: {
		flex: 1,
		backgroundColor: "#222",
		borderRadius: 12,
		padding: 16,
		gap: 12,
	},
	panelTitle: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "700",
		marginBottom: 4,
	},
	thumbnail: {
		width: "100%",
		height: 160,
		borderRadius: 8,
		resizeMode: "cover",
	},
	input: {
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 12,
		color: "#fff",
		fontSize: 14,
	},
	resultBox: {
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 12,
		gap: 8,
	},
	resultRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	resultLabel: {
		color: "#888",
		fontSize: 14,
	},
	resultValue: {
		color: "#fff",
		fontSize: 14,
	},
	colorSwatch: {
		width: 20,
		height: 20,
		borderRadius: 4,
		borderWidth: 1,
		borderColor: "#555",
	},
	errorText: {
		color: "#f66",
		fontSize: 13,
	},
});
