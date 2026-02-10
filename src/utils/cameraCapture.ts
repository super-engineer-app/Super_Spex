/**
 * Native camera capture — uses expo-image-picker's launchCameraAsync.
 * Returns a PickedImage-compatible object or null if cancelled/denied.
 */
import * as ImagePicker from "expo-image-picker";

export async function captureFromCamera(): Promise<{
	base64: string;
	uri: string;
} | null> {
	const { status } = await ImagePicker.requestCameraPermissionsAsync();
	if (status !== "granted") return null;

	const result = await ImagePicker.launchCameraAsync({
		mediaTypes: "images",
		base64: true,
		quality: 0.8,
	});

	if (result.canceled || !result.assets[0]?.base64) return null;

	return {
		base64: result.assets[0].base64,
		uri: result.assets[0].uri,
	};
}
