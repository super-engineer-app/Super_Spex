import { View, Text, StyleSheet, Pressable, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useXRGlasses } from '../../src/hooks/useXRGlasses';
import { useGlassesInput, InputEventWithId } from '../../src/hooks/useGlassesInput';

/**
 * Input events screen.
 *
 * Displays a log of input events from the glasses and provides
 * controls for simulating events in emulation mode.
 */
export default function InputEventsScreen() {
  const { connected, emulationMode, simulateInputEvent } = useXRGlasses();
  const { lastEvent, eventHistory, clearHistory, isListening } = useGlassesInput();

  // Predefined input actions for simulation
  const simulationActions = [
    { id: 'camera', label: 'Toggle Camera', action: 'TOGGLE_CAMERA' },
    { id: 'visuals', label: 'Toggle Visuals', action: 'TOGGLE_VISUALS' },
    { id: 'audio', label: 'Toggle Audio', action: 'TOGGLE_AUDIO' },
    { id: 'menu', label: 'Open Menu', action: 'MENU_OPEN' },
    { id: 'back', label: 'Back', action: 'BACK' },
    { id: 'select', label: 'Select', action: 'SELECT' },
  ];

  // Handle simulate action
  const handleSimulate = async (action: string) => {
    await simulateInputEvent(action);
  };

  // Render event item
  const renderEventItem = ({ item }: { item: InputEventWithId }) => (
    <View style={styles.eventItem}>
      <View style={styles.eventHeader}>
        <Text style={styles.eventAction}>{item.action}</Text>
        <Text style={styles.eventTime}>
          {new Date(item.timestamp).toLocaleTimeString()}
        </Text>
      </View>
      <Text style={styles.eventTimestamp}>
        {new Date(item.timestamp).toISOString()}
      </Text>
    </View>
  );

  if (!connected) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.notConnectedContainer}>
          <Text style={styles.notConnectedText}>Not connected to glasses</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        {/* Status Header */}
        <View style={styles.statusHeader}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isListening && styles.statusDotActive]} />
            <Text style={styles.statusText}>
              {isListening ? 'Listening for events' : 'Not listening'}
            </Text>
          </View>
          {lastEvent && (
            <Text style={styles.lastEventText}>
              Last: {lastEvent.action}
            </Text>
          )}
        </View>

        {/* Simulation Controls (Emulation Mode Only) */}
        {emulationMode && (
          <View style={styles.simulationCard}>
            <Text style={styles.cardTitle}>Simulate Input</Text>
            <View style={styles.simulationGrid}>
              {simulationActions.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.simulationButton}
                  onPress={() => handleSimulate(item.action)}
                >
                  <Text style={styles.simulationButtonText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Event Log */}
        <View style={styles.eventLogCard}>
          <View style={styles.eventLogHeader}>
            <Text style={styles.cardTitle}>Event Log</Text>
            <Pressable style={styles.clearButton} onPress={clearHistory}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </Pressable>
          </View>

          {eventHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No events yet</Text>
              <Text style={styles.emptyStateSubtext}>
                {emulationMode
                  ? 'Use the simulation buttons above to generate events'
                  : 'Input events from your glasses will appear here'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={eventHistory}
              renderItem={renderEventItem}
              keyExtractor={(item) => item.id}
              style={styles.eventList}
              showsVerticalScrollIndicator={true}
            />
          )}
        </View>

        {/* Event Count */}
        <View style={styles.eventCountContainer}>
          <Text style={styles.eventCountText}>
            {eventHistory.length} event{eventHistory.length !== 1 ? 's' : ''} recorded
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  notConnectedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notConnectedText: {
    color: '#888888',
    fontSize: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#666666',
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: '#4ade80',
  },
  statusText: {
    color: '#888888',
    fontSize: 14,
  },
  lastEventText: {
    color: '#666666',
    fontSize: 12,
  },
  simulationCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  simulationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  simulationButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#333333',
  },
  simulationButtonText: {
    color: '#0066cc',
    fontSize: 13,
    fontWeight: '500',
  },
  eventLogCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  eventLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  clearButtonText: {
    color: '#cc3300',
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    color: '#666666',
    fontSize: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: '#444444',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  eventList: {
    flex: 1,
  },
  eventItem: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
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
  eventTimestamp: {
    color: '#555555',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  eventCountContainer: {
    alignItems: 'center',
  },
  eventCountText: {
    color: '#666666',
    fontSize: 12,
  },
});
