import { requireOptionalNativeModule } from 'expo-modules-core';

/** Name the Android module registers its frame processor plugin under. */
export const PPG_FRAME_PLUGIN = 'ppgMeanRgb';

/**
 * Make sure the native `ppgMeanRgb` frame processor plugin is registered, and
 * say whether it is. False on iOS (the module is Android-only — iOS reads the
 * frame through `toArrayBuffer`, which works there) and on any build that
 * predates the module, in which case the caller keeps the JS read.
 */
export function installPpgFrameReader(): boolean {
  try {
    const mod = requireOptionalNativeModule<{ install: () => boolean }>('PpgFrame');
    return !!mod?.install();
  } catch {
    return false;
  }
}
