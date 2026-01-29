import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useXRGlasses } from '../../src/hooks/useXRGlasses';
import { useGlassesInput } from '../../src/hooks/useGlassesInput';

/**
 * Glasses dashboard screen.
 *
 * Main control panel for connected XR glasses, showing status,
 * engagement mode, and navigation to detailed screens.
 */
export default function GlassesDashboard() {
  const router = useRouter();
  const {
    connected,
    engagementMode,
    capabilities,
    emulationMode,
    disconnect,
    simulateInputEvent,
  } = useXRGlasses();

  const { lastEvent } = useGlassesInput();

  // Redirect if not connected
  if (!connected) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.notConnectedContainer}>
          <Text style={styles.notConnectedTitle}>Not Connected</Text>
          <Text style={styles.notConnectedText}>
            Please connect to your XR glasses first.
          </Text>
          <Pressable style={styles.connectButton} onPress={() => router.replace('/connect')}>
            <Text style={styles.buttonText}>Go to Connect</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Handle quick actions
  const handleToggleVisuals = () => simulateInputEvent('TOGGLE_VISUALS');
  const handleToggleAudio = () => simulateInputEvent('TOGGLE_AUDIO');
  const handleDisconnect = async () => {
    await disconnect();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Connection Status */}
        <View style={styles.statusHeader}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Connected</Text>
          {emulationMode && (
            <View style={styles.emulationBadge}>
              <Text style={styles.emulationText}>EMU</Text>
            </View>
          )}
        </View>

        {/* Engagement Mode Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Engagement Mode</Text>
          <View style={styles.engagementGrid}>
            <Pressable
              style={[styles.engagementItem, engagementMode.visualsOn && styles.engagementItemActive]}
              onPress={handleToggleVisuals}
            >
              <Text style={styles.engagementIcon}>V</Text>
              <Text style={styles.engagementLabel}>Visuals</Text>
              <Text style={styles.engagementStatus}>
                {engagementMode.visualsOn ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.engagementItem, engagementMode.audioOn && styles.engagementItemActive]}
              onPress={handleToggleAudio}
            >
              <Text style={styles.engagementIcon}>A</Text>
              <Text style={styles.engagementLabel}>Audio</Text>
              <Text style={styles.engagementStatus}>
                {engagementMode.audioOn ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          </View>
          {emulationMode && (
            <Text style={styles.emulationHint}>Tap to toggle (emulation mode)</Text>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <Link href="/glasses/display" asChild>
              <Pressable style={styles.actionButton}>
                <Text style={styles.actionIcon}>D</Text>
                <Text style={styles.actionLabel}>Display</Text>
              </Pressable>
            </Link>
            <Link href="/glasses/input" asChild>
              <Pressable style={styles.actionButton}>
                <Text style={styles.actionIcon}>I</Text>
                <Text style={styles.actionLabel}>Input</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {/* Last Input Event */}
        {lastEvent && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Last Input Event</Text>
            <View style={styles.eventInfo}>
              <Text style={styles.eventAction}>{lastEvent.action}</Text>
              <Text style={styles.eventTime}>
                {new Date(lastEvent.timestamp).toLocaleTimeString()}
              </Text>
            </View>
          </View>
        )}

        {/* Capabilities Overview */}
        {capabilities && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Capabilities</Text>
            <View style={styles.capsList}>
              <View style={styles.capsRow}>
                <Text style={styles.capsLabel}>Controller</Text>
                <Text style={[styles.capsValue, capabilities.hasController && styles.capsValueActive]}>
                  {capabilities.hasController ? 'Available' : 'Not Available'}
                </Text>
              </View>
              <View style={styles.capsRow}>
                <Text style={styles.capsLabel}>Hand Tracking</Text>
                <Text style={[styles.capsValue, capabilities.hasHandTracking && styles.capsValueActive]}>
                  {capabilities.hasHandTracking ? 'Available' : 'Not Available'}
                </Text>
              </View>
              <View style={styles.capsRow}>
                <Text style={styles.capsLabel}>Eye Tracking</Text>
                <Text style={[styles.capsValue, capabilities.hasEyeTracking && styles.capsValueActive]}>
                  {capabilities.hasEyeTracking ? 'Available' : 'Not Available'}
                </Text>
              </View>
              <View style={styles.capsRow}>
                <Text style={styles.capsLabel}>Spatial API</Text>
                <Text style={[styles.capsValue, capabilities.hasSpatialApi && styles.capsValueActive]}>
                  {capabilities.hasSpatialApi ? 'Available' : 'Not Available'}
                </Text>
              </View>
            </View>
          </View>
        )}

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
    paddingBottom: 32,
  },
  notConnectedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notConnectedTitle: {
    color: '#ff6b6b',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  notConnectedText: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  connectButton: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
    marginRight: 8,
  },
  statusText: {
    color: '#4ade80',
    fontSize: 16,
    fontWeight: '500',
  },
  emulationBadge: {
    marginLeft: 12,
    backgroundColor: '#3b3b00',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  emulationText: {
    color: '#ffd700',
    fontSize: 10,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  engagementGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  engagementItem: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  engagementItemActive: {
    borderColor: '#4ade80',
    backgroundColor: '#1a3d1a',
  },
  engagementIcon: {
    fontSize: 28,
    marginBottom: 8,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  engagementLabel: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 4,
  },
  engagementStatus: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
  },
  emulationHint: {
    color: '#666666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 8,
    color: '#0066cc',
    fontWeight: 'bold',
  },
  actionLabel: {
    color: '#cccccc',
    fontSize: 14,
  },
  eventInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
  },
  eventAction: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  eventTime: {
    color: '#888888',
    fontSize: 12,
  },
  capsList: {
    gap: 8,
  },
  capsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  capsLabel: {
    color: '#cccccc',
    fontSize: 14,
  },
  capsValue: {
    color: '#666666',
    fontSize: 12,
  },
  capsValueActive: {
    color: '#4ade80',
  },
  disconnectButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#cc3300',
  },
  disconnectButtonText: {
    color: '#cc3300',
    fontSize: 16,
    fontWeight: '500',
  },
});
