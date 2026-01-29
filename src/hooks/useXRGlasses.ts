import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getXRGlassesService,
  IXRGlassesService,
  DeviceCapabilities,
  EngagementMode,
} from '../../modules/xr-glasses';

/**
 * State interface for the XR Glasses hook.
 */
export interface GlassesState {
  /** Whether the service has been initialized */
  initialized: boolean;
  /** Whether glasses are currently connected */
  connected: boolean;
  /** Whether running in a projected device context */
  isProjectedDevice: boolean;
  /** Current engagement mode (visuals/audio state) */
  engagementMode: EngagementMode;
  /** Device capabilities */
  capabilities: DeviceCapabilities | null;
  /** Whether emulation mode is enabled */
  emulationMode: boolean;
}

/**
 * Return type for the useXRGlasses hook.
 */
export interface UseXRGlassesReturn extends GlassesState {
  /** Whether an operation is in progress */
  loading: boolean;
  /** Last error that occurred */
  error: Error | null;
  /** Connect to glasses */
  connect: () => Promise<void>;
  /** Disconnect from glasses */
  disconnect: () => Promise<void>;
  /** Set keep screen on */
  keepScreenOn: (enabled: boolean) => Promise<void>;
  /** Enable/disable emulation mode */
  setEmulationMode: (enabled: boolean) => Promise<void>;
  /** Simulate an input event (emulation mode only) */
  simulateInputEvent: (action: string) => Promise<void>;
  /** Reinitialize the service */
  reinitialize: () => Promise<void>;
}

/**
 * Main hook for XR Glasses functionality.
 *
 * This hook provides a complete interface for interacting with XR glasses,
 * including connection management, state tracking, and emulation support.
 *
 * @example
 * ```tsx
 * function GlassesScreen() {
 *   const {
 *     connected,
 *     loading,
 *     error,
 *     connect,
 *     disconnect,
 *     capabilities,
 *   } = useXRGlasses();
 *
 *   if (loading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return (
 *     <View>
 *       <Text>Connected: {connected ? 'Yes' : 'No'}</Text>
 *       <Button onPress={connected ? disconnect : connect}>
 *         {connected ? 'Disconnect' : 'Connect'}
 *       </Button>
 *     </View>
 *   );
 * }
 * ```
 */
export function useXRGlasses(): UseXRGlassesReturn {
  const serviceRef = useRef<IXRGlassesService | null>(null);

  const [state, setState] = useState<GlassesState>({
    initialized: false,
    connected: false,
    isProjectedDevice: false,
    engagementMode: { visualsOn: false, audioOn: false },
    capabilities: null,
    emulationMode: false,
  });

  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize the service
  const initialize = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const service = getXRGlassesService();
      serviceRef.current = service;

      await service.initialize();

      // Fetch initial state in parallel
      const [isProjected, isConnected, capabilities] = await Promise.all([
        service.isProjectedDevice(),
        service.isGlassesConnected(),
        service.getDeviceCapabilities(),
      ]);

      // Get engagement mode if connected
      let engagementMode: EngagementMode = { visualsOn: false, audioOn: false };
      if (isConnected) {
        engagementMode = await service.getEngagementMode();
      }

      setState(prev => ({
        ...prev,
        initialized: true,
        isProjectedDevice: isProjected,
        connected: isConnected,
        capabilities,
        engagementMode,
        emulationMode: capabilities.isEmulated ?? false,
      }));

    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize on mount and set up event listeners
  useEffect(() => {
    let mounted = true;

    initialize();

    const service = getXRGlassesService();

    // Subscribe to connection state changes
    const connectionSub = service.onConnectionStateChanged((event) => {
      if (mounted) {
        setState(prev => ({ ...prev, connected: event.connected }));
      }
    });

    // Subscribe to engagement mode changes
    const engagementSub = service.onEngagementModeChanged((event) => {
      if (mounted) {
        setState(prev => ({
          ...prev,
          engagementMode: {
            visualsOn: event.visualsOn,
            audioOn: event.audioOn,
          },
        }));
      }
    });

    // Subscribe to device state changes
    const deviceStateSub = service.onDeviceStateChanged((event) => {
      if (mounted) {
        // Handle emulation mode state changes
        if (event.state === 'ACTIVE') {
          setState(prev => ({ ...prev, emulationMode: true }));
        } else if (event.state === 'INACTIVE') {
          setState(prev => ({ ...prev, emulationMode: false }));
        }
      }
    });

    return () => {
      mounted = false;
      connectionSub.remove();
      engagementSub.remove();
      deviceStateSub.remove();
    };
  }, [initialize]);

  // Connect to glasses
  const connect = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) {
      setError(new Error('Service not initialized'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await service.connect();
      const mode = await service.getEngagementMode();
      setState(prev => ({
        ...prev,
        connected: true,
        engagementMode: mode,
      }));
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Disconnect from glasses
  const disconnect = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) {
      setError(new Error('Service not initialized'));
      return;
    }

    try {
      await service.disconnect();
      setState(prev => ({
        ...prev,
        connected: false,
        engagementMode: { visualsOn: false, audioOn: false },
      }));
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  // Keep screen on
  const keepScreenOn = useCallback(async (enabled: boolean) => {
    const service = serviceRef.current;
    if (!service) {
      setError(new Error('Service not initialized'));
      return;
    }

    try {
      await service.keepScreenOn(enabled);
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  // Set emulation mode
  const setEmulationMode = useCallback(async (enabled: boolean) => {
    const service = serviceRef.current;
    if (!service) {
      setError(new Error('Service not initialized'));
      return;
    }

    try {
      await service.setEmulationMode(enabled);

      // Refetch capabilities after changing emulation mode
      const [capabilities, isProjected] = await Promise.all([
        service.getDeviceCapabilities(),
        service.isProjectedDevice(),
      ]);

      setState(prev => ({
        ...prev,
        emulationMode: enabled,
        capabilities,
        isProjectedDevice: isProjected,
      }));
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  // Simulate input event
  const simulateInputEvent = useCallback(async (action: string) => {
    const service = serviceRef.current;
    if (!service) {
      setError(new Error('Service not initialized'));
      return;
    }

    try {
      await service.simulateInputEvent(action);
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  // Reinitialize
  const reinitialize = useCallback(async () => {
    setState({
      initialized: false,
      connected: false,
      isProjectedDevice: false,
      engagementMode: { visualsOn: false, audioOn: false },
      capabilities: null,
      emulationMode: false,
    });
    await initialize();
  }, [initialize]);

  return {
    ...state,
    loading,
    error,
    connect,
    disconnect,
    keepScreenOn,
    setEmulationMode,
    simulateInputEvent,
    reinitialize,
  };
}
