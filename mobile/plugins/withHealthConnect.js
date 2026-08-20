/**
 * Health Connect wiring (Android only; iOS untouched).
 *
 * Health Connect requires two manifest declarations beyond the
 * android.permission.health.* entries (those live in app.json `android.permissions`):
 *  - An ACTION_SHOW_PERMISSIONS_RATIONALE intent filter on MainActivity, shown
 *    when the user taps the app's privacy policy link inside Health Connect
 *    (Android 13 and below).
 *  - A ViewPermissionUsageActivity activity-alias with the HEALTH_PERMISSIONS
 *    category, the Android 14+ equivalent.
 *
 * It also registers react-native-health-connect's permission delegate in
 * MainActivity.onCreate — without it, requestPermission() throws
 * "lateinit property requestPermission has not been initialized" and kills
 * the app the first time the user taps Connect.
 *
 * react-native-health-connect ships no config plugin, so this local plugin
 * applies all of it.
 */
const { withAndroidManifest, withMainActivity } = require('expo/config-plugins');

function addPermissionDelegate(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('HealthConnectPermissionDelegate')) {
      src = src.replace(
        'import expo.modules.ReactActivityDelegateWrapper',
        'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate\nimport expo.modules.ReactActivityDelegateWrapper',
      );
      src = src.replace(
        'super.onCreate(null)',
        'super.onCreate(null)\n    HealthConnectPermissionDelegate.setPermissionDelegate(this)',
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withHealthConnect(config) {
  config = addPermissionDelegate(config);
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    const mainActivity = (app.activity || []).find(
      (a) => a.$['android:name'] === '.MainActivity'
    );
    if (mainActivity) {
      mainActivity['intent-filter'] = mainActivity['intent-filter'] || [];
      const hasRationale = mainActivity['intent-filter'].some((f) =>
        (f.action || []).some(
          (a) => a.$['android:name'] === 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE'
        )
      );
      if (!hasRationale) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }],
        });
      }
    }

    app['activity-alias'] = app['activity-alias'] || [];
    const hasAlias = app['activity-alias'].some(
      (a) => a.$['android:name'] === 'ViewPermissionUsageActivity'
    );
    if (!hasAlias) {
      app['activity-alias'].push({
        $: {
          'android:name': 'ViewPermissionUsageActivity',
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
            category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
          },
        ],
      });
    }

    return cfg;
  });
};
