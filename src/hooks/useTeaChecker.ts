import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";
import { captureFromCamera } from "../utils/cameraCapture";
import { getCookie } from "../utils/cookies";
import {
	appendImageFileToFormData,
	cleanupTempFile,
} from "../utils/formDataHelper";

const BACKEND_URL =
	process.env.EXPO_PUBLIC_BACKEND_URL ||
	"https://spex-backend-demo.onrender.com";

export interface PickedImage {
	base64: string;
	uri: string;
}

export interface PreferenceResult {
	hex: string;
	lightness: number;
}

export function useTeaChecker() {
	// --- Left panel state (Tea Preference) ---
	const [prefImage, setPrefImage] = useState<PickedImage | null>(null);
	const [prefLoading, setPrefLoading] = useState(false);
	const [prefResult, setPrefResult] = useState<PreferenceResult | null>(null);
	const [prefError, setPrefError] = useState("");

	// --- Right panel state (Check Tea) ---
	const [checkImage, setCheckImage] = useState<PickedImage | null>(null);
	const [checkWhoseTea, setCheckWhoseTea] = useState("");
	const [checkLoading, setCheckLoading] = useState(false);
	const [checkMessages, setCheckMessages] = useState<string[]>([]);
	const [checkError, setCheckError] = useState("");

	const pickImage = useCallback(async (setter: (img: PickedImage) => void) => {
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: "images",
			base64: true,
			quality: 0.8,
		});
		if (!result.canceled && result.assets[0]?.base64) {
			setter({
				base64: result.assets[0].base64,
				uri: result.assets[0].uri,
			});
		}
	}, []);

	const takePhoto = useCallback(async (setter: (img: PickedImage) => void) => {
		const result = await captureFromCamera();
		if (result) setter(result);
	}, []);

	// --- Left panel: submit tea preference ---
	const submitPreference = useCallback(async () => {
		const userId = getCookie("user_id");
		const orgId = getCookie("organisation_id");
		if (!prefImage || !userId) return;
		setPrefLoading(true);
		setPrefError("");
		setPrefResult(null);

		let tempUri: string | null = null;
		try {
			const formData = new FormData();
			tempUri = await appendImageFileToFormData(
				formData,
				"image",
				prefImage.base64,
			);
			formData.append("user_id", userId);
			if (orgId) formData.append("organization_id", orgId);

			const res = await fetch(`${BACKEND_URL}/memes/tea-colour-preference`, {
				method: "POST",
				credentials: "include",
				body: formData,
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ detail: res.statusText }));
				throw new Error(err.detail || "Request failed");
			}
			const data = await res.json();
			setPrefResult(data);
		} catch (e: unknown) {
			setPrefError(e instanceof Error ? e.message : "Unknown error");
		} finally {
			if (tempUri) await cleanupTempFile(tempUri);
			setPrefLoading(false);
		}
	}, [prefImage]);

	// --- Right panel: check someone's tea (SSE via XHR for cross-platform) ---
	const submitCheckTea = useCallback(async () => {
		const userId = getCookie("user_id");
		const orgId = getCookie("organisation_id");
		if (!checkImage || !userId || !checkWhoseTea || !orgId) return;
		setCheckLoading(true);
		setCheckError("");
		setCheckMessages([]);

		let tempUri: string | null = null;
		try {
			const formData = new FormData();
			tempUri = await appendImageFileToFormData(
				formData,
				"image",
				checkImage.base64,
			);
			formData.append("user_id", userId);
			formData.append("whose_tea", checkWhoseTea);
			formData.append("organization_id", orgId);

			await new Promise<void>((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				let processedLength = 0;
				let lineBuffer = "";

				function processLines(raw: string) {
					lineBuffer += raw;
					const lines = lineBuffer.split("\n");
					lineBuffer = lines.pop() ?? "";

					for (const line of lines) {
						if (!line.startsWith("data: ")) continue;
						try {
							const data = JSON.parse(line.slice(6));
							if (data.event === "checking") {
								setCheckMessages((prev) => [...prev, data.message]);
							} else if (data.event === "success") {
								setCheckMessages((prev) => [...prev, data.detail]);
							} else if (data.event === "error") {
								setCheckError(data.detail);
							}
						} catch {
							// skip malformed SSE line
						}
					}
				}

				// biome-ignore lint/suspicious/noExplicitAny: RN-specific non-standard property
				(xhr as any)._incrementalEvents = true;

				xhr.open("POST", `${BACKEND_URL}/memes/checking-tea`);

				xhr.onprogress = () => {
					const newData = xhr.responseText.slice(processedLength);
					processedLength = xhr.responseText.length;
					if (newData) processLines(newData);
				};

				xhr.onload = () => {
					const remaining = xhr.responseText.slice(processedLength);
					if (remaining) processLines(remaining);
					if (lineBuffer.trim()) {
						processLines(`${lineBuffer}\n`);
						lineBuffer = "";
					}

					if (xhr.status >= 200 && xhr.status < 300) {
						resolve();
					} else {
						reject(new Error(`Request failed: ${xhr.status}`));
					}
				};

				xhr.onerror = () => reject(new Error("Network error"));
				xhr.send(formData);
			});
		} catch (e: unknown) {
			setCheckError(e instanceof Error ? e.message : "Unknown error");
		} finally {
			if (tempUri) await cleanupTempFile(tempUri);
			setCheckLoading(false);
		}
	}, [checkImage, checkWhoseTea]);

	return {
		// Left panel
		prefImage,
		setPrefImage,
		prefLoading,
		prefResult,
		prefError,
		submitPreference,

		// Right panel
		checkImage,
		setCheckImage,
		checkWhoseTea,
		setCheckWhoseTea,
		checkLoading,
		checkMessages,
		checkError,
		submitCheckTea,

		// Shared
		pickImage,
		takePhoto,
	};
}
