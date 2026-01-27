module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Keep expo-router plugin (warning is fine; not your blocker)
      'expo-router/babel',

      // IMPORTANT:
      // '@' must point to project root, NOT './app'
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './',
          },
          extensions: [
            '.ios.js',
            '.android.js',
            '.js',
            '.ts',
            '.tsx',
            '.json',
          ],
        },
      ],
    ],
  };
};
