/**
 * Custom entry: expo-router boots the app as before; Android additionally
 * registers the home-screen widget headless task so the OS can (re)render
 * widgets without the UI ever mounting (periodic updates, add, resize).
 */
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/android');
  registerWidgetTaskHandler(widgetTaskHandler);
}

// Pacing alerts with the app closed. Defined here, at bundle load, and not in
// the root layout: a WorkManager job can start a headless runtime that never
// mounts the app (TaskManager only finds tasks defined in the global scope),
// and an iOS HealthKit background-delivery launch needs its observers
// registered before the pending samples are handed over.
try {
  require('./src/store/pacingBackground').definePacingBackground();
} catch {
  // The foreground watcher still runs without it.
}
