/**
 * Adopt the UIScene life cycle, which iOS 27 REQUIRES: an app linked against
 * the iOS 27 SDK that still uses the app-delegate window traps at launch
 * (EXC_BREAKPOINT in UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
 *
 * Expo 57 ships the scene delegate (`ExpoAppSceneDelegate`, objc name
 * `EXExpoAppSceneDelegate`) but no prebuild switch for it, so this does the
 * two things it needs:
 *   1. declare it in Info.plist's UIApplicationSceneManifest;
 *   2. make the AppDelegate an `ExpoReactNativeFactoryProvider` that creates
 *      the React Native factory but NOT the window. The scene delegate creates
 *      the window and starts React Native into it.
 */
const { withInfoPlist, withAppDelegate } = require('expo/config-plugins');

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: 'EXExpoAppSceneDelegate' },
        ],
      },
    };
    return c;
  });
  config = withAppDelegate(config, (c) => {
    let src = c.modResults.contents;
    if (c.modResults.language !== 'swift') throw new Error('withSceneLifecycle expects a Swift AppDelegate');
    src = src.replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    // The window and the React Native start move to the scene delegate.
    src = src.replace(
      /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/,
      '    // The window and React Native are started by EXExpoAppSceneDelegate (iOS 27 scene life cycle).\n',
    );
    if (src.includes('factory.startReactNative(')) throw new Error('withSceneLifecycle: AppDelegate template changed; update the plugin');
    c.modResults.contents = src;
    return c;
  });
  return config;
};
