import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useXRGlasses } from '../../src/hooks/useXRGlasses';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
import { useGlassesCamera } from '../../src/hooks/useGlassesCamera';
import { useRemoteView } from '../../src/hooks/useRemoteView';
import { QualitySelector } from '../../src/components/QualitySelector';
import { useState, useCallback, useEffect } from 'react';
import { sendText, sendImage } from '../../src/services/backendApi';

/**
 * Simplified Glasses Dashboard
 *
 * Core features only:
 * - Capture Audio (with transcript display)
 * - Capture Image (with preview)
 * - Send to AI buttons
 * - Disconnect
 */
export default function GlassesDashboard() {
  const router = useRouter();
  const { connected, emulationMode, disconnect } = useXRGlasses();

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

  const {
    isStreaming,
    viewerUrl,
    viewerCount,
    selectedQuality,
    error: streamError,
    loading: streamLoading,
    startStream,
    stopStream,
    setQuality,
    shareLink,
  } = useRemoteView();

  const [isSendingAudio, setIsSendingAudio] = useState(false);
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraReady) {
        releaseCamera();
      }
    };
  }, [cameraReady, releaseCamera]);

  // Toggle audio capture
  const handleAudioPress = useCallback(async () => {
    if (isListening) {
      await stopListening();
    } else {
      await startListening(true);
    }
  }, [isListening, startListening, stopListening]);

  // Initialize camera or capture image
  const handleImagePress = useCallback(async () => {
    if (!cameraReady) {
      await initializeCamera(false);
    } else {
      await captureImage();
    }
  }, [cameraReady, initializeCamera, captureImage]);

  // Send audio transcript to AI
  const handleSendAudio = useCallback(async () => {
    if (!transcript) return;
    setIsSendingAudio(true);
    setAiResponse('');
    setAiError(null);
    try {
      console.log('Sending transcript to AI:', transcript);
      await sendText(transcript, {
        onChunk: (chunk) => {
          setAiResponse(prev => prev + chunk);
        },
        onComplete: (fullResponse) => {
          console.log('AI response complete:', fullResponse.length, 'chars');
        },
        onError: (error) => {
          setAiError(error.message);
        },
      });
    } catch (error) {
      console.error('Error:', error);
      setAiError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSendingAudio(false);
    }
  }, [transcript]);

  // Send image to AI
  const handleSendImage = useCallback(async () => {
    if (!lastImage) return;
    setIsSendingImage(true);
    setAiResponse('');
    setAiError(null);
    try {
      console.log('Sending image to AI:', lastImageSize);
      await sendImage(lastImage, {
        onChunk: (chunk) => {
          setAiResponse(prev => prev + chunk);
        },
        onComplete: (fullResponse) => {
          console.log('AI response complete:', fullResponse.length, 'chars');
        },
        onError: (error) => {
          setAiError(error.message);
        },
      });
    } catch (error) {
      console.error('Error:', error);
      setAiError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSendingImage(false);
    }
  }, [lastImage, lastImageSize]);

  // Disconnect and go home
  const handleDisconnect = async () => {
    if (isStreaming) {
      await stopStream();
    }
    if (cameraReady) {
      await releaseCamera();
    }
    await disconnect();
    router.replace('/');
  };

  // Not connected - show message
  if (!connected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.title}>Not Connected</Text>
          <Pressable style={styles.button} onPress={() => router.replace('/')}>
            <Text style={styles.buttonText}>Go to Connect</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const displayTranscript = partialTranscript || transcript || '';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <Text style={styles.header}>Glasses Dashboard</Text>
        {emulationMode && <Text style={styles.badge}>EMULATION MODE</Text>}

        {/* Audio Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audio Capture</Text>

          <Pressable
            style={[styles.captureButton, isListening && styles.captureButtonActive]}
            onPress={handleAudioPress}
          >
            <Text style={styles.captureButtonText}>
              {isListening ? 'STOP' : 'RECORD'}
            </Text>
          </Pressable>

          {displayTranscript ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Transcript:</Text>
              <Text style={styles.resultText}>{displayTranscript}</Text>
            </View>
          ) : null}

          {transcript ? (
            <Pressable
              style={[styles.sendButton, isSendingAudio && styles.sendButtonDisabled]}
              onPress={handleSendAudio}
              disabled={isSendingAudio}
            >
              <Text style={styles.sendButtonText}>
                {isSendingAudio ? 'Sending...' : 'Send Audio to AI'}
              </Text>
            </Pressable>
          ) : null}

          {speechError ? <Text style={styles.error}>{speechError}</Text> : null}
        </View>

        {/* Image Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Image Capture</Text>

          <Pressable
            style={[styles.captureButton, styles.captureButtonGreen, cameraReady && styles.captureButtonActive]}
            onPress={handleImagePress}
            disabled={isCapturing}
          >
            <Text style={styles.captureButtonText}>
              {isCapturing ? 'CAPTURING...' : cameraReady ? 'CAPTURE' : 'ENABLE CAM'}
            </Text>
          </Pressable>

          {cameraReady && (
            <Pressable style={styles.releaseButton} onPress={releaseCamera}>
              <Text style={styles.releaseButtonText}>Release Camera</Text>
            </Pressable>
          )}

          {lastImage && lastImageSize ? (
            <View style={styles.imageContainer}>
              <Text style={styles.imageInfo}>
                {lastImageSize.width}x{lastImageSize.height}
              </Text>
              <Image
                source={{ uri: `data:image/jpeg;base64,${lastImage}` }}
                style={styles.imagePreview}
                resizeMode="contain"
              />
              <Pressable
                style={[styles.sendButton, styles.sendButtonGreen, isSendingImage && styles.sendButtonDisabled]}
                onPress={handleSendImage}
                disabled={isSendingImage}
              >
                <Text style={styles.sendButtonText}>
                  {isSendingImage ? 'Sending...' : 'Send Image to AI'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {cameraError ? <Text style={styles.error}>{cameraError}</Text> : null}
        </View>

        {/* Remote View Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remote View</Text>

          {!isStreaming ? (
            <>
              <QualitySelector
                value={selectedQuality}
                onChange={setQuality}
                disabled={streamLoading}
              />
              <Pressable
                style={[styles.captureButton, styles.captureButtonPurple, streamLoading && styles.captureButtonActive]}
                onPress={startStream}
                disabled={streamLoading}
              >
                <Text style={styles.captureButtonText}>
                  {streamLoading ? 'STARTING...' : 'START STREAM'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.streamInfo}>
                <Text style={styles.streamLabel}>Viewers</Text>
                <Text style={styles.viewerCount}>{viewerCount}</Text>
              </View>

              {viewerUrl && (
                <View style={styles.resultBox}>
                  <Text style={styles.resultLabel}>Viewer Link:</Text>
                  <Text style={styles.linkText} numberOfLines={1}>{viewerUrl}</Text>
                </View>
              )}

              <View style={styles.streamButtons}>
                <Pressable style={styles.shareButton} onPress={shareLink}>
                  <Text style={styles.shareButtonText}>Share Link</Text>
                </Pressable>

                <Pressable
                  style={[styles.stopButton, streamLoading && styles.sendButtonDisabled]}
                  onPress={stopStream}
                  disabled={streamLoading}
                >
                  <Text style={styles.stopButtonText}>
                    {streamLoading ? 'STOPPING...' : 'STOP'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {streamError ? <Text style={styles.error}>{streamError}</Text> : null}
        </View>

        {/* AI Response Section */}
        {(aiResponse || aiError || isSendingAudio || isSendingImage) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Response</Text>
            {aiError ? (
              <Text style={styles.error}>{aiError}</Text>
            ) : aiResponse ? (
              <View style={styles.resultBox}>
                <Text style={styles.resultText}>{aiResponse}</Text>
              </View>
            ) : (
              <Text style={styles.loadingText}>Waiting for response...</Text>
            )}
            {aiResponse ? (
              <Pressable
                style={styles.clearButton}
                onPress={() => { setAiResponse(''); setAiError(null); }}
              >
                <Text style={styles.clearButtonText}>Clear Response</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Disconnect */}
        <Pressable style={styles.disconnectButton} onPress={handleDisconnect}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  badge: {
    color: '#ffd700',
    fontSize: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    color: '#fff',
    marginBottom: 20,
  },
  section: {
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  captureButton: {
    backgroundColor: '#c44',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  captureButtonGreen: {
    backgroundColor: '#2a5a2a',
  },
  captureButtonPurple: {
    backgroundColor: '#5a2a8a',
  },
  captureButtonActive: {
    backgroundColor: '#a33',
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resultBox: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  resultLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  resultText: {
    color: '#fff',
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#07f',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  sendButtonGreen: {
    backgroundColor: '#2a7a2a',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  releaseButton: {
    backgroundColor: '#444',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  releaseButtonText: {
    color: '#aaa',
    fontSize: 14,
  },
  imageContainer: {
    marginTop: 12,
  },
  imageInfo: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  error: {
    color: '#f66',
    fontSize: 13,
    marginTop: 8,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
  },
  clearButton: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  clearButtonText: {
    color: '#aaa',
    fontSize: 14,
  },
  disconnectButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#a33',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  disconnectText: {
    color: '#f66',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#07f',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  // Remote View styles
  streamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  streamLabel: {
    color: '#888',
    fontSize: 14,
  },
  viewerCount: {
    color: '#4af',
    fontSize: 24,
    fontWeight: 'bold',
  },
  linkText: {
    color: '#4af',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  streamButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  shareButton: {
    flex: 1,
    backgroundColor: '#2a7a2a',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    flex: 1,
    backgroundColor: '#a33',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
