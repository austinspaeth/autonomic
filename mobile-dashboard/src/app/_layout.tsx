import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Auth from '../lib/auth';
import { DataProvider } from '../lib/data';
import { AlertsProvider } from '../lib/alertsStore';
import { CelebrationLayer } from '../components/Celebration';
import { C } from '../theme';

export default function RootLayout() {
  const [restored, setRestored] = useState(false);
  const tokens = useSyncExternalStore(Auth.subscribe, Auth.current);

  useEffect(() => {
    Auth.restore().finally(() => setRestored(true));
  }, []);

  if (!restored) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.dim} />
      </View>
    );
  }

  const signedIn = !!tokens;
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* Keyed on the email so signing out drops every cached number with it. */}
      {signedIn ? (
        <DataProvider key={tokens.email}>
          <AlertsProvider>
            {stack}
            {/* Above every screen, never touchable: celebrations draw over the app. */}
            <CelebrationLayer />
          </AlertsProvider>
        </DataProvider>
      ) : (
        stack
      )}
    </SafeAreaProvider>
  );
}
