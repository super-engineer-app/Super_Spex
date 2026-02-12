import { useCallback, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";

import { useTeaChecker } from "../../hooks/useTeaChecker";
import { getCookie } from "../../utils/cookies";
import { COLORS } from "../../theme";
import { ImagePlus } from "lucide-react-native";
import { ActionButton } from "../shared/ActionButton";
import { ModeHeader } from "../shared/ModeHeader";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface TeaMember {
	name: string;
	hex: string;
	lightness: number;
	image_url: string;
}

export function TeaCheckerMode() {
	const {
		prefImage,
		setPrefImage,
		prefLoading,
		prefResult,
		prefError,
		submitPreference,

		checkImage,
		setCheckImage,
		checkWhoseTea,
		setCheckWhoseTea,
		checkLoading,
		checkMessages,
		checkError,
		submitCheckTea,

		pickImage,
		takePhoto,
	} = useTeaChecker();

	const [dbMembers, setDbMembers] = useState<TeaMember[]>([]);
	const [dbLoading, setDbLoading] = useState(false);
	const [dbError, setDbError] = useState("");
	const [selectedMember, setSelectedMember] = useState<TeaMember | null>(null);

	const fetchTeaDatabase = useCallback(async () => {
		const orgId = getCookie("organisation_id");
		if (!orgId) {
			setDbError("No organisation found — please sign up first");
			return;
		}
		setDbLoading(true);
		setDbError("");
		try {
			const res = await fetch(
				`${BACKEND_URL}/memes/tea-database?organisation_id=${orgId}`,
				{ credentials: "include" },
			);
			if (!res.ok) {
				const err = await res.json().catch(() => ({ detail: res.statusText }));
				throw new Error(err.detail || "Request failed");
			}
			const data: TeaMember[] = await res.json();
			setDbMembers(data);
		} catch (e: unknown) {
			setDbError(e instanceof Error ? e.message : "Unknown error");
		} finally {
			setDbLoading(false);
		}
	}, []);

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
		>
			<ModeHeader title="Auto Tea Checker" subtitle="Share your tea with your organisation" />
			<View style={styles.panels}>
				{/* Left Panel — Tea Preference */}
				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Tea Preference</Text>

					{prefImage ? (
						<Pressable onPress={() => pickImage(setPrefImage)}>
							<Image source={{ uri: prefImage.uri }} style={styles.thumbnail} />
						</Pressable>
					) : (
						<Pressable
							style={styles.imagePlaceholder}
							onPress={() => pickImage(setPrefImage)}
						>
							<ImagePlus size={32} color={COLORS.textMuted} />
							<Text style={styles.placeholderText}>Pick Image</Text>
						</Pressable>
					)}
					<ActionButton
						label="Take Photo Instead"
						onPress={() => takePhoto(setPrefImage)}
						variant="secondary"
					/>

					<ActionButton
						label={prefLoading ? "Submitting..." : "Submit"}
						onPress={submitPreference}
						disabled={prefLoading || !prefImage}
					/>

					{prefResult && (
						<View style={styles.resultBox}>
							<View style={styles.resultRow}>
								<Text style={styles.resultValue}>
									Tea preference set for you {getCookie("name")}! (
								</Text>
								<View
									style={[
										styles.colorSwatch,
										{ backgroundColor: prefResult.hex },
									]}
								/>
								<Text style={styles.resultValue}>)</Text>
							</View>
						</View>
					)}
					{prefError ? <Text style={styles.errorText}>{prefError}</Text> : null}
				</View>

				{/* Right Panel — Check Someone's Tea */}
				<View style={styles.panel}>
					<Text style={styles.panelTitle}>Check Someone's Tea</Text>

					{checkImage ? (
						<Pressable onPress={() => pickImage(setCheckImage)}>
							<Image source={{ uri: checkImage.uri }} style={styles.thumbnail} />
						</Pressable>
					) : (
						<Pressable
							style={styles.imagePlaceholder}
							onPress={() => pickImage(setCheckImage)}
						>
							<ImagePlus size={32} color={COLORS.textMuted} />
							<Text style={styles.placeholderText}>Pick Image</Text>
						</Pressable>
					)}
					<ActionButton
						label="Take Photo Instead"
						onPress={() => takePhoto(setCheckImage)}
						variant="secondary"
					/>

					<TextInput
						style={styles.input}
						placeholder="Whose tea? (e.g. Check Dev User's tea)"
						placeholderTextColor={COLORS.textMuted}
						value={checkWhoseTea}
						onChangeText={setCheckWhoseTea}
					/>

					<ActionButton
						label={checkLoading ? "Checking..." : "Check Tea"}
						onPress={submitCheckTea}
						disabled={
							checkLoading ||
							!checkImage ||
							!checkWhoseTea
						}
					/>

					{checkMessages.length > 0 && (
						<View style={styles.resultBox}>
							{checkMessages.map((msg) => (
								<Text key={msg} style={styles.resultValue}>
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

			{/* Organisation Tea Database */}
			<View style={[styles.panel, styles.dbPanel]}>
				<Text style={styles.panelTitle}>Organisation Tea Database</Text>
				<Pressable
					onPress={fetchTeaDatabase}
					disabled={dbLoading}
					style={styles.reloadRow}
				>
					{dbLoading ? (
						<ActivityIndicator size="small" color={COLORS.textMuted} />
					) : null}
					<Text style={styles.reloadText}>Reload</Text>
				</Pressable>

				{dbMembers.length > 0 && (
					<View style={styles.chipContainer}>
						{dbMembers.map((member) => (
							<Pressable
								key={member.name}
								style={styles.chip}
								onPress={() => setSelectedMember(member)}
							>
								<Text style={styles.chipText}>
									{member.name.split(" ")[0]}
								</Text>
							</Pressable>
						))}
					</View>
				)}

				{!dbLoading && dbMembers.length === 0 && !dbError && (
					<Text style={styles.emptyText}>
						No tea preferences found for your organisation yet.
					</Text>
				)}

				{dbError ? (
					<Text style={styles.errorText}>{dbError}</Text>
				) : null}
			</View>
			{/* Tea photo popup */}
			{selectedMember && (
				<Modal
					visible
					transparent
					animationType="none"
					onRequestClose={() => setSelectedMember(null)}
				>
					<Pressable
						style={styles.modalBackdrop}
						onPress={() => setSelectedMember(null)}
					>
						<View style={styles.modalCard}>
							<Image
								source={{ uri: selectedMember.image_url }}
								style={styles.modalImage}
								resizeMode="cover"
							/>
						</View>
					</Pressable>
				</Modal>
			)}
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
	panels: {
		flexDirection: "row",
		gap: 16,
	},
	panel: {
		flex: 1,
		backgroundColor: COLORS.card,
		borderRadius: 12,
		padding: 16,
		gap: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
		shadowColor: COLORS.shadow,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 8,
		elevation: 3,
	},
	panelTitle: {
		color: COLORS.textPrimary,
		fontSize: 15,
		fontWeight: "600",
		marginBottom: 4,
	},
	buttonRow: {
		flexDirection: "row",
		gap: 8,
	},
	thumbnail: {
		width: "100%",
		height: 160,
		borderRadius: 8,
		resizeMode: "cover",
	},
	imagePlaceholder: {
		width: "100%",
		height: 160,
		borderRadius: 8,
		backgroundColor: COLORS.backgroundSecondary,
		borderWidth: 1,
		borderColor: COLORS.border,
		justifyContent: "center",
		alignItems: "center",
		gap: 8,
	},
	placeholderText: {
		color: COLORS.textMuted,
		fontSize: 13,
	},
	input: {
		backgroundColor: COLORS.background,
		borderRadius: 8,
		padding: 12,
		color: COLORS.textPrimary,
		fontSize: 14,
		borderWidth: 1,
		borderColor: COLORS.input,
	},
	resultBox: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		padding: 12,
		gap: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	resultRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	resultLabel: {
		color: COLORS.textTertiary,
		fontSize: 13,
	},
	resultValue: {
		color: COLORS.textPrimary,
		fontSize: 14,
	},
	colorSwatch: {
		width: 20,
		height: 20,
		borderRadius: 4,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	errorText: {
		color: COLORS.destructive,
		fontSize: 13,
	},
	dbPanel: {
		marginTop: 16,
	},
	dbHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	reloadRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	reloadText: {
		color: COLORS.textTertiary,
		fontSize: 12,
	},
	chipContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	chip: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	chipText: {
		color: COLORS.textPrimary,
		fontSize: 14,
		fontWeight: "600",
	},
	emptyText: {
		color: COLORS.textMuted,
		fontSize: 13,
		textAlign: "center" as const,
	},
	modalBackdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.8)",
		justifyContent: "center",
		alignItems: "center",
	},
	modalCard: {
		width: 560,
		height: 620,
		borderRadius: 12,
		overflow: "hidden",
	},
	modalImage: {
		width: "100%",
		height: "100%",
	},
});
