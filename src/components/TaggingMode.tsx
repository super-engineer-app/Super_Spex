import { Plus, Trash2, X } from "lucide-react-native";
import {
	ActivityIndicator,
	Image,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { COLORS } from "../theme";
import type { TaggedImage } from "../types/tagging";
import { ActionButton } from "./shared/ActionButton";

const MAX_IMAGES = 6;

interface TaggingModeProps {
	isActive: boolean;
	transcript: string;
	images: TaggedImage[];
	isSaving: boolean;
	error: string | null;
	statusMessage: string | null;
	isGlassesCameraReady: boolean;
	isGlassesCapturing: boolean;
	isRecordingAudio: boolean;
	tabToggle?: React.ReactNode;
	onStartTagging: () => void;
	onCancelTagging: () => void;
	onSaveTagging: () => void;
	onCaptureFromGlasses: () => void;
	onCaptureFromPhone: () => void;
	onPickFromGallery: () => void;
	onRemoveImage: (index: number) => void;
	onEditTranscript: (text: string) => void;
	onToggleRecordNote: () => void;
}

export function TaggingMode({
	isActive,
	transcript,
	images,
	isSaving,
	error,
	statusMessage,
	isGlassesCapturing,
	isRecordingAudio,
	tabToggle,
	onStartTagging,
	onCancelTagging,
	onSaveTagging,
	onCaptureFromPhone,
	onRemoveImage,
	onEditTranscript,
	onToggleRecordNote,
}: TaggingModeProps) {
	// Auto-start tagging if not active
	if (!isActive) {
		onStartTagging();
		return null;
	}

	const hasPhotos = images.length > 0;
	const canTakeMore = images.length < MAX_IMAGES;

	// Build 6-slot grid with stable keys
	const SLOT_KEYS = ["s0", "s1", "s2", "s3", "s4", "s5"] as const;

	return (
		<>
			<View style={styles.row}>
				<View style={styles.gridColumn}>
					<View style={styles.imageGrid}>
						{SLOT_KEYS.map((key, i) => {
							const slot = images[i] || null;
							return (
								<View key={key} style={styles.imageSlot}>
									{slot ? (
										<>
											<Image
												source={{
													uri: `data:image/jpeg;base64,${slot.base64}`,
												}}
												style={styles.imageThumbnail}
											/>
											<Pressable
												style={styles.removeButton}
												onPress={() => onRemoveImage(i)}
											>
												<X size={12} color={COLORS.destructiveForeground} />
											</Pressable>
										</>
									) : i === images.length && canTakeMore ? (
										<Plus size={24} color={COLORS.textMuted} />
									) : (
										<View style={styles.emptySlot} />
									)}
								</View>
							);
						})}
					</View>
				</View>

				<View style={styles.buttonsColumn}>
					{tabToggle}
					<ActionButton
						label={isRecordingAudio ? "Stop" : "Record note"}
						onPress={onToggleRecordNote}
						variant={isRecordingAudio ? "danger" : "secondary"}
					/>
					<ActionButton
						label={
							isGlassesCapturing
								? "Capturing..."
								: hasPhotos
									? "New photo"
									: "Take photo"
						}
						onPress={onCaptureFromPhone}
						variant="secondary"
						disabled={isGlassesCapturing || !canTakeMore}
					/>
					<View style={styles.saveRow}>
						{isSaving ? (
							<View style={[styles.savingContainer, styles.saveButton]}>
								<ActivityIndicator
									color={COLORS.primaryForeground}
									size="small"
								/>
							</View>
						) : (
							<ActionButton
								label="Save"
								onPress={onSaveTagging}
								variant="secondary"
								disabled={!hasPhotos || !transcript.trim()}
								style={styles.saveButton}
							/>
						)}
						<Pressable style={styles.trashButton} onPress={onCancelTagging}>
							<Trash2 size={18} color={COLORS.textSecondary} />
						</Pressable>
					</View>
				</View>
			</View>

			{statusMessage ? (
				<Text style={styles.statusText}>{statusMessage}</Text>
			) : null}

			{error ? <Text style={styles.errorText}>{error}</Text> : null}

			<View style={styles.noteSection}>
				<Text style={styles.noteLabel}>Your note</Text>
				<TextInput
					style={styles.noteInput}
					value={transcript}
					onChangeText={onEditTranscript}
					placeholder="Transcribing . . ."
					placeholderTextColor={COLORS.textMuted}
					multiline
					textAlignVertical="top"
				/>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		gap: 16,
		alignItems: "flex-start",
	},
	gridColumn: {
		flex: 3,
	},
	buttonsColumn: {
		flex: 2,
		gap: 12,
	},
	imageGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		marginVertical: 8,
	},
	imageSlot: {
		width: "30%",
		aspectRatio: 1,
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		position: "relative",
	},
	imageThumbnail: {
		width: "100%",
		height: "100%",
		borderRadius: 8,
	},
	removeButton: {
		position: "absolute",
		top: 2,
		right: 2,
		backgroundColor: COLORS.destructive,
		width: 20,
		height: 20,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	emptySlot: {
		width: "100%",
		height: "100%",
		backgroundColor: COLORS.backgroundSecondary,
	},
	saveRow: {
		flexDirection: "row",
		gap: 8,
	},
	saveButton: {
		flex: 1,
	},
	savingContainer: {
		backgroundColor: COLORS.secondary,
		borderRadius: 8,
		paddingVertical: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	trashButton: {
		backgroundColor: COLORS.secondary,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: "#D1D5DB",
	},
	statusText: {
		color: COLORS.info,
		fontSize: 13,
		marginTop: 8,
	},
	errorText: {
		color: COLORS.destructive,
		fontSize: 13,
		marginTop: 8,
	},
	noteSection: {
		marginTop: 16,
	},
	noteLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: COLORS.textPrimary,
		marginBottom: 8,
	},
	noteInput: {
		backgroundColor: COLORS.backgroundSecondary,
		borderRadius: 8,
		padding: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
		color: COLORS.textPrimary,
		fontSize: 14,
		lineHeight: 20,
		minHeight: 120,
	},
});
