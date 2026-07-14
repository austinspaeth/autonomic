import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import { Platform, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useFonts } from 'expo-font';
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import { SheetProvider } from '../src/components/Sheet';
import { ToastProvider } from '../src/components/Toast';
import { OnboardingGate } from '../src/features/Onboarding';
import { WatchArrivalCards } from '../src/features/WatchArrivals';
import { WatchSyncPill } from '../src/features/hrv/WatchSyncPill';
import { RestoreGate } from '../src/features/RestoreGate';
import { initIap } from '../src/store/iap';
import { initTier } from '../src/store/tier';
import { initWatchReceiver } from '../src/lib/watch/receiver';
import { runDailyBackup } from '../src/lib/backup';
import { loadIssue } from '../src/store/store';
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
  // When launch found no journal (or an unreadable one), hold onboarding back
  // and let RestoreGate offer the on-device snapshots first. Restoring fills
  // the store before OnboardingGate mounts, so the wizard is skipped; starting
  // fresh (or having no snapshots) falls through to it.
  const [restoreResolved, setRestoreResolved] = React.useState(() => !loadIssue);
  // Custom faces for numeric readouts (Manrope) and chart ticks (IBM Plex Mono).
  const [fontsLoaded] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    IBMPlexMono_400Regular,
  });
  useEffect(() => {
    // Open the store connection and read the current Pro entitlement.
    initIap();
    // Stamp/derive the freemium tier (7-day local trial window on first launch).
    initTier();
    // Watch companion (iOS only): drain queued stand-test results + relay
    // entitlement. Safe elsewhere (the bridge no-ops), but don't even try.
    if (Platform.OS === 'ios') initWatchReceiver();
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
              {/* Watch companion overlays (iOS only): results card on arrival +
                  "Waiting for watch…" pill while the sync card is minimized. */}
              {Platform.OS === 'ios' ? <WatchArrivalCards /> : null}
              {Platform.OS === 'ios' ? <WatchSyncPill /> : null}
              {/* Freemium: no blocking paywall. Locked surfaces raise the
                  PaywallCard sheet on demand (src/features/Paywall.tsx). */}
              {/* First-run welcome wizard — overlays the tabs until completed,
                  then fades to black and reveals the app beneath. Deferred
                  until any launch-time restore offer is resolved. */}
              {restoreResolved ? <OnboardingGate /> : <RestoreGate onDone={() => setRestoreResolved(true)} />}
            </SheetProvider>
          </ToastProvider>
        </Themed>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
