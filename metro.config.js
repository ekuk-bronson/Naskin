// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native-fast-tflite expects model files to be loadable via
// require('../assets/model/foo.tflite'). Metro must therefore treat
// `.tflite` as a binary asset, not as JS source.
config.resolver.assetExts.push('tflite');

module.exports = config;
