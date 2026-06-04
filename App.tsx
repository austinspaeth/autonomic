import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useThemeContext } from '@ui/theme/ThemeProvider';
import { AppShell } from '@ui/AppShell';
import { setupPWA } from '@ui/pwa';
import { RepositoryProvider, useRepository, useRepoSelector } from '@data/RepositoryProvider';

function ThemedStatusBar() {
  const { name } = useThemeContext();
  return <StatusBar style={name === 'dark' ? 'light' : 'dark'} />;
}

function ThemedRoot() {
  const repo = useRepository();
  const theme = useRepoSelector((r) => r.getSettings().theme);
  return (
    <ThemeProvider value={theme} onChange={(name) => repo.setTheme(name)}>
      <ThemedStatusBar />
      <AppShell />
    </ThemeProvider>
  );
}

export default function App() {
  useEffect(() => {
    setupPWA();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RepositoryProvider>
          <ThemedRoot />
        </RepositoryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
