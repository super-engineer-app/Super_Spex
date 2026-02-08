/**
 * TaggingMode Component
 *
 * UI for the voice-activated tagging feature.
 * Shows transcript, captured images, and action buttons.
 */

import {
	ActivityIndicator,
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import type { TaggedImage } from "../types/tagging";

interface TaggingModeProps {
	/** Whether tagging mode is active */
	isActive: boolean;
	/** Accumulated transcript */
	transcript: string;
	/** Captured images */
	images: TaggedImage[];
	/** Whether saving is in progress */
	isSaving: boolean;
	/** Error message */
	error: string | null;
	/** Status message */
	statusMessage: string | null;
	/** Whether glasses camera is ready */
	isGlassesCameraReady: boolean;
	/** Whether glasses camera is capturing */
	isGlassesCapturing: boolean;
	/** Start tagging manually */
	onStartTagging: () => void;
	/** Cancel tagging */
	onCancelTagging: () => void;
	/** Save the session */
	onSaveTagging: () => void;
	/** Capture from glasses camera */
	onCaptureFromGlasses: () => void;
	/** Capture from phone camera */
	onCaptureFromPhone: () => void;
	/** Pick from gallery */
	onPickFromGallery: () => void;
	/** Remove an image */
	onRemoveImage: (index: number) => void;
	/** Edit the transcript text */
	onEditTranscript: (text: string) => void;
}

/**
 * TaggingMode component for displaying and controlling tagging sessions.
 */
export function TaggingMode({
	isActive,
	transcript,
	images,
	isSaving,
	error,
	statusMessage,
	isGlassesCameraReady: _isGlassesCameraReady,
	isGlassesCapturing,
	onStartTagging,
	onCancelTagging,
	onSaveTagging,
	onCaptureFromGlasses,
	onCaptureFromPhone,
	onPickFromGallery,
	onRemoveImage,
	onEditTranscript,
}: TaggingModeProps) {
	// Not in tagging mode - show start button
	if (!isActive) {
		return (
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Tagging</Text>
				<Text style={styles.hint}>
					Say "note" or "tag" to start, or tap below
				</Text>
				<Pressable style={styles.startButton} onPress={onStartTagging}>
					<Text style={styles.startButtonText}>Start Tagging</Text>
				</Pressable>
			</View>
		);
	}

	// In tagging mode
	return (
		<View style={[styles.section, styles.activeSection]}>
			<View style={styles.header}>
				<Text style={[styles.sectionTitle, styles.activeTitle]}>
					Tagging Mode Active
				</Text>
				<View style={styles.badge}>
					<Text style={styles.badgeText}>RECORDING</Text>
				</View>
			</View>

			<Text style={styles.hint}>
				Say "done" or "save" to finish, or tap Save below
			</Text>

			{/* Transcript */}
			<View style={styles.transcriptBox}>
				<Text style={styles.transcriptLabel}>Transcript:</Text>
				<TextInput
					style={styles.transcriptText}
					value={transcript}
					onChangeText={onEditTranscript}
					placeholder="Speak or type to add notes..."
					placeholderTextColor="#666"
					multiline
					textAlignVertical="top"
				/>
			</View>

			{/* Images */}
			<View style={styles.imagesSection}>
				<Text style={styles.imagesLabel}>Images ({images.length})</Text>

				{images.length > 0 ? (
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={styles.imagesScroll}
					>
						{images.map((img, index) => (
							<View key={`${img.capturedAt}-${index}`} style={styles.imageItem}>
								<Image
									source={{ uri: `data:image/jpeg;base64,${img.base64}` }}
									style={styles.imageThumbnail}
								/>
								<Text style={styles.imageSource}>{img.source}</Text>
								<Pressable
									style={styles.removeButton}
									onPress={() => onRemoveImage(index)}
								>
									<Text style={styles.removeButtonText}>X</Text>
								</Pressable>
							</View>
						))}
					</ScrollView>
				) : (
					<Text style={styles.noImagesText}>No images yet</Text>
				)}

				{/* Capture buttons */}
				<View style={styles.captureButtons}>
					<Pressable
						style={[
							styles.captureButton,
							isGlassesCapturing && styles.captureButtonDisabled,
						]}
						onPress={onCaptureFromGlasses}
						disabled={isGlassesCapturing}
					>
						<Text style={styles.captureButtonText}>
							{isGlassesCapturing ? "..." : "Glasses"}
						</Text>
					</Pressable>

					<Pressable style={styles.captureButton} onPress={onCaptureFromPhone}>
						<Text style={styles.captureButtonText}>Phone</Text>
					</Pressable>

					<Pressable style={styles.captureButton} onPress={onPickFromGallery}>
						<Text style={styles.captureButtonText}>Gallery</Text>
					</Pressable>
				</View>
			</View>

			{/* Status/Error */}
			{statusMessage && (
				<View style={styles.statusBox}>
					<Text style={styles.statusText}>{statusMessage}</Text>
				</View>
			)}

			{error && (
				<View style={styles.errorBox}>
					<Text style={styles.errorText}>{error}</Text>
				</View>
			)}

			{/* Action buttons */}
			<View style={styles.actionButtons}>
				<Pressable
					style={styles.cancelButton}
					onPress={onCancelTagging}
					disabled={isSaving}
				>
					<Text style={styles.cancelButtonText}>Cancel</Text>
				</Pressable>

				<Pressable
					style={[
						styles.saveButton,
						(isSaving || images.length === 0 || !transcript.trim()) &&
							styles.saveButtonDisabled,
					]}
					onPress={onSaveTagging}
					disabled={isSaving || images.length === 0 || !transcript.trim()}
				>
					{isSaving ? (
						<ActivityIndicator color="#fff" size="small" />
					) : (
						<Text style={styles.saveButtonText}>
							Save Tag ({images.length} img)
						</Text>
					)}
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	section: {
		backgroundColor: "#222",
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
	},
	activeSection: {
		backgroundColor: "#1a2a1a",
		borderWidth: 2,
		borderColor: "#4a4",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "#fff",
	},
	activeTitle: {
		color: "#4f4",
	},
	badge: {
		backgroundColor: "#f44",
		borderRadius: 4,
		paddingHorizontal: 8,
		paddingVertical: 2,
	},
	badgeText: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "bold",
	},
	hint: {
		color: "#888",
		fontSize: 13,
		marginBottom: 12,
	},
	startButton: {
		backgroundColor: "#4a4",
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
	},
	startButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	transcriptBox: {
		backgroundColor: "#333",
		borderRadius: 8,
		padding: 12,
		marginBottom: 12,
		minHeight: 80,
	},
	transcriptLabel: {
		color: "#888",
		fontSize: 12,
		marginBottom: 4,
	},
	transcriptText: {
		color: "#fff",
		fontSize: 15,
		lineHeight: 22,
	},
	imagesSection: {
		marginBottom: 12,
	},
	imagesLabel: {
		color: "#888",
		fontSize: 12,
		marginBottom: 8,
	},
	imagesScroll: {
		marginBottom: 8,
	},
	imageItem: {
		marginRight: 8,
		position: "relative",
	},
	imageThumbnail: {
		width: 80,
		height: 80,
		borderRadius: 8,
		backgroundColor: "#000",
	},
	imageSource: {
		position: "absolute",
		bottom: 4,
		left: 4,
		backgroundColor: "rgba(0,0,0,0.7)",
		color: "#fff",
		fontSize: 9,
		paddingHorizontal: 4,
		paddingVertical: 1,
		borderRadius: 2,
	},
	removeButton: {
		position: "absolute",
		top: -4,
		right: -4,
		backgroundColor: "#f44",
		width: 20,
		height: 20,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	removeButtonText: {
		color: "#fff",
		fontSize: 12,
		fontWeight: "bold",
	},
	noImagesText: {
		color: "#666",
		fontSize: 13,
		fontStyle: "italic",
		marginBottom: 8,
	},
	captureButtons: {
		flexDirection: "row",
		gap: 8,
	},
	captureButton: {
		flex: 1,
		backgroundColor: "#444",
		borderRadius: 8,
		padding: 10,
		alignItems: "center",
	},
	captureButtonDisabled: {
		opacity: 0.5,
	},
	captureButtonText: {
		color: "#fff",
		fontSize: 13,
		fontWeight: "500",
	},
	statusBox: {
		backgroundColor: "#2a3a4a",
		borderRadius: 8,
		padding: 10,
		marginBottom: 12,
	},
	statusText: {
		color: "#8af",
		fontSize: 13,
	},
	errorBox: {
		backgroundColor: "#4a2a2a",
		borderRadius: 8,
		padding: 10,
		marginBottom: 12,
	},
	errorText: {
		color: "#f88",
		fontSize: 13,
	},
	actionButtons: {
		flexDirection: "row",
		gap: 12,
	},
	cancelButton: {
		flex: 1,
		backgroundColor: "#444",
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
	},
	cancelButtonText: {
		color: "#aaa",
		fontSize: 15,
	},
	saveButton: {
		flex: 2,
		backgroundColor: "#4a4",
		borderRadius: 8,
		padding: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	saveButtonDisabled: {
		backgroundColor: "#333",
		opacity: 0.6,
	},
	saveButtonText: {
		color: "#fff",
		fontSize: 15,
		fontWeight: "600",
	},
});
