import { useEffect, useState, useCallback } from 'react';
import { getXRGlassesService } from '../../modules/xr-glasses';
import type { InputEvent } from '../../modules/xr-glasses';

/**
 * Maximum number of events to keep in history.
 */
const MAX_HISTORY_SIZE = 100;

/**
 * Input event with additional metadata.
 */
export interface InputEventWithId extends InputEvent {
  id: string;
}

/**
 * Return type for the useGlassesInput hook.
 */
export interface UseGlassesInputReturn {
  /** The most recent input event */
  lastEvent: InputEventWithId | null;
  /** History of input events (most recent first) */
  eventHistory: InputEventWithId[];
  /** Clear the event history */
  clearHistory: () => void;
  /** Whether currently listening for events */
  isListening: boolean;
}

/**
 * Generate a unique ID for an event.
 */
function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Hook for tracking XR glasses input events.
 *
 * This hook subscribes to input events from the glasses and maintains
 * a history of recent events for debugging and display purposes.
 *
 * @example
 * ```tsx
 * function InputEventLog() {
 *   const { lastEvent, eventHistory, clearHistory } = useGlassesInput();
 *
 *   return (
 *     <View>
 *       <Text>Last Event: {lastEvent?.action ?? 'None'}</Text>
 *       <FlatList
 *         data={eventHistory}
 *         renderItem={({ item }) => (
 *           <Text>{item.action} - {new Date(item.timestamp).toLocaleTimeString()}</Text>
 *         )}
 *       />
 *       <Button onPress={clearHistory} title="Clear History" />
 *     </View>
 *   );
 * }
 * ```
 */
export function useGlassesInput(): UseGlassesInputReturn {
  const [lastEvent, setLastEvent] = useState<InputEventWithId | null>(null);
  const [eventHistory, setEventHistory] = useState<InputEventWithId[]>([]);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const service = getXRGlassesService();

    setIsListening(true);

    const subscription = service.onInputEvent((event) => {
      const eventWithId: InputEventWithId = {
        ...event,
        id: generateEventId(),
      };

      setLastEvent(eventWithId);
      setEventHistory(prev => {
        // Add to beginning of array, keep limited history
        const newHistory = [eventWithId, ...prev];
        return newHistory.slice(0, MAX_HISTORY_SIZE);
      });
    });

    return () => {
      setIsListening(false);
      subscription.remove();
    };
  }, []);

  const clearHistory = useCallback(() => {
    setEventHistory([]);
    setLastEvent(null);
  }, []);

  return {
    lastEvent,
    eventHistory,
    clearHistory,
    isListening,
  };
}

/**
 * Hook for tracking specific input actions.
 *
 * @param action - The action to listen for
 * @param callback - Callback to invoke when the action is detected
 *
 * @example
 * ```tsx
 * function CameraToggleHandler() {
 *   useGlassesAction('TOGGLE_CAMERA', () => {
 *     console.log('Camera toggled!');
 *     // Handle camera toggle
 *   });
 *
 *   return null;
 * }
 * ```
 */
export function useGlassesAction(
  action: string,
  callback: (event: InputEvent) => void
): void {
  useEffect(() => {
    const service = getXRGlassesService();

    const subscription = service.onInputEvent((event) => {
      if (event.action === action) {
        callback(event);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [action, callback]);
}
