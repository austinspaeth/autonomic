// Metro config. Adds a web platform by swapping native-only modules for web
// shims (see web-shims/). MMKV gets a real localStorage-backed shim so the data
// store works; BLE + HealthKit resolve to empty modules (unavailable in a
// browser — their wrappers already degrade to no-op stubs at runtime).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const WEB_SHIMS = {
  'react-native-mmkv': path.resolve(__dirname, 'web-shims/mmkv.js'),
  'react-native-ble-plx': path.resolve(__dirname, 'web-shims/empty.js'),
  '@kingstinct/react-native-healthkit': path.resolve(__dirname, 'web-shims/empty.js'),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) {
    return { type: 'sourceFile', filePath: WEB_SHIMS[moduleName] };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
