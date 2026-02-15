import { StyleSheet, View } from "react-native";
import { COLORS } from "../../theme";
import { ConfigMode } from "../modes/ConfigMode";
import { HelpMode } from "../modes/HelpMode";
import { IdentifyMode } from "../modes/IdentifyMode";
import { LiveStreamMode } from "../modes/LiveStreamMode";
import { NotesMode } from "../modes/NotesMode";
import { TeaCheckerMode } from "../modes/TeaCheckerMode";
import { useDashboard } from "./DashboardContext";

export function ContentArea() {
	const { activeMode } = useDashboard();

	return (
		<View style={styles.content}>
			{/* Persistent modes — always mounted, hidden when inactive */}
			<View
				style={[
					styles.persistentMode,
					activeMode !== "identify" && styles.hidden,
				]}
			>
				<IdentifyMode />
			</View>
			<View
				style={[styles.persistentMode, activeMode !== "help" && styles.hidden]}
			>
				<HelpMode />
			</View>
			<View
				style={[styles.persistentMode, activeMode !== "notes" && styles.hidden]}
			>
				<NotesMode />
			</View>

			{/* Non-persistent modes — mount/unmount normally */}
			{activeMode === "livestream" && <LiveStreamMode />}
			{activeMode === "teachecker" && <TeaCheckerMode />}
			{activeMode === "config" && <ConfigMode />}
		</View>
	);
}

const styles = StyleSheet.create({
	content: {
		flex: 1,
		backgroundColor: COLORS.backgroundSecondary,
	},
	persistentMode: {
		flex: 1,
	},
	hidden: {
		display: "none",
	},
});
