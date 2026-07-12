/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'watch-widget',
  name: 'AutonomicComplication',
  displayName: 'Autonomic',
  // Appended to the phone app's bundle id. NOT ".watchkitapp.complication" —
  // Apple's portal rejects App IDs with that exact suffix as "not available"
  // (developer.apple.com/forums/thread/776154).
  bundleIdentifier: '.watchkitapp.widgets',
  deploymentTarget: '10.0',
  entitlements: {
    // Shares last-result/session state with the watch app (widgets are a
    // separate process; plain UserDefaults doesn't cross it).
    'com.apple.security.application-groups': ['group.com.autonomic.journal'],
  },
  images: {
    logo: '../../assets/watch-logo.png',
  },
};
