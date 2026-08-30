import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import { InteractionManager, Platform, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useFonts } from 'expo-font';
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import { SheetProvider } from '../src/components/Sheet';
import { ToastProvider } from '../src/components/Toast';
import { OnboardingGate } from '../src/features/Onboarding';
import { WatchArrivalCards } from '../src/features/WatchArrivals';
import { GarminSyncPill } from '../src/features/hrv/GarminSyncPill';
import { WatchSyncPill } from '../src/features/hrv/WatchSyncPill';
import { HrvSessionHost } from '../src/features/hrv/SessionHost';
import { HealthUpdatePill } from '../src/features/HealthUpdates';
import { WhatsNewPill } from '../src/features/WhatsNew';
import { RestoreGate } from '../src/features/RestoreGate';
import { ReviewPrompt } from '../src/features/ReviewPrompt';
import { initIap } from '../src/store/iap';
import { initTier } from '../src/store/tier';
import { initFaultReporting } from '../src/store/errorReport';
import { initPing } from '../src/store/ping';
import { initGarminReceiver } from '../src/lib/garmin/receiver';
import { repairWatchPairedAsStrap } from '../src/lib/watch/repair';
import { initWatchReceiver } from '../src/lib/watch/receiver';
import { runDailyBackup } from '../src/lib/backup';
import { initCrashWatcher, syncReminder } from '../src/lib/reminders';
import { initWidgetSync } from '../src/lib/widgets';
import { initInsightsBadge } from '../src/store/insightsBadge';
import { loadIssue } from '../src/store/store';
import { installErrorLogging, logError } from '../src/lib/diagnostics/errorLog';
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
    // Record uncaught errors to the on-device log first, so a crash during the
    // rest of this startup sequence still shows up in a support dump. Observes
    // only — the default handler still runs.
    installErrorLogging();
    if (loadIssue?.kind === 'corrupt') logError('store.load', 'journal on disk was unreadable at launch');
    // Open the store connection and read the current Pro entitlement.
    initIap();
    // Stamp/derive the freemium tier (14-day local trial window on first launch).
    initTier();
    // The one network call the app makes: an anonymous daily cohort ping
    // (install's birthday, nothing else). Must follow initTier — it reads the
    // stamp that lands there. See src/store/ping.ts.
    initPing();
    // Drain any fault reports left buffered when the app last stopped — a
    // storm that outran the launch budget, occurrences recorded while offline,
    // a phone killed mid-debounce. Without this, "every occurrence is counted"
    // would quietly mean "every occurrence we got a chance to send". Also
    // registers the background flush. See src/store/errorReport.ts.
    initFaultReporting();
    // Watch companion (iOS only): drain queued stand-test results + relay
    // entitlement. Safe elsewhere (the bridge no-ops), but don't even try.
    if (Platform.OS === 'ios') initWatchReceiver();
    // A watch paired as a strap can never produce an HRV reading (broadcast
    // mode carries no beat-to-beat data), so forget it rather than let the
    // source sit there looking configured.
    repairWatchPairedAsStrap();
    // Garmin companion: re-attach to a paired watch so readings it queued while
    // the phone was away can drain. Connect IQ's transmit fails outright when
    // the phone is unreachable, so the watch holds readings until acked — this
    // is where that backlog is collected. The module self-guards off-platform.
    initGarminReceiver();
    // First-launch-of-the-day JSON snapshot (rotating, kept in Documents/backups).
    // Deferred: serializing a year of waveforms is a single long synchronous
    // stringify, and running it while the first screen is still mounting shows
    // up as a launch hitch (most visibly on mid-range Android). Nothing waits
    // on the snapshot, so let the UI settle first.
    const backup = InteractionManager.runAfterInteractions(() => { void runDailyBackup(); });
    // Reconcile the OS notification schedule with settings.reminder — covers a
    // reinstall, an imported journal, or permission revoked while we were away.
    syncReminder();
    // Crash warning: evaluate the trend now and after journal changes, firing
    // the "rest" notification when a slide is detected (once per day).
    initCrashWatcher();
    // Home-screen widgets: push today's payload now, after journal changes,
    // and on foreground (which also covers the midnight rollover).
    initWidgetSync();
    // The Insights tab's unseen-findings dot: derive it now and after journal
    // changes, so a new finding lights the tab before the user thinks to look.
    initInsightsBadge();
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
    return () => backup.cancel();
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
              {/* "See what's new in x.x" — mounted FIRST of the pills on
                  purpose: siblings paint in order, so it sits behind the two
                  below and can recede into the stacked-card look when either
                  of them takes the slot. */}
              <WhatsNewPill />
              {/* A reading in progress: the pill it folds into when minimized,
                  and the hand-off to the results card when it ends (both have
                  to outlive the card, which the user can close mid-reading). */}
              <HrvSessionHost />
              {/* Watch companion overlays (iOS only): results card on arrival +
                  "Waiting for watch…" pill while the sync card is minimized. */}
              {/* NOT iOS-gated: the Apple Watch is iOS-only, but Garmin
                  delivers readings on both platforms, and a reading that lands
                  with nothing listening drops the user on the Journal with no
                  sign their reading arrived. */}
              <WatchArrivalCards />
              {Platform.OS === 'ios' ? <WatchSyncPill /> : null}
              {/* Garmin ships on both platforms, so this one is not iOS-gated. */}
              <GarminSyncPill />
              {/* Hourly "anything new in the health store?" pill (both
                  platforms — it no-ops until Health is connected). */}
              <HealthUpdatePill />
              {/* Store review ask — renders nothing; waits for a day that's
                  trending up and a calm moment (src/lib/review). */}
              <ReviewPrompt />
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
