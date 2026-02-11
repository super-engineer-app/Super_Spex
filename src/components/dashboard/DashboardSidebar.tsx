import {
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { COLORS } from "../../theme";
import type { DashboardMode } from "../../types/dashboard";
import { useDashboard } from "./DashboardContext";

interface SidebarItem {
	mode: DashboardMode;
	icon: string;
	label: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
	{ mode: "identify", icon: "🔍", label: "Identify" },
	{ mode: "help", icon: "💬", label: "Help" },
	{ mode: "notes", icon: "📝", label: "Notes" },
	{ mode: "livestream", icon: "📡", label: "Live Stream" },
	{ mode: "teachecker", icon: "🍵", label: "Tea checker" },
	{ mode: "config", icon: "⚙️", label: "Config" },
];

const WIDE_BREAKPOINT = 600;

export function DashboardSidebar() {
	const { activeMode, setMode } = useDashboard();
	const { width } = useWindowDimensions();
	const isWide = width > WIDE_BREAKPOINT;

	return (
		<View
			style={[
				styles.sidebar,
				isWide ? styles.sidebarWide : styles.sidebarNarrow,
			]}
		>
			{isWide ? <Text style={styles.headerText}>Super Spex</Text> : null}
			{SIDEBAR_ITEMS.map((item) => {
				const isActive = activeMode === item.mode;
				return (
					<Pressable
						key={item.mode}
						style={[styles.item, isActive && styles.itemActive]}
						onPress={() => setMode(item.mode)}
					>
						<Text style={styles.icon}>{item.icon}</Text>
						{isWide ? (
							<Text style={[styles.label, isActive && styles.labelActive]}>
								{item.label}
							</Text>
						) : null}
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	sidebar: {
		backgroundColor: COLORS.sidebarBg,
		paddingVertical: 12,
		borderRightWidth: 1,
		borderRightColor: COLORS.sidebarBorder,
	},
	headerText: {
		fontSize: 18,
		fontWeight: "bold",
		color: COLORS.textPrimary,
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginBottom: 4,
	},
	sidebarWide: {
		width: 240,
	},
	sidebarNarrow: {
		width: 64,
	},
	item: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
		paddingHorizontal: 10,
		gap: 12,
		borderRadius: 6,
		marginHorizontal: 12,
		marginBottom: 2,
		minHeight: 36,
	},
	itemActive: {
		backgroundColor: COLORS.sidebarItemActive,
	},
	icon: {
		fontSize: 20,
	},
	label: {
		color: COLORS.sidebarText,
		fontSize: 14,
		fontWeight: "500",
	},
	labelActive: {
		color: COLORS.sidebarTextActive,
		fontWeight: "600",
	},
});
