// Metro config for the universal Expo app.
// Blocks the sibling `docs/` (legacy static PWA) and `landing/` (Svelte marketing
// site, has its own node_modules) folders so Metro doesn't watch/resolve them.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [/\/docs\/.*/, /\/landing\/.*/];

module.exports = config;
