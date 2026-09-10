/**
 * Expo config plugin: stop a vanished Camera view from killing the process.
 *
 * VisionCamera sets a frame processor by VIEW TAG. `Camera.onViewReady` fires
 * from native, JS answers by calling `VisionCameraProxy.setFrameProcessor`,
 * and the proxy posts a runnable to the Android UI thread that resolves the
 * tag and throws `ViewNotFoundError` if the view has gone in the meantime.
 * Under Fabric that is a genuine race — view removal is dispatched by the
 * mount queue, the proxy's call is a plain handler post, and the two are not
 * ordered against each other — and the throw lands in a runnable with nobody
 * to catch it, so it is not an error, it is a crash:
 *
 *   RuntimeException: java.lang.reflect.InvocationTargetException
 *     cause: ViewNotFoundError: The given view (ID 149) was not found in the
 *            view manager.
 *
 * We hit it because `PpgCameraView` is mounted and unmounted by the camera
 * setup card's own wizard state: back out of, or close, the flash-placement
 * step in the frame or two between the native view going ready and JS
 * answering, and the reading takes the app down with it. `CameraView.tsx`
 * already removed the other half of this (the frame processor's identity is
 * fixed for the life of the `<Camera>`, so nothing calls the proxy on
 * teardown) — `onViewReady` is the one call left, and it cannot be avoided
 * from JS.
 *
 * So the fix is in the proxy: a frame processor set on a view that no longer
 * exists is a no-op, not a fault. Upstream still throws (mrousavy/
 * react-native-vision-camera#3458, #3696), so this rewrites the two proxy
 * methods in node_modules during prebuild — android/ is untracked here and
 * every build path regenerates it, so the patch is applied on the way to
 * every Gradle build. Idempotent, and it fails loudly if the upstream source
 * has moved rather than silently shipping an unpatched build.
 *
 * Drop it once VisionCamera catches this itself.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'autonomic-view-race';
const SRC = path.join(
  'node_modules', 'react-native-vision-camera', 'android', 'src', 'main',
  'java', 'com', 'mrousavy', 'camera', 'frameprocessors', 'VisionCameraProxy.kt',
);

/** [what upstream has, what we replace it with] for each of the two methods. */
const EDITS = [
  [
    `    UiThreadUtil.runOnUiThread {
      val view = findCameraViewById(viewId)
      view.frameProcessor = frameProcessor
    }`,
    `    UiThreadUtil.runOnUiThread {
      // ${MARKER}: the view may already be gone (see plugins/withVisionCameraViewRace.js).
      try {
        findCameraViewById(viewId).frameProcessor = frameProcessor
      } catch (e: ViewNotFoundError) {
        Log.w(TAG, "View $viewId went away before its frame processor could be set.", e)
      }
    }`,
  ],
  [
    `    UiThreadUtil.runOnUiThread {
      val view = findCameraViewById(viewId)
      view.frameProcessor = null
    }`,
    `    UiThreadUtil.runOnUiThread {
      // ${MARKER}: the view may already be gone (see plugins/withVisionCameraViewRace.js).
      try {
        findCameraViewById(viewId).frameProcessor = null
      } catch (e: ViewNotFoundError) {
        Log.w(TAG, "View $viewId went away before its frame processor could be removed.", e)
      }
    }`,
  ],
];

module.exports = function withVisionCameraViewRace(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.projectRoot, SRC);
      let src = fs.readFileSync(file, 'utf8');
      if (src.includes(MARKER)) return cfg;
      EDITS.forEach(([from, to], i) => {
        if (!src.includes(from)) {
          throw new Error(
            `withVisionCameraViewRace: VisionCameraProxy.kt no longer contains edit ${i + 1}. `
            + 'Check whether upstream now guards this itself and drop the plugin, or re-anchor it.',
          );
        }
        src = src.replace(from, to);
      });
      fs.writeFileSync(file, src);
      return cfg;
    },
  ]);
};
