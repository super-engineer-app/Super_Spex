import { useCallback, useEffect, useRef, useState } from "react";
import {
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { COLORS } from "../theme";

// ============================================================
// WheelPicker - Individual scrollable wheel for number selection
// ============================================================

interface WheelPickerProps {
	/** Array of values to display */
	values: number[];
	/** Currently selected value */
	selectedValue: number;
	/** Called when value changes */
	onValueChange: (value: number) => void;
	/** Height of each item */
	itemHeight?: number;
	/** Number of visible items */
	visibleItems?: number;
	/** Format function for display */
	formatValue?: (value: number) => string;
	/** Whether the picker is disabled */
	disabled?: boolean;
}

function WheelPicker({
	values,
	selectedValue,
	onValueChange,
	itemHeight = 50,
	visibleItems = 3,
	formatValue = (v) => v.toString().padStart(2, "0"),
	disabled = false,
}: WheelPickerProps) {
	const scrollViewRef = useRef<ScrollView>(null);
	const isUserScrollingRef = useRef(false);
	const initialScrollDoneRef = useRef(false);

	// Calculate container height based on visible items
	const containerHeight = itemHeight * visibleItems;
	const paddingVertical = itemHeight * Math.floor(visibleItems / 2);

	// Find index of selected value
	const selectedIndex = values.indexOf(selectedValue);

	// Scroll to selected value on mount
	useEffect(() => {
		if (!initialScrollDoneRef.current && selectedIndex >= 0) {
			// Use setTimeout to ensure ScrollView is mounted
			const timer = setTimeout(() => {
				scrollViewRef.current?.scrollTo({
					y: selectedIndex * itemHeight,
					animated: false,
				});
				initialScrollDoneRef.current = true;
			}, 50);
			return () => clearTimeout(timer);
		}
	}, [selectedIndex, itemHeight]);

	// Scroll when selectedValue changes externally (from presets)
	useEffect(() => {
		if (
			initialScrollDoneRef.current &&
			!isUserScrollingRef.current &&
			selectedIndex >= 0
		) {
			scrollViewRef.current?.scrollTo({
				y: selectedIndex * itemHeight,
				animated: true,
			});
		}
	}, [selectedIndex, itemHeight]);

	// Handle scroll end - snap to nearest item
	const handleMomentumScrollEnd = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const offsetY = event.nativeEvent.contentOffset.y;
			const index = Math.round(offsetY / itemHeight);
			const clampedIndex = Math.max(0, Math.min(values.length - 1, index));
			const newValue = values[clampedIndex];

			if (newValue !== selectedValue) {
				onValueChange(newValue);
			}

			isUserScrollingRef.current = false;
		},
		[itemHeight, values, selectedValue, onValueChange],
	);

	// Handle drag end without momentum
	const handleScrollEndDrag = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const velocity = event.nativeEvent.velocity?.y ?? 0;

			// If no momentum (user lifted finger without flicking), snap immediately
			if (Math.abs(velocity) < 0.1) {
				const offsetY = event.nativeEvent.contentOffset.y;
				const index = Math.round(offsetY / itemHeight);
				const clampedIndex = Math.max(0, Math.min(values.length - 1, index));
				const newValue = values[clampedIndex];

				// Snap to position
				scrollViewRef.current?.scrollTo({
					y: clampedIndex * itemHeight,
					animated: true,
				});

				if (newValue !== selectedValue) {
					onValueChange(newValue);
				}

				isUserScrollingRef.current = false;
			}
		},
		[itemHeight, values, selectedValue, onValueChange],
	);

	const handleScrollBegin = useCallback(() => {
		isUserScrollingRef.current = true;
	}, []);

	// Handle tap on item to select it
	const handleItemPress = useCallback(
		(index: number) => {
			const newValue = values[index];
			scrollViewRef.current?.scrollTo({
				y: index * itemHeight,
				animated: true,
			});
			if (newValue !== selectedValue) {
				onValueChange(newValue);
			}
		},
		[values, itemHeight, selectedValue, onValueChange],
	);

	return (
		<View
			style={[styles.wheelContainer, { height: containerHeight }]}
			// Capture touch events for this component
			onStartShouldSetResponder={() => true}
			onStartShouldSetResponderCapture={() => false}
		>
			{/* Selection indicator - behind the scroll view */}
			<View
				style={[
					styles.selectionIndicator,
					{
						top: paddingVertical,
						height: itemHeight,
					},
				]}
				pointerEvents="none"
			/>

			<ScrollView
				ref={scrollViewRef}
				style={styles.scrollView}
				showsVerticalScrollIndicator={false}
				snapToInterval={itemHeight}
				snapToAlignment="center"
				decelerationRate={Platform.OS === "ios" ? "normal" : 0.985}
				nestedScrollEnabled={true}
				scrollEventThrottle={16}
				onScrollBeginDrag={handleScrollBegin}
				onMomentumScrollEnd={handleMomentumScrollEnd}
				onScrollEndDrag={handleScrollEndDrag}
				scrollEnabled={!disabled}
				overScrollMode="never"
				bounces={false}
				contentContainerStyle={{
					paddingVertical,
				}}
			>
				{values.map((value, index) => {
					const isSelected = value === selectedValue;
					return (
						<Pressable
							key={value}
							style={[styles.wheelItem, { height: itemHeight }]}
							onPress={() => handleItemPress(index)}
							disabled={disabled}
						>
							<Text
								style={[
									styles.wheelItemText,
									isSelected && styles.wheelItemTextSelected,
									disabled && styles.wheelItemTextDisabled,
								]}
							>
								{formatValue(value)}
							</Text>
						</Pressable>
					);
				})}
			</ScrollView>

			{/* Fade overlays - pointer events none so they don't block scrolling */}
			<View
				style={[styles.fadeOverlayTop, { height: paddingVertical }]}
				pointerEvents="none"
			/>
			<View
				style={[styles.fadeOverlayBottom, { height: paddingVertical }]}
				pointerEvents="none"
			/>
		</View>
	);
}

// ============================================================
// TimePicker - Main component with hour and minute wheels
// ============================================================

interface TimePickerProps {
	/** Initial hours value */
	initialHours?: number;
	/** Initial minutes value */
	initialMinutes?: number;
	/** Maximum hours allowed */
	maxHours?: number;
	/** Called when user confirms the selection */
	onConfirm: (totalMinutes: number) => void;
	/** Whether the picker is disabled */
	disabled?: boolean;
}

/**
 * Time picker component with scrollable hour and minute wheels.
 * Similar to Android's native timer picker UI.
 */
export function TimePicker({
	initialHours = 1,
	initialMinutes = 0,
	maxHours = 4,
	onConfirm,
	disabled = false,
}: TimePickerProps) {
	const [hours, setHours] = useState(initialHours);
	const [minutes, setMinutes] = useState(initialMinutes);

	// Generate arrays for wheel pickers
	const hourValues = Array.from({ length: maxHours + 1 }, (_, i) => i);
	const minuteValues = Array.from({ length: 60 }, (_, i) => i);

	// Calculate total minutes
	const totalMinutes = hours * 60 + minutes;
	const isValid = totalMinutes > 0;

	// Quick preset buttons
	const presets = [
		{ label: "15m", value: 15 },
		{ label: "30m", value: 30 },
		{ label: "1h", value: 60 },
		{ label: "2h", value: 120 },
	];

	const applyPreset = useCallback((totalMins: number) => {
		const h = Math.floor(totalMins / 60);
		const m = totalMins % 60;
		setHours(h);
		setMinutes(m);
	}, []);

	const handleConfirm = useCallback(() => {
		if (isValid) {
			onConfirm(totalMinutes);
		}
	}, [isValid, totalMinutes, onConfirm]);

	// Format hours without padding
	const formatHours = (v: number) => v.toString();

	return (
		<View style={styles.container}>
			{/* Quick presets */}
			<View style={styles.presetsRow}>
				{presets.map((preset) => (
					<Pressable
						key={preset.value}
						style={[
							styles.presetButton,
							totalMinutes === preset.value && styles.presetButtonActive,
							disabled && styles.disabled,
						]}
						onPress={() => applyPreset(preset.value)}
						disabled={disabled}
					>
						<Text
							style={[
								styles.presetButtonText,
								totalMinutes === preset.value && styles.presetButtonTextActive,
							]}
						>
							{preset.label}
						</Text>
					</Pressable>
				))}
			</View>

			{/* Wheel pickers */}
			<View style={styles.wheelsContainer}>
				{/* Hours wheel */}
				<View style={styles.wheelWrapper}>
					<WheelPicker
						values={hourValues}
						selectedValue={hours}
						onValueChange={setHours}
						formatValue={formatHours}
						disabled={disabled}
					/>
					<Text style={styles.wheelLabel}>hours</Text>
				</View>

				{/* Separator */}
				<Text style={styles.wheelSeparator}>:</Text>

				{/* Minutes wheel */}
				<View style={styles.wheelWrapper}>
					<WheelPicker
						values={minuteValues}
						selectedValue={minutes}
						onValueChange={setMinutes}
						disabled={disabled}
					/>
					<Text style={styles.wheelLabel}>min</Text>
				</View>
			</View>

			{/* Total display */}
			<Text style={styles.totalText}>
				Total: {hours > 0 ? `${hours}h ` : ""}
				{minutes > 0 ? `${minutes}m` : hours === 0 ? "0m" : ""}
			</Text>

			{/* Start button */}
			<Pressable
				style={[
					styles.startButton,
					!isValid && styles.startButtonDisabled,
					disabled && styles.disabled,
				]}
				onPress={handleConfirm}
				disabled={disabled || !isValid}
			>
				<Text style={styles.startButtonText}>START TIMER</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		padding: 8,
	},
	presetsRow: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 8,
		marginBottom: 20,
	},
	presetButton: {
		backgroundColor: COLORS.secondary,
		borderRadius: 6,
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	presetButtonActive: {
		backgroundColor: COLORS.primary,
		borderColor: COLORS.primary,
	},
	presetButtonText: {
		color: COLORS.sidebarText,
		fontSize: 13,
		fontWeight: "600",
	},
	presetButtonTextActive: {
		color: COLORS.primaryForeground,
	},
	wheelsContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 16,
	},
	wheelWrapper: {
		alignItems: "center",
	},
	wheelLabel: {
		color: COLORS.textMuted,
		fontSize: 12,
		marginTop: 4,
	},
	wheelSeparator: {
		color: COLORS.textPrimary,
		fontSize: 36,
		fontWeight: "bold",
		marginHorizontal: 8,
		marginBottom: 20,
	},
	wheelContainer: {
		width: 80,
		overflow: "hidden",
		position: "relative",
	},
	scrollView: {
		zIndex: 1,
	},
	selectionIndicator: {
		position: "absolute",
		left: 4,
		right: 4,
		backgroundColor: COLORS.secondary,
		borderRadius: 8,
		zIndex: 0,
	},
	wheelItem: {
		justifyContent: "center",
		alignItems: "center",
	},
	wheelItemText: {
		fontSize: 32,
		fontWeight: "600",
		color: COLORS.textMuted,
		fontFamily: "monospace",
	},
	wheelItemTextSelected: {
		color: COLORS.textPrimary,
		fontSize: 36,
		fontWeight: "bold",
	},
	wheelItemTextDisabled: {
		color: COLORS.textDisabled,
	},
	fadeOverlayTop: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		backgroundColor: "rgba(255, 255, 255, 0.6)",
		zIndex: 2,
	},
	fadeOverlayBottom: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: "rgba(255, 255, 255, 0.6)",
		zIndex: 2,
	},
	totalText: {
		color: COLORS.textSecondary,
		fontSize: 14,
		textAlign: "center",
		marginBottom: 16,
	},
	startButton: {
		backgroundColor: COLORS.success,
		borderRadius: 10,
		paddingVertical: 16,
		alignItems: "center",
	},
	startButtonDisabled: {
		backgroundColor: COLORS.secondary,
	},
	startButtonText: {
		color: COLORS.primaryForeground,
		fontSize: 18,
		fontWeight: "bold",
	},
	disabled: {
		opacity: 0.6,
	},
});
