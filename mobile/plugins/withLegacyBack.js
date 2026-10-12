const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * Keep the Android back button reaching JavaScript.
 *
 * An app targeting SDK 36 is opted IN to predictive back on Android 16: the
 * system stops calling `Activity.onBackPressed()` and delivers back through
 * `OnBackInvokedCallback` instead. React Native 0.79's `ReactActivity` only
 * listens on the old method, so `BackHandler` never fires and the default
 * callback runs — which FINISHES the activity. Every back press (button or
 * edge swipe) therefore closed the app: with a sheet open, on a tab, in the
 * middle of a reading, and the next open remounted the whole tree.
 *
 * `android:enableOnBackInvokedCallback="false"` restores the legacy dispatch,
 * which is what `components/Sheet.tsx`'s `BackHandler` and the tab navigator
 * were written against. Expo sets this itself from SDK 54 (the
 * `android.predictiveBackGestureEnabled` key); SDK 53's prebuild ships the
 * helper but never applies it. Drop this plugin when React Native is on a
 * version whose ReactActivity registers an OnBackInvokedCallback (0.81+).
 */
module.exports = function withLegacyBack(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:enableOnBackInvokedCallback'] = 'false';
    return cfg;
  });
};
