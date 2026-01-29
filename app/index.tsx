import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useXRGlasses } from '../src/hooks/useXRGlasses';

/**
 * Home screen component.
 *
 * Displays the current XR glasses status and provides navigation
 * to connection and glasses dashboard screens.
 */
export default function HomeScreen() {
  const {
    initialized,
    connected,
    isProjectedDevice,
    capabilities,
    engagementMode,
    emulationMode,
    loading,
    error,
    setEmulationMode,
  } = useXRGlasses();

  // Handle enabling emulation mode
  const handleEnableEmulation = async () => {
    await setEmulationMode(true);
  };

  if (loading && !initialized) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#0066cc" />
          <Text style={styles.loadingText}>Initializing XR Glasses...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorTitle}>Initialization Error</Text>
          <Text style={styles.errorText}>{error.message}</Text>
          <Pressable style={styles.retryButton} onPress={handleEnableEmulation}>
            <Text style={styles.buttonText}>Enable Emulation Mode</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Initialized</Text>
            <View style={[styles.statusIndicator, initialized && styles.statusActive]} />
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Connected</Text>
            <View style={[styles.statusIndicator, connected && styles.statusActive]} />
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Projected Device</Text>
            <View style={[styles.statusIndicator, isProjectedDevice && styles.statusActive]} />
          </View>
          {emulationMode && (
            <View style={styles.emulationBadge}>
              <Text style={styles.emulationText}>EMULATION MODE</Text>
            </View>
          )}
        </View>

        {/* Engagement Mode Card */}
        {connected && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Engagement Mode</Text>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Visuals</Text>
              <View style={[styles.statusIndicator, engagementMode.visualsOn && styles.statusActive]} />
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Audio</Text>
              <View style={[styles.statusIndicator, engagementMode.audioOn && styles.statusActive]} />
            </View>
          </View>
        )}

        {/* Capabilities Card */}
        {capabilities && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Device Capabilities</Text>
            <View style={styles.capabilitiesGrid}>
              <View style={styles.capabilityItem}>
                <View style={[styles.capabilityIcon, capabilities.hasController && styles.capabilityActive]}>
                  <Text style={styles.capabilityEmoji}>
                    {capabilities.hasController ? '1' : '0'}
                  </Text>
                </View>
                <Text style={styles.capabilityLabel}>Controller</Text>
              </View>
              <View style={styles.capabilityItem}>
                <View style={[styles.capabilityIcon, capabilities.hasHandTracking && styles.capabilityActive]}>
                  <Text style={styles.capabilityEmoji}>
                    {capabilities.hasHandTracking ? '1' : '0'}
                  </Text>
                </View>
                <Text style={styles.capabilityLabel}>Hands</Text>
              </View>
              <View style={styles.capabilityItem}>
                <View style={[styles.capabilityIcon, capabilities.hasEyeTracking && styles.capabilityActive]}>
                  <Text style={styles.capabilityEmoji}>
                    {capabilities.hasEyeTracking ? '1' : '0'}
                  </Text>
                </View>
                <Text style={styles.capabilityLabel}>Eyes</Text>
              </View>
              <View style={styles.capabilityItem}>
                <View style={[styles.capabilityIcon, capabilities.hasSpatialApi && styles.capabilityActive]}>
                  <Text style={styles.capabilityEmoji}>
                    {capabilities.hasSpatialApi ? '1' : '0'}
                  </Text>
                </View>
                <Text style={styles.capabilityLabel}>Spatial</Text>
              </View>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Link href="/connect" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>
                {connected ? 'Manage Connection' : 'Connect to Glasses'}
              </Text>
            </Pressable>
          </Link>

          {connected && (
            <Link href="/glasses" asChild>
              <Pressable style={[styles.button, styles.primaryButton]}>
                <Text style={styles.buttonText}>Open Glasses Dashboard</Text>
              </Pressable>
            </Link>
          )}

          {!emulationMode && !connected && (
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={handleEnableEmulation}
            >
              <Text style={styles.buttonText}>Enable Emulation Mode</Text>
            </Pressable>
          )}
        </View>
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
    paddingBottom: 32,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#888888',
    marginTop: 16,
    fontSize: 16,
  },
  errorTitle: {
    color: '#ff6b6b',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorText: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#333333',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  statusLabel: {
    fontSize: 14,
    color: '#cccccc',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#333333',
  },
  statusActive: {
    backgroundColor: '#4ade80',
  },
  emulationBadge: {
    marginTop: 12,
    backgroundColor: '#3b3b00',
    borderRadius: 4,
    padding: 8,
    alignItems: 'center',
  },
  emulationText: {
    color: '#ffd700',
    fontSize: 12,
    fontWeight: '600',
  },
  capabilitiesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  capabilityItem: {
    alignItems: 'center',
  },
  capabilityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  capabilityActive: {
    backgroundColor: '#1a4d1a',
  },
  capabilityEmoji: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  capabilityLabel: {
    fontSize: 12,
    color: '#888888',
  },
  buttonContainer: {
    marginTop: 8,
  },
  button: {
    backgroundColor: '#333333',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#0066cc',
  },
  secondaryButton: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444444',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
