module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // worklets-core powers vision-camera frame processors (camera PPG); the
    // reanimated plugin must stay last per its docs.
    plugins: ['react-native-worklets-core/plugin', 'react-native-reanimated/plugin'],
  };
};
