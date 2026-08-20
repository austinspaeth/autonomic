/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'AutonomicWidgets',
  displayName: 'Autonomic',
  // Appended to the phone app's bundle id: com.autonomic.journal.widgets
  // (the watch complication lives under .watchkitapp.widgets).
  bundleIdentifier: '.widgets',
  // containerBackground / contentMarginsDisabled need 17; the phone app itself
  // stays at its lower minimum — the widgets just don't appear below 17.
  deploymentTarget: '17.0',
  entitlements: {
    // The phone app writes the payload (modules/widget-bridge) into this group;
    // the widget process reads it back (WidgetModel.swift).
    'com.apple.security.application-groups': ['group.com.autonomic.journal'],
  },
};
