import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme, View, StyleSheet, Platform, PermissionsAndroid, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeErrorReporting } from '../src/services';

/**
 * Request all necessary permissions for the XR Glasses app.
 * This includes microphone, camera, location, and Bluetooth permissions.
 */
async function requestAllPermissions() {
  if (Platform.OS !== 'android') return;

  try {
    // Define all permissions we need
    const permissions = [
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];

    // Add Bluetooth permissions for Android 12+ (API 31+)
    if (Platform.Version >= 31) {
      permissions.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      );
    }

    // Request all permissions at once
    const results = await PermissionsAndroid.requestMultiple(permissions);

    // Log results for debugging
    console.log('Permission results:', results);

    // Check if any critical permissions were denied
    const deniedPermissions = Object.entries(results)
      .filter(([_, status]) => status !== PermissionsAndroid.RESULTS.GRANTED)
      .map(([permission]) => permission.split('.').pop());

    if (deniedPermissions.length > 0) {
      console.log('Some permissions were denied:', deniedPermissions);
    }
  } catch (error) {
    console.error('Error requesting permissions:', error);
  }
}

/**
 * Root layout component for the XR Glasses app.
 *
 * This component sets up the navigation stack and global providers.
 * It uses a dark theme to match the XR glasses aesthetic.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Initialize error reporting and request permissions on app launch
  useEffect(() => {
    initializeErrorReporting();
    requestAllPermissions();
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar style="light" />
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
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              title: 'XR Glasses',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="connect"
            options={{
              title: 'Connect',
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="glasses"
            options={{
              headerShown: false,
            }}
          />
        </Stack>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
});
