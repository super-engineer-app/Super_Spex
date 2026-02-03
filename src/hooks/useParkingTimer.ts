import { useEffect, useState, useCallback, useRef } from 'react';
import {
  XRGlassesNative,
  ParkingTimerState,
  ParkingTimerStartedEvent,
  ParkingTimerWarningEvent,
  ParkingTimerExpiredEvent,
  ParkingTimerCancelledEvent,
} from '../../modules/xr-glasses';

/**
 * Extended parking timer state for the hook.
 */
export interface ParkingTimerHookState {
  /** Whether a timer is currently active */
  isActive: boolean;
  /** Remaining time in milliseconds */
  remainingMs: number;
  /** Timer end timestamp */
  endTime: number;
  /** Original duration in minutes */
  durationMinutes: number;
  /** Whether the 5-minute warning has been shown */
  warningShown: boolean;
  /** Whether the timer has expired */
  expired: boolean;
  /** Whether an operation is in progress */
  loading: boolean;
  /** Last error message */
  error: string | null;
}

/**
 * Return type for the useParkingTimer hook.
 */
export interface UseParkingTimerReturn extends ParkingTimerHookState {
  /** Formatted remaining time (MM:SS) */
  formattedTime: string;
  /** Start a parking timer with the specified duration */
  startTimer: (durationMinutes: number) => Promise<void>;
  /** Cancel the current timer */
  cancelTimer: () => Promise<void>;
  /** Stop the alarm sound */
  stopAlarm: () => Promise<void>;
  /** Clear error state */
  clearError: () => void;
}

/**
 * Preset durations for parking timer (in minutes).
 */
export const TIMER_PRESETS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
] as const;

/**
 * Format milliseconds as MM:SS string.
 */
function formatTime(ms: number): string {
  if (ms <= 0) return '00:00';

  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSeconds = seconds.toString().padStart(2, '0');

  return `${paddedMinutes}:${paddedSeconds}`;
}

/**
 * Hook for managing parking timer functionality.
 *
 * Provides a complete interface for starting, monitoring, and stopping
 * parking timers with 5-minute warnings and alarm sounds.
 *
 * The timer uses efficient coroutine-based delays on the native side
 * (no CPU waste, similar to Linux sleep/wait).
 *
 * @example
 * ```tsx
 * function ParkingTimerSection() {
 *   const {
 *     isActive,
 *     formattedTime,
 *     warningShown,
 *     expired,
 *     startTimer,
 *     cancelTimer,
 *     stopAlarm,
 *   } = useParkingTimer();
 *
 *   return (
 *     <View>
 *       {isActive ? (
 *         <>
 *           <Text style={warningShown ? styles.warning : undefined}>
 *             {formattedTime}
 *           </Text>
 *           <Button onPress={cancelTimer}>Cancel</Button>
 *         </>
 *       ) : expired ? (
 *         <>
 *           <Text>Timer Expired!</Text>
 *           <Button onPress={stopAlarm}>Stop Alarm</Button>
 *         </>
 *       ) : (
 *         <Button onPress={() => startTimer(60)}>Start 1hr Timer</Button>
 *       )}
 *     </View>
 *   );
 * }
 * ```
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

  // Interval ref for countdown updates
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update remaining time every second when timer is active
  useEffect(() => {
    if (state.isActive && state.endTime > 0) {
      // Clear existing interval
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }

      // Start countdown interval
      countdownIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, state.endTime - now);

        setState(prev => ({
          ...prev,
          remainingMs: remaining,
          isActive: remaining > 0,
        }));

        // Stop interval if timer ended
        if (remaining <= 0 && countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }, 1000);

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

    // Timer started event
    const startedSub = XRGlassesNative.addListener(
      'onParkingTimerStarted',
      (event: ParkingTimerStartedEvent) => {
        if (mounted) {
          console.log('[ParkingTimer] Started:', event.durationMinutes, 'min');
          setState(prev => ({
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
      }
    );

    // Warning event (5 minutes before)
    const warningSub = XRGlassesNative.addListener(
      'onParkingTimerWarning',
      (event: ParkingTimerWarningEvent) => {
        if (mounted) {
          console.log('[ParkingTimer] Warning! Remaining:', event.remainingMinutes, 'min');
          setState(prev => ({
            ...prev,
            warningShown: true,
            remainingMs: event.remainingMs,
          }));
        }
      }
    );

    // Expired event (alarm!)
    const expiredSub = XRGlassesNative.addListener(
      'onParkingTimerExpired',
      (_event: ParkingTimerExpiredEvent) => {
        if (mounted) {
          console.log('[ParkingTimer] EXPIRED!');
          setState(prev => ({
            ...prev,
            isActive: false,
            expired: true,
            remainingMs: 0,
          }));
        }
      }
    );

    // Cancelled event
    const cancelledSub = XRGlassesNative.addListener(
      'onParkingTimerCancelled',
      (_event: ParkingTimerCancelledEvent) => {
        if (mounted) {
          console.log('[ParkingTimer] Cancelled');
          setState(prev => ({
            ...prev,
            isActive: false,
            expired: false,
            remainingMs: 0,
            endTime: 0,
            warningShown: false,
            loading: false,
          }));
        }
      }
    );

    // Check initial state
    XRGlassesNative.getParkingTimerState()
      .then((timerState: ParkingTimerState) => {
        if (mounted && timerState.isActive) {
          setState(prev => ({
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
      .catch(console.error);

    return () => {
      mounted = false;
      startedSub.remove();
      warningSub.remove();
      expiredSub.remove();
      cancelledSub.remove();
    };
  }, []);

  // Start timer
  const startTimer = useCallback(async (durationMinutes: number) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      console.log('[ParkingTimer] Starting timer for', durationMinutes, 'minutes');
      await XRGlassesNative.startParkingTimer(durationMinutes);
      // State will be updated via onParkingTimerStarted event
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to start timer';
      console.error('[ParkingTimer] Start failed:', error);
      setState(prev => ({ ...prev, error, loading: false }));
    }
  }, []);

  // Cancel timer
  const cancelTimer = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));

    try {
      console.log('[ParkingTimer] Cancelling timer');
      await XRGlassesNative.cancelParkingTimer();
      // State will be updated via onParkingTimerCancelled event
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to cancel timer';
      console.error('[ParkingTimer] Cancel failed:', error);
      setState(prev => ({ ...prev, error, loading: false }));
    }
  }, []);

  // Stop alarm
  const stopAlarm = useCallback(async () => {
    try {
      console.log('[ParkingTimer] Stopping alarm');
      await XRGlassesNative.stopParkingAlarm();
      setState(prev => ({ ...prev, expired: false }));
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to stop alarm';
      console.error('[ParkingTimer] Stop alarm failed:', error);
      setState(prev => ({ ...prev, error }));
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
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
