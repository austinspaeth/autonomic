import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import { View } from 'react-native';
import * as Updates from 'expo-updates';
import { useFonts } from 'expo-font';
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import { SheetProvider } from '../src/components/Sheet';
import { ToastProvider } from '../src/components/Toast';
import { OnboardingGate } from '../src/features/Onboarding';
import { runDailyBackup } from '../src/lib/backup';
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
  // Custom faces for numeric readouts (Manrope) and chart ticks (IBM Plex Mono).
  const [fontsLoaded] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    IBMPlexMono_400Regular,
  });
  useEffect(() => {
    // First-launch-of-the-day JSON snapshot (rotating, kept in Documents/backups).
    runDailyBackup();
    // Pull any published EAS update in the background (preview + production
    // builds alike); a downloaded bundle applies on the next launch.
    (async () => {
      try {
        if (__DEV__ || !Updates.isEnabled) return;
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // updates are best-effort
      }
    })();
  }, []);
  // Hold the (black) splash a beat until the custom faces are registered, so the
  // numeric readouts never flash in a fallback font first.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
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
