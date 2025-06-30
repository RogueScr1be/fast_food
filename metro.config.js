const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);
  
  // Configure alias for @ imports
  config.resolver.alias = {
    '@': path.resolve(__dirname, 'app')
  };
  
  return config;
})();