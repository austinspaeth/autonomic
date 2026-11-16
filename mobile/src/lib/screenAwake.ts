/**
 * Keeping the screen on during a measurement, with ONE native holder.
 *
 * expo-keep-awake keeps its own set of tags on Android and only touches
 * FLAG_KEEP_SCREEN_ON when that set goes empty <-> non-empty. Its
 * activate/deactivate are async functions that can run concurrently, so an
 * activate and a deactivate for two DIFFERENT tags that overlap (the camera
 * setup card and the reading session do exactly that around "Try again") can
 * clear the flag while a tag is still recorded. From then on every activate
 * believes the screen is already held and adds nothing, until the process
 * dies. Measured on a Galaxy S25 Edge on 2.0.0: held at 19:55, 19:56 and
 * 19:57, then never again in the same process, so every reading after that
 * slept at the 30-second screen timeout and lost its pulse.
 *
 * So the app counts its own holders here, and the native module only ever
 * sees ONE tag, toggled one call at a time. With a single tag and no overlap,
 * the native set and the window flag cannot disagree.
 *
 * Pure apart from the injected native calls (see `createScreenAwake`), so the
 * ordering rules are tested without a device.
 */
import { useEffect, useId } from 'react';

export interface KeepAwakeNative {
  activate(tag: string): Promise<void>;
  deactivate(tag: string): Promise<void>;
}

export const SCREEN_AWAKE_TAG = 'autonomic-screen-awake';

export interface ScreenAwake {
  hold(key: string): void;
  release(key: string): void;
  /** Resolves once every queued native call has run. For tests. */
  settled(): Promise<void>;
  holders(): string[];
}

export function createScreenAwake(native: KeepAwakeNative, tag: string = SCREEN_AWAKE_TAG): ScreenAwake {
  const holders = new Set<string>();
  // What the native side was last successfully told. Starts off.
  let applied = false;
  let chain: Promise<void> = Promise.resolve();

  // Every change is folded into the queue, and each queued step re-reads the
  // CURRENT wish rather than the one that queued it, so a hold and a release in
  // the same tick cost nothing and the last word always wins.
  const sync = () => {
    chain = chain.then(async () => {
      const want = holders.size > 0;
      if (want === applied) return;
      try {
        if (want) await native.activate(tag);
        else await native.deactivate(tag);
        applied = want;
      } catch {
        // Left as it was; the next hold or release tries again. A failure here
        // is a missing activity (app backgrounded), never worth an error row.
      }
    });
  };

  return {
    hold(key) {
      if (holders.has(key)) return;
      holders.add(key);
      sync();
    },
    release(key) {
      if (!holders.delete(key)) return;
      sync();
    },
    settled: () => chain,
    holders: () => [...holders],
  };
}

let shared: ScreenAwake | null = null;

function screenAwake(): ScreenAwake {
  if (shared) return shared;
  // Required lazily so this module stays importable from tests and headless
  // wake-ups that never show a screen.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ka = require('expo-keep-awake') as typeof import('expo-keep-awake');
  shared = createScreenAwake({
    activate: (t) => ka.activateKeepAwakeAsync(t),
    deactivate: (t) => ka.deactivateKeepAwake(t),
  });
  return shared;
}

export function holdScreenAwake(key: string): void {
  try { screenAwake().hold(key); } catch { /* no native module: nothing to hold */ }
}

export function releaseScreenAwake(key: string): void {
  try { screenAwake().release(key); } catch { /* as above */ }
}

/** Keeps the screen on for as long as the calling component is mounted. */
export function useScreenAwake(): void {
  const key = useId();
  useEffect(() => {
    holdScreenAwake(key);
    return () => releaseScreenAwake(key);
  }, [key]);
}
