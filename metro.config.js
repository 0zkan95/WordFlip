const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

const nodeModules = path.resolve(__dirname, 'node_modules')

// Add wasm support for expo-sqlite on web
config.resolver.assetExts.push('wasm')

config.resolver.extraNodeModules = {
  'expo-linking':   path.resolve(nodeModules, 'expo-linking'),
  'expo-constants': path.resolve(nodeModules, 'expo-constants'),
}

config.resolver.nodeModulesPaths = [nodeModules]
config.resolver.sourceExts.push('css')

module.exports = config