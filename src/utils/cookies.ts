import { Platform } from "react-native";

/**
 * Parse a cookie value by name from document.cookie (web only).
 * Returns empty string on native or if cookie is not found.
 */
export function getCookie(name: string): string {
	if (Platform.OS !== "web") return "";
	const match = document.cookie.match(
		new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
	);
	return match ? decodeURIComponent(match[1]) : "";
}
