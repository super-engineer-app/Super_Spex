import { StyleSheet, View } from "react-native";
import { ConfigMode } from "../modes/ConfigMode";
import { HelpMode } from "../modes/HelpMode";
import { IdentifyMode } from "../modes/IdentifyMode";
import { LiveStreamMode } from "../modes/LiveStreamMode";
import { NotesMode } from "../modes/NotesMode";
import { TeaCheckerMode } from "../modes/TeaCheckerMode";
import { useDashboard } from "./DashboardContext";

export function ContentArea() {
	const { activeMode } = useDashboard();

	const renderMode = () => {
		switch (activeMode) {
			case "identify":
				return <IdentifyMode />;
			case "help":
				return <HelpMode />;
			case "notes":
				return <NotesMode />;
			case "livestream":
				return <LiveStreamMode />;
			case "teachecker":
				return <TeaCheckerMode />;
			case "config":
				return <ConfigMode />;
		}
	};

	return <View style={styles.content}>{renderMode()}</View>;
}

const styles = StyleSheet.create({
	content: {
		flex: 1,
	},
});
