const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's browser worker imports its SQLite WebAssembly binary.
config.resolver.assetExts.push('wasm');

module.exports = config;
