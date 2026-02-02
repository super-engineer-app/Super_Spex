import { useEffect, useState, useCallback } from 'react';
import { Share, Platform } from 'react-native';
import {
  XRGlassesNative,
  StreamStartedEvent,
  StreamStoppedEvent,
  StreamErrorEvent,
  ViewerUpdateEvent,
  StreamCameraSourceChangedEvent,
  StreamQuality,
} from '../../modules/xr-glasses';

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
  /** Camera source being used for streaming (e.g., "PHONE CAMERA (Demo Mode)" or "GLASSES CAMERA") */
  cameraSource: string | null;
  /** Whether streaming is using demo mode (phone camera instead of glasses) */
  isDemoMode: boolean;
}

/**
 * Return type for the useRemoteView hook.
 */
export interface UseRemoteViewReturn extends RemoteViewState {
  /** Start streaming with current quality setting */
  startStream: () => Promise<void>;
  /** Stop streaming */
  stopStream: () => Promise<void>;
  /** Set quality preset */
  setQuality: (quality: StreamQuality) => void;
  /** Share the viewer URL via native share sheet */
  shareLink: () => Promise<void>;
  /** Clear any error state */
  clearError: () => void;
}

/**
 * Quality preset display info.
 */
export const QUALITY_OPTIONS: Record<StreamQuality, {
  label: string;
  description: string;
}> = {
  low_latency: {
    label: 'Low Latency',
    description: '480p - Fastest response',
  },
  balanced: {
    label: 'Balanced',
    description: '720p - Recommended',
  },
  high_quality: {
    label: 'High Quality',
    description: '720p 30fps - Best visual',
  },
};

/**
 * Hook for managing Remote View streaming.
 *
 * Provides a complete interface for streaming the glasses camera view
 * to remote viewers via Agora, including quality selection and sharing.
 *
 * @example
 * ```tsx
 * function RemoteViewSection() {
 *   const {
 *     isStreaming,
 *     viewerUrl,
 *     viewerCount,
 *     selectedQuality,
 *     startStream,
 *     stopStream,
 *     setQuality,
 *     shareLink,
 *   } = useRemoteView();
 *
 *   return (
 *     <View>
 *       <QualitySelector
 *         value={selectedQuality}
 *         onChange={setQuality}
 *         disabled={isStreaming}
 *       />
 *       {isStreaming ? (
 *         <>
 *           <Text>Viewers: {viewerCount}</Text>
 *           <Button onPress={shareLink}>Share Link</Button>
 *           <Button onPress={stopStream}>Stop</Button>
 *         </>
 *       ) : (
 *         <Button onPress={startStream}>Start Remote View</Button>
 *       )}
 *     </View>
 *   );
 * }
 * ```
 */
export function useRemoteView(): UseRemoteViewReturn {
  const [state, setState] = useState<RemoteViewState>({
    isStreaming: false,
    channelId: null,
    viewerUrl: null,
    viewerCount: 0,
    selectedQuality: 'balanced',
    error: null,
    loading: false,
    cameraSource: null,
    isDemoMode: false,
  });

  // Set up event listeners
  useEffect(() => {
    let mounted = true;

    // Stream started event
    const startedSub = XRGlassesNative.addListener(
      'onStreamStarted',
      (event: StreamStartedEvent) => {
        if (mounted) {
          console.log('[RemoteView] Stream started:', event.viewerUrl);
          setState(prev => ({
            ...prev,
            isStreaming: true,
            channelId: event.channelId,
            viewerUrl: event.viewerUrl,
            error: null,
            loading: false,
          }));
        }
      }
    );

    // Stream stopped event
    const stoppedSub = XRGlassesNative.addListener(
      'onStreamStopped',
      (_event: StreamStoppedEvent) => {
        if (mounted) {
          console.log('[RemoteView] Stream stopped');
          setState(prev => ({
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
      }
    );

    // Stream error event
    const errorSub = XRGlassesNative.addListener(
      'onStreamError',
      (event: StreamErrorEvent) => {
        if (mounted) {
          console.error('[RemoteView] Stream error:', event.message);
          setState(prev => ({
            ...prev,
            error: event.message,
            loading: false,
          }));
        }
      }
    );

    // Viewer update event
    const viewerSub = XRGlassesNative.addListener(
      'onViewerUpdate',
      (event: ViewerUpdateEvent) => {
        if (mounted) {
          console.log('[RemoteView] Viewer update:', event.viewerCount);
          setState(prev => ({
            ...prev,
            viewerCount: event.viewerCount,
          }));
        }
      }
    );

    // Camera source changed event
    const cameraSourceSub = XRGlassesNative.addListener(
      'onStreamCameraSourceChanged',
      (event: StreamCameraSourceChangedEvent) => {
        if (mounted) {
          console.log('[RemoteView] Camera source changed:', event.cameraSource, 'demoMode:', event.isDemoMode);
          setState(prev => ({
            ...prev,
            cameraSource: event.cameraSource,
            isDemoMode: event.isDemoMode ?? event.isEmulationMode,  // Use new name with fallback
          }));
        }
      }
    );

    // Check initial streaming state
    XRGlassesNative.isRemoteViewActive().then(active => {
      if (mounted && active) {
        setState(prev => ({ ...prev, isStreaming: active }));
      }
    }).catch(console.error);

    return () => {
      mounted = false;
      startedSub.remove();
      stoppedSub.remove();
      errorSub.remove();
      viewerSub.remove();
      cameraSourceSub.remove();
    };
  }, []);

  // Start streaming
  const startStream = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      console.log('[RemoteView] Starting stream with quality:', state.selectedQuality);
      await XRGlassesNative.startRemoteView(state.selectedQuality);
      // State will be updated via onStreamStarted event
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to start stream';
      console.error('[RemoteView] Start failed:', error);
      setState(prev => ({ ...prev, error, loading: false }));
    }
  }, [state.selectedQuality]);

  // Stop streaming
  const stopStream = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));

    try {
      console.log('[RemoteView] Stopping stream');
      await XRGlassesNative.stopRemoteView();
      // State will be updated via onStreamStopped event
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to stop stream';
      console.error('[RemoteView] Stop failed:', error);
      setState(prev => ({ ...prev, error, loading: false }));
    }
  }, []);

  // Set quality
  const setQuality = useCallback((quality: StreamQuality) => {
    setState(prev => ({ ...prev, selectedQuality: quality }));

    // If currently streaming, update quality on the fly
    if (state.isStreaming) {
      XRGlassesNative.setRemoteViewQuality(quality).catch(e => {
        console.error('[RemoteView] Failed to update quality:', e);
      });
    }
  }, [state.isStreaming]);

  // Share link
  const shareLink = useCallback(async () => {
    if (!state.viewerUrl) {
      console.warn('[RemoteView] No viewer URL to share');
      return;
    }

    try {
      const result = await Share.share({
        message: state.viewerUrl,
        url: Platform.OS === 'ios' ? state.viewerUrl : undefined,
      });

      if (result.action === Share.sharedAction) {
        console.log('[RemoteView] Link shared successfully');
      }
    } catch (e) {
      console.error('[RemoteView] Share failed:', e);
    }
  }, [state.viewerUrl]);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
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
