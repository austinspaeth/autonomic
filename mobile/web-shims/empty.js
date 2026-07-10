/**
 * Empty web shim for native-only packages (react-native-ble-plx,
 * @kingstinct/react-native-healthkit). These have no web build, so on web we
 * resolve them to this module purely so the bundle can be produced. The app's
 * ble/health wrappers already fall back to no-op stubs at runtime — BLE
 * heart-rate straps and Apple Health are unavailable in a browser by nature.
 */
module.exports = {};
