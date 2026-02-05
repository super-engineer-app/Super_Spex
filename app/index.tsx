import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useXRGlasses } from '../src/hooks/useXRGlasses';
import logger from '../src/utils/logger';

const TAG = 'HomeScreen';

/**
 * Home Screen - Simplified
 *
 * Two options:
 * - Connect to real XR Glasses
 * - Demo Mode (for testing without real glasses)
 */
export default function HomeScreen() {
  const router = useRouter();
  const {
    connected,
    loading,
    emulationMode: demoMode,  // Renamed for clarity (vs Android Emulator)
    connect,
    setEmulationMode: setDemoMode,
  } = useXRGlasses();

  // Connect to real glasses
  const handleConnectGlasses = async () => {
    try {
      await setDemoMode(false);
      await connect();
      router.push('/glasses');
    } catch (error) {
      logger.error(TAG, 'Connection failed:', error);
    }
  };

  // Connect in demo mode (no real glasses)
  const handleConnectDemoMode = async () => {
    try {
      await setDemoMode(true);
      await connect();
      router.push('/glasses');
    } catch (error) {
      logger.error(TAG, 'Demo mode connection failed:', error);
    }
  };

  // Already connected - go to dashboard
  const handleGoToDashboard = () => {
    router.push('/glasses');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>XR Glasses</Text>
        <Text style={styles.subtitle}>Connect to get started</Text>

        {connected ? (
          <>
            <View style={styles.connectedBadge}>
              <Text style={styles.connectedText}>
                Connected {demoMode ? '(Demo Mode)' : '(Real Glasses)'}
              </Text>
            </View>
            <Pressable style={styles.primaryButton} onPress={handleGoToDashboard}>
              <Text style={styles.buttonText}>Open Dashboard</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleConnectGlasses}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Connecting...' : 'Connect Glasses'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, loading && styles.buttonDisabled]}
              onPress={handleConnectDemoMode}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Demo Mode</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 40,
  },
  connectedBadge: {
    backgroundColor: '#1a3a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  connectedText: {
    color: '#4a4',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#07f',
    borderRadius: 12,
    padding: 18,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 18,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
