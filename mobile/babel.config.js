module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // One worklet runtime: Reanimated 4 and VisionCamera 5's frame processors
    // both run on react-native-worklets. Its plugin must stay last.
    plugins: ['react-native-worklets/plugin'],
  };
};
