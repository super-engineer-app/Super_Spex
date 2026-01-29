import { Stack } from 'expo-router';

/**
 * Layout component for the glasses section.
 *
 * Provides nested navigation for glasses-related screens
 * including dashboard, display controls, and input events.
 */
export default function GlassesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0a0a0a',
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: '600',
        },
        contentStyle: {
          backgroundColor: '#0a0a0a',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Glasses Dashboard',
        }}
      />
      <Stack.Screen
        name="display"
        options={{
          title: 'Display Controls',
        }}
      />
      <Stack.Screen
        name="input"
        options={{
          title: 'Input Events',
        }}
      />
    </Stack>
  );
}
