/**
 * Runtime-version fingerprint settings (`runtimeVersion.policy: "fingerprint"`).
 *
 * The fingerprint decides which installed binaries an OTA update may reach, so
 * the one mistake it must never make is calling two DIFFERENT native builds
 * the same: an update built against new native code, delivered to a binary
 * without it, crashes at launch on every phone that receives it.
 *
 * Expo SDK 58 changed the default preset to `balanced`, which hashes an
 * autolinked native module by its package NAME AND VERSION rather than by its
 * files. That is a fine trade for a module from npm, whose contents cannot
 * change without its version changing. It is wrong for this app: the six
 * modules under `modules/` are autolinked from the repo itself and carry no
 * version that moves, so an edit to their Swift or Kotlin would leave the
 * fingerprint untouched and the next OTA would go out to binaries that do not
 * contain it.
 *
 * `strict` hashes files — the behaviour every release up to 1.40 shipped
 * under. Its known cost is unchanged too: the `version` in app.json is part
 * of the fingerprint, so a JS-only fix cannot ride an OTA in the same commit
 * as a version bump.
 */
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  preset: 'strict',
};
