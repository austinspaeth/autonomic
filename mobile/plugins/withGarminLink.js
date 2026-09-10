const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

/**
 * Info.plist entries the Connect IQ Companion SDK requires on iOS.
 *
 * All four are load-bearing and fail in different, quiet ways if missing:
 *  - CFBundleURLTypes      Garmin Connect hands the chosen devices back through
 *                          this scheme. Without it device selection silently
 *                          returns nothing.
 *  - LSApplicationQueriesSchemes  iOS refuses to open — or even report the
 *                          existence of — a scheme that is not declared here.
 *                          `gcm-ciq` is what the SDK probes to decide whether
 *                          Garmin Connect is installed. `garminconnect` is what
 *                          our own "Open Garmin Connect" button uses; without
 *                          it that button silently falls through to the App
 *                          Store even when the app is installed.
 *  - NSBluetoothAlwaysUsageDescription  required since iOS 13 and rejected at
 *                          submission if absent.
 *  - UIBackgroundModes bluetooth-central  lets iOS wake Autonomic when the
 *                          watch has a reading to deliver, so a reading taken
 *                          with the phone locked still arrives.
 */
const URL_SCHEME = 'autonomic-ciq';
const GCM_PACKAGE = 'com.garmin.android.apps.connectmobile';

/**
 * Android 11+ package visibility.
 *
 * The Connect IQ SDK reaches the watch by binding to a service inside Garmin
 * Connect. Since API 30 an app cannot see — let alone bind to — another package
 * unless it declares it here. Without this the SDK simply reports no devices,
 * with no error and nothing in logcat that names the cause.
 */
function withGarminQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries || [];
    const already = manifest.queries.some((q) =>
      (q.package || []).some((p) => p.$?.['android:name'] === GCM_PACKAGE),
    );
    if (!already) {
      manifest.queries.push({ package: [{ $: { 'android:name': GCM_PACKAGE } }] });
    }
    return cfg;
  });
}

module.exports = function withGarminLink(config) {
  return withGarminQueries(withInfoPlistEntries(config));
};

function withInfoPlistEntries(config) {
  return withInfoPlist(config, (cfg) => {
    const plist = cfg.modResults;

    plist.CFBundleURLTypes = plist.CFBundleURLTypes || [];
    const already = plist.CFBundleURLTypes.some((t) =>
      (t.CFBundleURLSchemes || []).includes(URL_SCHEME),
    );
    if (!already) {
      plist.CFBundleURLTypes.push({
        CFBundleURLName: 'care.autonomic.connectiq',
        CFBundleTypeRole: 'None',
        CFBundleURLSchemes: [URL_SCHEME],
      });
    }

    plist.LSApplicationQueriesSchemes = plist.LSApplicationQueriesSchemes || [];
    for (const scheme of ['gcm-ciq', 'garminconnect', 'gcm']) {
      if (!plist.LSApplicationQueriesSchemes.includes(scheme)) {
        plist.LSApplicationQueriesSchemes.push(scheme);
      }
    }

    if (!plist.NSBluetoothAlwaysUsageDescription) {
      plist.NSBluetoothAlwaysUsageDescription =
        'Autonomic uses Bluetooth to receive heart rate readings from your Garmin watch and chest strap.';
    }

    plist.UIBackgroundModes = plist.UIBackgroundModes || [];
    if (!plist.UIBackgroundModes.includes('bluetooth-central')) {
      plist.UIBackgroundModes.push('bluetooth-central');
    }

    return cfg;
  });
}
