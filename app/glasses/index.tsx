import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useXRGlasses } from '../../src/hooks/useXRGlasses';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
import { useGlassesCamera } from '../../src/hooks/useGlassesCamera';
import { useState, useCallback, useEffect } from 'react';

/**
 * Glasses Dashboard
 *
 * Clean card-based UI matching the original design with:
 * - Engagement Mode toggles (Visuals/Audio)
 * - Quick Actions (Display/Input)
 * - Voice Input with MIC button
 * - Camera Capture with CAM button
 */
export default function GlassesDashboard() {
  const router = useRouter();
  const {
    connected,
    emulationMode,
    disconnect,
    engagementMode,
  } = useXRGlasses();

  const {
    isListening,
    transcript,
    partialTranscript,
    error: speechError,
    startListening,
    stopListening,
  } = useSpeechRecognition();

  const {
    isReady: cameraReady,
    isCapturing,
    lastImage,
    lastImageSize,
    error: cameraError,
    isEmulated: cameraEmulated,
    initializeCamera,
    captureImage,
    releaseCamera,
  } = useGlassesCamera();

  const [isSending, setIsSending] = useState(false);

  // Local engagement mode state for emulation toggling
  const [localVisualsOn, setLocalVisualsOn] = useState(engagementMode?.visualsOn ?? true);
  const [localAudioOn, setLocalAudioOn] = useState(engagementMode?.audioOn ?? true);

  // Sync with real engagement mode when available
  useEffect(() => {
    if (engagementMode) {
      setLocalVisualsOn(engagementMode.visualsOn);
      setLocalAudioOn(engagementMode.audioOn);
    }
  }, [engagementMode]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraReady) {
        releaseCamera();
      }
    };
  }, [cameraReady, releaseCamera]);

  // Toggle listening
  const handleMicPress = useCallback(async () => {
    if (isListening) {
      await stopListening();
    } else {
      await startListening(true);
    }
  }, [isListening, startListening, stopListening]);

  // Initialize or capture
  const handleCameraPress = useCallback(async () => {
    if (!cameraReady) {
      await initializeCamera(false);
    } else {
      await captureImage();
    }
  }, [cameraReady, initializeCamera, captureImage]);

  // Send to backend
  const handleSendToAI = useCallback(async () => {
    if (!transcript && !lastImage) return;

    setIsSending(true);
    try {
      // TODO: Replace with actual backend endpoint
      const payload = {
        transcript: transcript || null,
        image: lastImage || null,
        imageSize: lastImageSize || null,
        timestamp: Date.now(),
      };
      console.log('Sending to AI:', { hasTranscript: !!transcript, hasImage: !!lastImage });

      // Simulate backend call
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Backend error:', error);
    } finally {
      setIsSending(false);
    }
  }, [transcript, lastImage, lastImageSize]);

  // Clear captured image
  const handleClearImage = useCallback(() => {
    // This would need to be implemented in the hook
    // For now, release and re-init
    releaseCamera();
  }, [releaseCamera]);

  // Disconnect handler
  const handleDisconnect = async () => {
    if (cameraReady) {
      await releaseCamera();
    }
    await disconnect();
    router.replace('/');
  };

  // Toggle engagement modes (emulation only)
  const toggleVisuals = () => {
    if (emulationMode) {
      setLocalVisualsOn(!localVisualsOn);
    }
  };

  const toggleAudio = () => {
    if (emulationMode) {
      setLocalAudioOn(!localAudioOn);
    }
  };

  // Redirect if not connected
  if (!connected) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContent}>
          <Text style={styles.notConnectedTitle}>Not Connected</Text>
          <Text style={styles.notConnectedText}>
            Connect to your XR glasses to continue.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/connect')}>
            <Text style={styles.primaryButtonText}>Connect</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const displayText = partialTranscript || transcript || '';
  const hasContent = !!(transcript || lastImage);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>

        {/* Engagement Mode Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Engagement Mode</Text>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleButton, localVisualsOn && styles.toggleButtonActive]}
              onPress={toggleVisuals}
            >
              <Text style={[styles.toggleLetter, localVisualsOn && styles.toggleLetterActive]}>V</Text>
              <Text style={styles.toggleLabel}>Visuals</Text>
              <Text style={[styles.toggleStatus, localVisualsOn && styles.toggleStatusActive]}>
                {localVisualsOn ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, localAudioOn && styles.toggleButtonActive]}
              onPress={toggleAudio}
            >
              <Text style={[styles.toggleLetter, localAudioOn && styles.toggleLetterActive]}>A</Text>
              <Text style={styles.toggleLabel}>Audio</Text>
              <Text style={[styles.toggleStatus, localAudioOn && styles.toggleStatusActive]}>
                {localAudioOn ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          </View>
          {emulationMode && (
            <Text style={styles.hintText}>Tap to toggle (emulation mode)</Text>
          )}
        </View>

        {/* Quick Actions Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          <View style={styles.toggleRow}>
            <Pressable style={styles.actionButton}>
              <Text style={styles.actionLetter}>D</Text>
              <Text style={styles.actionLabel}>Display</Text>
            </Pressable>
            <Pressable style={styles.actionButton}>
              <Text style={styles.actionLetter}>I</Text>
              <Text style={styles.actionLabel}>Input</Text>
            </Pressable>
          </View>
        </View>

        {/* Voice Input Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Voice Input</Text>
          <Pressable
            style={[styles.micButton, isListening && styles.micButtonActive]}
            onPress={handleMicPress}
          >
            <Text style={[styles.micLabel, isListening && styles.micLabelActive]}>MIC</Text>
            <Text style={styles.micStatus}>
              {isListening ? 'Stop Listening' : 'Start Listening'}
            </Text>
          </Pressable>

          {/* Transcript */}
          {displayText ? (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptLabel}>Transcript:</Text>
              <Text style={styles.transcriptText}>{displayText}</Text>
            </View>
          ) : null}

          {/* Send to AI Button */}
          {(transcript || lastImage) && (
            <Pressable
              style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
              onPress={handleSendToAI}
              disabled={isSending}
            >
              <Text style={styles.sendButtonText}>
                {isSending ? 'Sending...' : 'Send to AI'}
              </Text>
            </Pressable>
          )}

          {speechError && (
            <Text style={styles.errorText}>{speechError}</Text>
          )}
        </View>

        {/* Camera Capture Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Camera Capture</Text>
          <View style={styles.cameraRow}>
            <Pressable
              style={[styles.camButton, cameraReady && styles.camButtonActive]}
              onPress={handleCameraPress}
              disabled={isCapturing}
            >
              <Text style={[styles.camLabel, cameraReady && styles.camLabelActive]}>CAM</Text>
              <Text style={styles.camStatus}>
                {isCapturing ? 'Capturing...' : cameraReady ? 'Capture Photo' : 'Enable Camera'}
              </Text>
            </Pressable>
            {cameraReady && (
              <Pressable style={styles.releaseButton} onPress={releaseCamera}>
                <Text style={styles.releaseButtonText}>Release</Text>
              </Pressable>
            )}
          </View>

          {/* Camera Status */}
          {cameraReady && (
            <Text style={styles.cameraStatus}>
              Camera ready{cameraEmulated ? ' (emulated)' : ''}
            </Text>
          )}

          {/* Image Preview */}
          {lastImage && lastImageSize && (
            <View style={styles.imagePreviewContainer}>
              <View style={styles.imageHeader}>
                <Text style={styles.imageSize}>
                  Captured: {lastImageSize.width}x{lastImageSize.height}
                </Text>
                <Pressable onPress={handleClearImage}>
                  <Text style={styles.clearLink}>Clear</Text>
                </Pressable>
              </View>
              <Image
                source={{ uri: `data:image/jpeg;base64,${lastImage}` }}
                style={styles.imagePreview}
                resizeMode="contain"
              />
            </View>
          )}

          {/* Camera Note */}
          {emulationMode && (
            <Text style={styles.noteText}>
              Note: Camera capture not available in emulator
            </Text>
          )}

          {cameraError && (
            <Text style={styles.errorText}>{cameraError}</Text>
          )}
        </View>

        {/* Disconnect Button */}
        <Pressable style={styles.disconnectButton} onPress={handleDisconnect}>
          <Text style={styles.disconnectButtonText}>Disconnect</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notConnectedTitle: {
    color: '#ff6b6b',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  notConnectedText: {
    color: '#888888',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#0066cc',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Card styles
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#4ade80',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },

  // Engagement Mode toggles
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    backgroundColor: '#2d4a2d',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3d6a3d',
  },
  toggleButtonActive: {
    backgroundColor: '#2d5a2d',
    borderColor: '#4ade80',
  },
  toggleLetter: {
    color: '#4ade80',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  toggleLetterActive: {
    color: '#4ade80',
  },
  toggleLabel: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 4,
  },
  toggleStatus: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleStatusActive: {
    color: '#ffffff',
  },
  hintText: {
    color: '#666666',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
  },

  // Quick Actions
  actionButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
  },
  actionLetter: {
    color: '#6b8aff',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  actionLabel: {
    color: '#ffffff',
    fontSize: 14,
  },

  // Voice Input - MIC button
  micButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  micButtonActive: {
    backgroundColor: '#4a2a2a',
    borderWidth: 2,
    borderColor: '#ff6b6b',
  },
  micLabel: {
    color: '#ff6b6b',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  micLabelActive: {
    color: '#ff6b6b',
  },
  micStatus: {
    color: '#ffffff',
    fontSize: 14,
  },

  // Transcript
  transcriptBox: {
    backgroundColor: '#252525',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  transcriptLabel: {
    color: '#666666',
    fontSize: 12,
    marginBottom: 4,
  },
  transcriptText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 22,
  },

  // Send to AI button
  sendButton: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Camera - CAM button
  cameraRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  camButton: {
    flex: 1,
    backgroundColor: '#2d4a2d',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3d6a3d',
  },
  camButtonActive: {
    backgroundColor: '#2d5a2d',
    borderColor: '#4ade80',
  },
  camLabel: {
    color: '#4ade80',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  camLabelActive: {
    color: '#4ade80',
  },
  camStatus: {
    color: '#ffffff',
    fontSize: 14,
  },
  releaseButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  releaseButtonText: {
    color: '#888888',
    fontSize: 14,
  },
  cameraStatus: {
    color: '#4ade80',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },

  // Image Preview
  imagePreviewContainer: {
    marginTop: 8,
  },
  imageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  imageSize: {
    color: '#888888',
    fontSize: 13,
  },
  clearLink: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '500',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#000000',
  },

  noteText: {
    color: '#666666',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },

  // Error text
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    marginTop: 8,
  },

  // Disconnect
  disconnectButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#662222',
    marginTop: 8,
  },
  disconnectButtonText: {
    color: '#cc4444',
    fontSize: 16,
    fontWeight: '500',
  },
});
