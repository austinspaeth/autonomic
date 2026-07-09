import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import { View } from 'react-native';
import { SheetProvider } from '../src/components/Sheet';
import { ToastProvider } from '../src/components/Toast';
import { OnboardingGate } from '../src/features/Onboarding';
import { usePalette } from '../src/theme';

function Themed({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StatusBar style={p.dark ? 'light' : 'dark'} />
      {children}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Themed>
          <ToastProvider>
            <SheetProvider>
              <Slot />
              {/* First-run welcome wizard — overlays the tabs until completed,
                  then fades to black and reveals the app beneath. */}
              <OnboardingGate />
            </SheetProvider>
          </ToastProvider>
        </Themed>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
