/**
 * Expo config plugin: keep the watch target's versions in lockstep with the
 * phone app.
 *
 * @bacons/apple-targets hardcodes the watch target's MARKETING_VERSION to
 * "1.0" and only reads CURRENT_PROJECT_VERSION from ios.buildNumber — which
 * this app doesn't set (appVersionSource: remote + autoIncrement). App Store
 * submission rejects a watch app whose versions don't match the companion
 * (error 90379). Until upstream issue #147 / PR #148 lands, this plugin
 * appends a Podfile post_integrate hook that stamps the watch target with the
 * app's expo.version and the EAS-provided build number (falling back to the
 * main target's value for local Xcode builds).
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'watch-build-version-sync';

const hook = (marketingVersion) => `
# ${MARKER}: stamp the watch target with the app's version + build number
# (apple-targets #147 workaround). Injected by plugins/withWatchBuildVersion.js.
post_integrate do |installer|
  begin
    project_path = Dir[File.join(__dir__, '*.xcodeproj')].first
    project = Xcodeproj::Project.open(project_path)
    main = project.targets.find { |t| t.name == 'Autonomic' }
    watch = project.targets.find { |t| t.name == 'AutonomicWatch' }
    if watch
      build_number = ENV['EAS_BUILD_IOS_BUILD_NUMBER']
      watch.build_configurations.each do |c|
        c.build_settings['MARKETING_VERSION'] = '${marketingVersion}'
        if build_number && !build_number.empty?
          c.build_settings['CURRENT_PROJECT_VERSION'] = build_number
        elsif main
          mc = main.build_configurations.find { |x| x.name == c.name }
          mv = mc && mc.build_settings['CURRENT_PROJECT_VERSION']
          c.build_settings['CURRENT_PROJECT_VERSION'] = mv if mv
        end
      end
      project.save
    end
  rescue => e
    Pod::UI.warn "${MARKER} failed: #{e}"
  end
end
`;

module.exports = function withWatchBuildVersion(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let src = fs.readFileSync(podfilePath, 'utf8');
      if (!src.includes(MARKER)) {
        fs.writeFileSync(podfilePath, src + hook(cfg.version || '1.0'));
      }
      return cfg;
    },
  ]);
};
