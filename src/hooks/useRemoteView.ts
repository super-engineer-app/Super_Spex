import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Share } from "react-native";
import {
	getXRGlassesService,
	type StreamCameraSourceChangedEvent,
	type StreamErrorEvent,
	type StreamQuality,
	type StreamStartedEvent,
	type StreamStoppedEvent,
	type ViewerUpdateEvent,
} from "../../modules/xr-glasses";
import logger from "../utils/logger";

const TAG = "RemoteView";

// WebSocket URL for real-time channel updates
const WS_BASE_URL = "wss://REDACTED_TOKEN_SERVER/ws";

/**
 * State interface for Remote View streaming.
 */
export interface RemoteViewState {
	/** Whether currently streaming */
	isStreaming: boolean;
	/** Current stream channel ID */
	channelId: string | null;
	/** Shareable viewer URL */
	viewerUrl: string | null;
	/** Number of connected viewers */
	viewerCount: number;
	/** Selected quality preset */
	selectedQuality: StreamQuality;
	/** Last error message */
	error: string | null;
	/** Whether an operation is in progress */
	loading: boolean;
	/** Camera source being used for streaming */
	cameraSource: string | null;
	/** Whether streaming is using demo mode */
	isDemoMode: boolean;
}

/**
 * Return type for the useRemoteView hook.
 */
export interface UseRemoteViewReturn extends RemoteViewState {
	startStream: () => Promise<void>;
	stopStream: () => Promise<void>;
	setQuality: (quality: StreamQuality) => void;
	shareLink: () => Promise<void>;
	clearError: () => void;
}

/**
 * Quality preset display info.
 */
export const QUALITY_OPTIONS: Record<
	StreamQuality,
	{ label: string; description: string }
> = {
	low_latency: {
		label: "Low Latency",
		description: "480p - Fastest response",
	},
	balanced: {
		label: "Balanced",
		description: "720p - Recommended",
	},
	high_quality: {
		label: "High Quality",
		description: "720p 30fps - Best visual",
	},
};

/**
 * Hook for managing Remote View streaming.
 * Uses the service abstraction instead of XRGlassesNative directly.
 */
export function useRemoteView(): UseRemoteViewReturn {
	const [state, setState] = useState<RemoteViewState>({
		isStreaming: false,
		channelId: null,
		viewerUrl: null,
		viewerCount: 0,
		selectedQuality: "balanced",
		error: null,
		loading: false,
		cameraSource: null,
		isDemoMode: false,
	});

	const serviceRef = useRef(getXRGlassesService());

	// Set up event listeners
	useEffect(() => {
		let mounted = true;
		const service = serviceRef.current;

		const startedSub = service.onStreamStarted((event: StreamStartedEvent) => {
			if (mounted) {
				logger.debug(TAG, "Stream started:", event.viewerUrl);
				setState((prev) => ({
					...prev,
					isStreaming: true,
					channelId: event.channelId,
					viewerUrl: event.viewerUrl,
					error: null,
					loading: false,
				}));
			}
		});

		const stoppedSub = service.onStreamStopped((_event: StreamStoppedEvent) => {
			if (mounted) {
				logger.debug(TAG, "Stream stopped");
				setState((prev) => ({
					...prev,
					isStreaming: false,
					channelId: null,
					viewerUrl: null,
					viewerCount: 0,
					loading: false,
					cameraSource: null,
					isDemoMode: false,
				}));
			}
		});

		const errorSub = service.onStreamError((event: StreamErrorEvent) => {
			if (mounted) {
				logger.error(TAG, "Stream error:", event.message);
				setState((prev) => ({
					...prev,
					error: event.message,
					loading: false,
				}));
			}
		});

		const viewerSub = service.onViewerUpdate((event: ViewerUpdateEvent) => {
			if (mounted) {
				logger.debug(TAG, "Viewer update:", event.viewerCount);
				setState((prev) => ({
					...prev,
					viewerCount: event.viewerCount,
				}));
			}
		});

		const cameraSourceSub = service.onStreamCameraSourceChanged(
			(event: StreamCameraSourceChangedEvent) => {
				if (mounted) {
					logger.debug(
						TAG,
						"Camera source changed:",
						event.cameraSource,
						"demoMode:",
						event.isDemoMode,
					);
					setState((prev) => ({
						...prev,
						cameraSource: event.cameraSource,
						isDemoMode: event.isDemoMode ?? event.isEmulationMode,
					}));
				}
			},
		);

		// Check initial streaming state
		service
			.isRemoteViewActive()
			.then((active) => {
				if (mounted && active) {
					setState((prev) => ({ ...prev, isStreaming: active }));
				}
			})
			.catch((e: unknown) =>
				logger.error(TAG, "Failed to check initial streaming state:", e),
			);

		return () => {
			mounted = false;
			startedSub.remove();
			stoppedSub.remove();
			errorSub.remove();
			viewerSub.remove();
			cameraSourceSub.remove();
		};
	}, []);

	// WebSocket connection for real-time viewer count updates
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	useEffect(() => {
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}

		if (state.isStreaming && state.channelId) {
			const connectWebSocket = () => {
				const wsUrl = `${WS_BASE_URL}/${state.channelId}?role=host&name=Broadcaster`;
				logger.debug(TAG, "Opening WebSocket:", wsUrl);

				const ws = new WebSocket(wsUrl);
				wsRef.current = ws;

				ws.onopen = () => {
					logger.debug(TAG, "WebSocket connected");
				};

				ws.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);
						logger.debug(TAG, "WebSocket message:", data.type);

						if (data.type === "connected" || data.type === "viewer_count") {
							setState((prev) => ({
								...prev,
								viewerCount: data.viewerCount ?? data.count ?? prev.viewerCount,
							}));
						}
					} catch (error) {
						logger.warn(TAG, "Failed to parse WebSocket message:", error);
					}
				};

				ws.onerror = (error) => {
					logger.warn(TAG, "WebSocket error:", error);
				};

				ws.onclose = () => {
					logger.debug(TAG, "WebSocket closed");
					if (state.isStreaming && state.channelId) {
						reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
					}
				};
			};

			connectWebSocket();
		}

		return () => {
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
		};
	}, [state.isStreaming, state.channelId]);

	const startStream = useCallback(async () => {
		setState((prev) => ({ ...prev, loading: true, error: null }));
		try {
			logger.debug(TAG, "Starting stream with quality:", state.selectedQuality);
			await serviceRef.current.startRemoteView(state.selectedQuality);
		} catch (e) {
			const error = e instanceof Error ? e.message : "Failed to start stream";
			logger.error(TAG, "Start failed:", error);
			setState((prev) => ({ ...prev, error, loading: false }));
		}
	}, [state.selectedQuality]);

	const stopStream = useCallback(async () => {
		setState((prev) => ({ ...prev, loading: true }));
		try {
			logger.debug(TAG, "Stopping stream");
			await serviceRef.current.stopRemoteView();
		} catch (e) {
			const error = e instanceof Error ? e.message : "Failed to stop stream";
			logger.error(TAG, "Stop failed:", error);
			setState((prev) => ({ ...prev, error, loading: false }));
		}
	}, []);

	const setQuality = useCallback(
		(quality: StreamQuality) => {
			setState((prev) => ({ ...prev, selectedQuality: quality }));
			if (state.isStreaming) {
				serviceRef.current.setRemoteViewQuality(quality).catch((e) => {
					logger.error(TAG, "Failed to update quality:", e);
				});
			}
		},
		[state.isStreaming],
	);

	const shareLink = useCallback(async () => {
		if (!state.viewerUrl) {
			logger.warn(TAG, "No viewer URL to share");
			return;
		}
		try {
			const result = await Share.share({
				message: state.viewerUrl,
				url: Platform.OS === "ios" ? state.viewerUrl : undefined,
			});
			if (result.action === Share.sharedAction) {
				logger.debug(TAG, "Link shared successfully");
			}
		} catch (e) {
			logger.error(TAG, "Share failed:", e);
		}
	}, [state.viewerUrl]);

	const clearError = useCallback(() => {
		setState((prev) => ({ ...prev, error: null }));
	}, []);

	return {
		...state,
		startStream,
		stopStream,
		setQuality,
		shareLink,
		clearError,
	};
}
