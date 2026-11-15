/**
 * Expo config plugin: lift every pod to the app's own iOS floor.
 *
 * Xcode 27 refuses any iOS deployment target below 15.0 outright (an error,
 * not the old warning), and a few pods still declare 12.x or 13.x. Nothing
 * below the app's floor can ever be installed on, so raising a pod to it
 * changes no behaviour — it only stops the build failing on a number.
 * Nothing at or above the floor is touched.
 *
 * (This file used to be withFmtConstevalFix and also patched fmt's
 * FMT_CONSTEVAL for newer Clang. React Native 0.88 ships a fmt that compiles
 * as it stands, so that half is gone.)
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/** The app's minimum iOS — Expo SDK 56+ requires 16.4. */
const FLOOR = '16.4';
const MARKER = 'pod-deployment-target-floor';
const PATCH = `    # ${MARKER}: Xcode 27 rejects iOS deployment targets below 15.0.
    # Injected by plugins/withPodDeploymentFloor.js.
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        dt = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if dt && Gem::Version.new(dt) < Gem::Version.new('${FLOOR}')
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${FLOOR}'
        end
      end
    end
`;

module.exports = function withPodDeploymentFloor(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let src = fs.readFileSync(podfilePath, 'utf8');
      if (src.includes(MARKER)) return cfg;
      const anchor = 'post_install do |installer|';
      if (!src.includes(anchor)) {
        throw new Error('withPodDeploymentFloor: no post_install hook found in the generated Podfile');
      }
      fs.writeFileSync(podfilePath, src.replace(anchor, `${anchor}\n${PATCH}`));
      return cfg;
    },
  ]);
};
