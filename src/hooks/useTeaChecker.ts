import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
	appendImageFileToFormData,
	cleanupTempFile,
} from "../utils/formDataHelper";

const BACKEND_URL =
	process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000";

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
	const [prefUserId, setPrefUserId] = useState("");
	const [prefOrgId, setPrefOrgId] = useState("");
	const [prefLoading, setPrefLoading] = useState(false);
	const [prefResult, setPrefResult] = useState<PreferenceResult | null>(null);
	const [prefError, setPrefError] = useState("");

	// --- Right panel state (Check Tea) ---
	const [checkImage, setCheckImage] = useState<PickedImage | null>(null);
	const [checkUserId, setCheckUserId] = useState("");
	const [checkWhoseTea, setCheckWhoseTea] = useState("");
	const [checkOrgId, setCheckOrgId] = useState("");
	const [checkLoading, setCheckLoading] = useState(false);
	const [checkMessages, setCheckMessages] = useState<string[]>([]);
	const [checkError, setCheckError] = useState("");

	const pickImage = useCallback(
		async (setter: (img: PickedImage) => void) => {
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
		},
		[],
	);

	// --- Left panel: submit tea preference ---
	const submitPreference = useCallback(async () => {
		if (!prefImage || !prefUserId) return;
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
			formData.append("user_id", prefUserId);
			if (prefOrgId) formData.append("organization_id", prefOrgId);

			const res = await fetch(
				`${BACKEND_URL}/memes/tea-colour-preference`,
				{
					method: "POST",
					body: formData,
				},
			);
			if (!res.ok) {
				const err = await res
					.json()
					.catch(() => ({ detail: res.statusText }));
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
	}, [prefImage, prefUserId, prefOrgId]);

	// --- Right panel: check someone's tea (SSE) ---
	const submitCheckTea = useCallback(async () => {
		if (!checkImage || !checkUserId || !checkWhoseTea || !checkOrgId)
			return;
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
			formData.append("user_id", checkUserId);
			formData.append("whose_tea", checkWhoseTea);
			formData.append("organization_id", checkOrgId);

			const res = await fetch(`${BACKEND_URL}/memes/checking-tea`, {
				method: "POST",
				body: formData,
			});
			if (!res.ok) {
				const err = await res
					.json()
					.catch(() => ({ detail: res.statusText }));
				throw new Error(err.detail || "Request failed");
			}

			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					try {
						const data = JSON.parse(line.slice(6));
						if (data.event === "checking") {
							setCheckMessages((prev) => [
								...prev,
								data.message,
							]);
						} else if (data.event === "success") {
							setCheckMessages((prev) => [
								...prev,
								data.detail,
							]);
						} else if (data.event === "error") {
							setCheckError(data.detail);
						}
					} catch {
						// skip malformed SSE line
					}
				}
			}
		} catch (e: unknown) {
			setCheckError(e instanceof Error ? e.message : "Unknown error");
		} finally {
			if (tempUri) await cleanupTempFile(tempUri);
			setCheckLoading(false);
		}
	}, [checkImage, checkUserId, checkWhoseTea, checkOrgId]);

	return {
		// Left panel
		prefImage,
		setPrefImage,
		prefUserId,
		setPrefUserId,
		prefOrgId,
		setPrefOrgId,
		prefLoading,
		prefResult,
		prefError,
		submitPreference,

		// Right panel
		checkImage,
		setCheckImage,
		checkUserId,
		setCheckUserId,
		checkWhoseTea,
		setCheckWhoseTea,
		checkOrgId,
		setCheckOrgId,
		checkLoading,
		checkMessages,
		checkError,
		submitCheckTea,

		// Shared
		pickImage,
	};
}
