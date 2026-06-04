module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@core': './src/core',
            '@data': './src/data',
            '@ui': './src/ui',
          },
          extensions: [
            '.ts',
            '.tsx',
            '.js',
            '.jsx',
            '.json',
            '.web.ts',
            '.web.tsx',
            '.native.ts',
            '.native.tsx',
          ],
        },
      ],
      // react-native-worklets (Reanimated 4) plugin MUST be listed last.
      'react-native-worklets/plugin',
    ],
  };
};
