import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * Device capabilities interface.
 * Reflects actual AI glasses hardware capabilities.
 */
interface DeviceCapabilities {
  isXrPeripheral: boolean;    // Device is XR glasses
  hasXrProjection: boolean;   // Device can project to glasses
  hasTouchInput: boolean;     // Has touchpad/touch input
  hasCamera: boolean;         // Has camera
  hasMicrophone: boolean;     // Has microphone
  hasAudioOutput: boolean;    // Has speakers
  isEmulated?: boolean;
  deviceType?: string;
}

/**
 * Input event interface.
 */
interface InputEvent {
  id: string;
  action: string;
  timestamp: number;
}

/**
 * Glasses store state interface.
 */
interface GlassesState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Device info
  deviceCapabilities: DeviceCapabilities | null;
  isProjectedDevice: boolean;

  // Engagement mode
  visualsOn: boolean;
  audioOn: boolean;

  // Emulation
  emulationMode: boolean;

  // Input events log (for debugging)
  inputEvents: InputEvent[];
  maxInputEvents: number;
}

/**
 * Glasses store actions interface.
 */
interface GlassesActions {
  // Connection actions
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setConnectionError: (error: string | null) => void;

  // Device actions
  setDeviceCapabilities: (caps: DeviceCapabilities | null) => void;
  setIsProjectedDevice: (isProjected: boolean) => void;

  // Engagement mode actions
  setEngagementMode: (visualsOn: boolean, audioOn: boolean) => void;
  toggleVisuals: () => void;
  toggleAudio: () => void;

  // Emulation actions
  setEmulationMode: (enabled: boolean) => void;

  // Input event actions
  addInputEvent: (event: Omit<InputEvent, 'id'>) => void;
  clearInputEvents: () => void;

  // Reset
  reset: () => void;
}

/**
 * Combined store type.
 */
type GlassesStore = GlassesState & GlassesActions;

/**
 * Initial state values.
 */
const initialState: GlassesState = {
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  deviceCapabilities: null,
  isProjectedDevice: false,
  visualsOn: false,
  audioOn: false,
  emulationMode: false,
  inputEvents: [],
  maxInputEvents: 100,
};

/**
 * Generate a unique ID for events.
 */
const generateId = (): string =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

/**
 * Zustand store for XR Glasses state management.
 *
 * This store provides global state management for glasses-related data,
 * including connection state, device capabilities, engagement mode, and
 * input event history.
 *
 * The store uses the `subscribeWithSelector` middleware to allow selective
 * subscriptions to specific parts of the state.
 *
 * @example
 * ```tsx
 * // Using the store in a component
 * function ConnectionStatus() {
 *   const isConnected = useGlassesStore(state => state.isConnected);
 *   const isConnecting = useGlassesStore(state => state.isConnecting);
 *
 *   if (isConnecting) return <Text>Connecting...</Text>;
 *   return <Text>Status: {isConnected ? 'Connected' : 'Disconnected'}</Text>;
 * }
 *
 * // Using actions
 * function ConnectButton() {
 *   const setConnecting = useGlassesStore(state => state.setConnecting);
 *   const setConnected = useGlassesStore(state => state.setConnected);
 *
 *   const handleConnect = async () => {
 *     setConnecting(true);
 *     try {
 *       await connectToGlasses();
 *       setConnected(true);
 *     } finally {
 *       setConnecting(false);
 *     }
 *   };
 *
 *   return <Button onPress={handleConnect} title="Connect" />;
 * }
 * ```
 */
export const useGlassesStore = create<GlassesStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    ...initialState,

    // Connection actions
    setConnected: (connected) =>
      set({
        isConnected: connected,
        connectionError: null,
      }),

    setConnecting: (connecting) =>
      set({ isConnecting: connecting }),

    setConnectionError: (error) =>
      set({
        connectionError: error,
        isConnected: false,
        isConnecting: false,
      }),

    // Device actions
    setDeviceCapabilities: (caps) =>
      set({ deviceCapabilities: caps }),

    setIsProjectedDevice: (isProjected) =>
      set({ isProjectedDevice: isProjected }),

    // Engagement mode actions
    setEngagementMode: (visualsOn, audioOn) =>
      set({ visualsOn, audioOn }),

    toggleVisuals: () =>
      set((state) => ({ visualsOn: !state.visualsOn })),

    toggleAudio: () =>
      set((state) => ({ audioOn: !state.audioOn })),

    // Emulation actions
    setEmulationMode: (enabled) =>
      set({ emulationMode: enabled }),

    // Input event actions
    addInputEvent: (event) =>
      set((state) => {
        const newEvent: InputEvent = {
          ...event,
          id: generateId(),
        };
        const newEvents = [newEvent, ...state.inputEvents];
        return {
          inputEvents: newEvents.slice(0, state.maxInputEvents),
        };
      }),

    clearInputEvents: () =>
      set({ inputEvents: [] }),

    // Reset to initial state
    reset: () => set(initialState),
  }))
);

/**
 * Selector hooks for common state slices.
 */
export const selectIsConnected = (state: GlassesStore) => state.isConnected;
export const selectIsConnecting = (state: GlassesStore) => state.isConnecting;
export const selectConnectionError = (state: GlassesStore) => state.connectionError;
export const selectDeviceCapabilities = (state: GlassesStore) => state.deviceCapabilities;
export const selectEngagementMode = (state: GlassesStore) => ({
  visualsOn: state.visualsOn,
  audioOn: state.audioOn,
});
export const selectEmulationMode = (state: GlassesStore) => state.emulationMode;
export const selectInputEvents = (state: GlassesStore) => state.inputEvents;

/**
 * Subscribe to connection state changes outside of React.
 *
 * @example
 * ```ts
 * const unsubscribe = subscribeToConnection((isConnected) => {
 *   console.log('Connection changed:', isConnected);
 * });
 *
 * // Later, to unsubscribe:
 * unsubscribe();
 * ```
 */
export const subscribeToConnection = (
  callback: (isConnected: boolean) => void
) => {
  return useGlassesStore.subscribe(
    (state) => state.isConnected,
    callback
  );
};

/**
 * Subscribe to engagement mode changes outside of React.
 */
export const subscribeToEngagementMode = (
  callback: (mode: { visualsOn: boolean; audioOn: boolean }) => void
) => {
  return useGlassesStore.subscribe(
    (state) => ({ visualsOn: state.visualsOn, audioOn: state.audioOn }),
    callback,
    { equalityFn: (a, b) => a.visualsOn === b.visualsOn && a.audioOn === b.audioOn }
  );
};
