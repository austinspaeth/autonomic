module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo adds `react-native-worklets/plugin` itself (last, as
    // its docs require) whenever the package is installed, so it is NOT
    // listed here: a second copy would workletize every worklet twice. One
    // worklet runtime serves both Reanimated 4 and VisionCamera 5's frame
    // processors, which is why react-native-worklets-core is gone.
    presets: ['babel-preset-expo'],
  };
};
