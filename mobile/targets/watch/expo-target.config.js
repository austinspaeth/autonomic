/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'watch',
  name: 'AutonomicWatch',
  displayName: 'Autonomic',
  // Dot prefix → appended to the phone app's bundle id: com.autonomic.journal.watchkitapp
  bundleIdentifier: '.watchkitapp',
  deploymentTarget: '10.0',
  icon: '../../assets/autonomic-icon.png',
  entitlements: {
    'com.apple.developer.healthkit': true,
    // Shared with the complication widget (last result + live session state).
    'com.apple.security.application-groups': ['group.com.autonomic.journal'],
  },
  images: {
    // White waveform logo mark (from /logo.svg), template-tinted in SwiftUI.
    logo: '../../assets/watch-logo.png',
  },
  colors: {
    // The design's palette, available as Color("...") in SwiftUI.
    accent: '#e03127',
    accentBlue: '#4aa3f0',
    accentAmber: '#e0a030',
    accentGreen: '#3ec46d',
    cardBg: '#161618',
    tileBg: '#131315',
    textDim: '#8a8a92',
  },
};
