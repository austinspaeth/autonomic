/**
 * Which camera errors may move the ladder to its next rung (pure + tested).
 *
 * VisionCamera 5 reports every failure through one `onError`, including a
 * controller call (setTorchMode, zoom, exposure) that landed while the session
 * was not running. That is a timing fact about the call, not evidence that the
 * configuration cannot bind, and counting it as a failed rung walked a Galaxy
 * S25 Edge (Android 16) down the whole ladder in 120 ms onto the library
 * default at 15 fps, where no pulse would lock. The class name is obfuscated
 * in a release build (`k90: Camera is not active.`), so the MESSAGE is matched.
 */
export function isNotActiveError(why: string): boolean {
  return /camera is not active/i.test(why);
}
