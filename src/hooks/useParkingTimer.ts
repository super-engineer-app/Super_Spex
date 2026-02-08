import { useCallback, useEffect, useRef, useState } from "react";
import {
	getXRGlassesService,
	type ParkingTimerCancelledEvent,
	type ParkingTimerExpiredEvent,
	type ParkingTimerStartedEvent,
	type ParkingTimerState,
	type ParkingTimerWarningEvent,
} from "../../modules/xr-glasses";
import logger from "../utils/logger";

const TAG = "ParkingTimer";

/**
 * Extended parking timer state for the hook.
 */
export interface ParkingTimerHookState {
	isActive: boolean;
	remainingMs: number;
	endTime: number;
	durationMinutes: number;
	warningShown: boolean;
	expired: boolean;
	loading: boolean;
	error: string | null;
}

/**
 * Return type for the useParkingTimer hook.
 */
export interface UseParkingTimerReturn extends ParkingTimerHookState {
	formattedTime: string;
	startTimer: (durationMinutes: number) => Promise<void>;
	cancelTimer: () => Promise<void>;
	stopAlarm: () => Promise<void>;
	clearError: () => void;
}

/** Countdown update interval in milliseconds */
const COUNTDOWN_INTERVAL_MS = 1000;

/**
 * Preset durations for parking timer (in minutes).
 */
export const TIMER_PRESETS = [
	{ label: "15 min", value: 15 },
	{ label: "30 min", value: 30 },
	{ label: "1 hour", value: 60 },
	{ label: "2 hours", value: 120 },
] as const;

/**
 * Format milliseconds as MM:SS string.
 */
function formatTime(ms: number): string {
	if (ms <= 0) return "00:00";

	const totalSeconds = Math.ceil(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	const paddedMinutes = minutes.toString().padStart(2, "0");
	const paddedSeconds = seconds.toString().padStart(2, "0");

	return `${paddedMinutes}:${paddedSeconds}`;
}

/**
 * Hook for managing parking timer functionality.
 * Uses the service abstraction instead of XRGlassesNative directly.
 */
export function useParkingTimer(): UseParkingTimerReturn {
	const [state, setState] = useState<ParkingTimerHookState>({
		isActive: false,
		remainingMs: 0,
		endTime: 0,
		durationMinutes: 0,
		warningShown: false,
		expired: false,
		loading: false,
		error: null,
	});

	const serviceRef = useRef(getXRGlassesService());
	const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);

	// Update remaining time every second when timer is active
	useEffect(() => {
		if (state.isActive && state.endTime > 0) {
			if (countdownIntervalRef.current) {
				clearInterval(countdownIntervalRef.current);
			}

			countdownIntervalRef.current = setInterval(() => {
				const now = Date.now();
				const remaining = Math.max(0, state.endTime - now);

				setState((prev) => ({
					...prev,
					remainingMs: remaining,
					isActive: remaining > 0,
				}));

				if (remaining <= 0 && countdownIntervalRef.current) {
					clearInterval(countdownIntervalRef.current);
					countdownIntervalRef.current = null;
				}
			}, COUNTDOWN_INTERVAL_MS);

			return () => {
				if (countdownIntervalRef.current) {
					clearInterval(countdownIntervalRef.current);
					countdownIntervalRef.current = null;
				}
			};
		}
	}, [state.isActive, state.endTime]);

	// Set up event listeners
	useEffect(() => {
		let mounted = true;
		const service = serviceRef.current;

		const startedSub = service.onParkingTimerStarted(
			(event: ParkingTimerStartedEvent) => {
				if (mounted) {
					logger.debug(TAG, "Started:", event.durationMinutes, "min");
					setState((prev) => ({
						...prev,
						isActive: true,
						durationMinutes: event.durationMinutes,
						endTime: event.endTime,
						remainingMs: event.endTime - Date.now(),
						warningShown: false,
						expired: false,
						loading: false,
						error: null,
					}));
				}
			},
		);

		const warningSub = service.onParkingTimerWarning(
			(event: ParkingTimerWarningEvent) => {
				if (mounted) {
					logger.debug(
						TAG,
						"Warning! Remaining:",
						event.remainingMinutes,
						"min",
					);
					setState((prev) => ({
						...prev,
						warningShown: true,
						remainingMs: event.remainingMs,
					}));
				}
			},
		);

		const expiredSub = service.onParkingTimerExpired(
			(_event: ParkingTimerExpiredEvent) => {
				if (mounted) {
					logger.debug(TAG, "EXPIRED!");
					setState((prev) => ({
						...prev,
						isActive: false,
						expired: true,
						remainingMs: 0,
					}));
				}
			},
		);

		const cancelledSub = service.onParkingTimerCancelled(
			(_event: ParkingTimerCancelledEvent) => {
				if (mounted) {
					logger.debug(TAG, "Cancelled");
					setState((prev) => ({
						...prev,
						isActive: false,
						expired: false,
						remainingMs: 0,
						endTime: 0,
						warningShown: false,
						loading: false,
					}));
				}
			},
		);

		// Check initial state
		service
			.getParkingTimerState()
			.then((timerState: ParkingTimerState) => {
				if (mounted && timerState.isActive) {
					setState((prev) => ({
						...prev,
						isActive: timerState.isActive,
						remainingMs: timerState.remainingMs,
						endTime: timerState.endTime,
						durationMinutes: timerState.durationMinutes,
						warningShown: timerState.warningShown,
						expired: timerState.expired,
					}));
				}
			})
			.catch((e: unknown) =>
				logger.error(TAG, "Failed to get timer state:", e),
			);

		return () => {
			mounted = false;
			startedSub.remove();
			warningSub.remove();
			expiredSub.remove();
			cancelledSub.remove();
		};
	}, []);

	const startTimer = useCallback(async (durationMinutes: number) => {
		setState((prev) => ({ ...prev, loading: true, error: null }));
		try {
			logger.debug(TAG, "Starting timer for", durationMinutes, "minutes");
			await serviceRef.current.startParkingTimer(durationMinutes);
		} catch (e) {
			const error = e instanceof Error ? e.message : "Failed to start timer";
			logger.error(TAG, "Start failed:", error);
			setState((prev) => ({ ...prev, error, loading: false }));
		}
	}, []);

	const cancelTimer = useCallback(async () => {
		setState((prev) => ({ ...prev, loading: true }));
		try {
			logger.debug(TAG, "Cancelling timer");
			await serviceRef.current.cancelParkingTimer();
		} catch (e) {
			const error = e instanceof Error ? e.message : "Failed to cancel timer";
			logger.error(TAG, "Cancel failed:", error);
			setState((prev) => ({ ...prev, error, loading: false }));
		}
	}, []);

	const stopAlarm = useCallback(async () => {
		try {
			logger.debug(TAG, "Stopping alarm");
			await serviceRef.current.stopParkingAlarm();
			setState((prev) => ({ ...prev, expired: false }));
		} catch (e) {
			const error = e instanceof Error ? e.message : "Failed to stop alarm";
			logger.error(TAG, "Stop alarm failed:", error);
			setState((prev) => ({ ...prev, error }));
		}
	}, []);

	const clearError = useCallback(() => {
		setState((prev) => ({ ...prev, error: null }));
	}, []);

	return {
		...state,
		formattedTime: formatTime(state.remainingMs),
		startTimer,
		cancelTimer,
		stopAlarm,
		clearError,
	};
}
