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
