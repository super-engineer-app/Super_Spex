import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";
import type { UseGlassesCameraReturn } from "../../hooks/useGlassesCamera";
import { useGlassesCamera } from "../../hooks/useGlassesCamera";
import type { UseSpeechRecognitionReturn } from "../../hooks/useSpeechRecognition";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import type { UseXRGlassesReturn } from "../../hooks/useXRGlasses";
import { useXRGlasses } from "../../hooks/useXRGlasses";
import type { DashboardMode } from "../../types/dashboard";

export interface DashboardContextValue {
	activeMode: DashboardMode;
	setMode: (mode: DashboardMode) => void;
	glasses: UseXRGlassesReturn;
	speech: UseSpeechRecognitionReturn;
	camera: UseGlassesCameraReturn;
}

const DashboardCtx = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
	const ctx = useContext(DashboardCtx);
	if (!ctx)
		throw new Error("useDashboard must be used within DashboardProvider");
	return ctx;
}

interface DashboardProviderProps {
	children: ReactNode;
}

export function DashboardProvider({ children }: DashboardProviderProps) {
	const [activeMode, setModeRaw] = useState<DashboardMode>("identify");
	const glasses = useXRGlasses();
	const speech = useSpeechRecognition();
	const camera = useGlassesCamera();

	// Clear speech state when switching modes so transcription doesn't leak across modes
	const clearTranscript = speech.clearTranscript;
	const setMode = useCallback(
		(mode: DashboardMode) => {
			clearTranscript();
			setModeRaw(mode);
		},
		[clearTranscript],
	);

	return (
		<DashboardCtx.Provider
			value={{ activeMode, setMode, glasses, speech, camera }}
		>
			{children}
		</DashboardCtx.Provider>
	);
}
