/**
 * Camera-permission gate: ask the OS at most once, and only when there is
 * something to ask for.
 *
 * VisionCamera's Android `requestPermission` calls `activity.requestPermissions`
 * unconditionally — even when the permission is already granted — and registers
 * a PermissionListener keyed to an incrementing request code. React Native's
 * activity delegate keeps exactly ONE listener slot, and Android silently drops
 * a permission request issued while another is still in flight. So two
 * overlapping calls leave BOTH promises unsettled, forever.
 *
 * That is not hypothetical: the camera setup card asks on mount, and its
 * wait-step effect asks again before starting the stream. For a returning user
 * with a saved layout the card opens directly on the wait step, so both fired in
 * the same effect flush, the await never returned, the stream never started, and
 * the flash never came on — while the permission had been granted all along.
 *
 * Two rules fix it, and they are the same two the Health wrapper already applies
 * to `requestAuth` (`src/lib/health/askedAuth.ts`): don't ask for what you
 * already hold, and coalesce concurrent callers onto one request.
 *
 * Pure and injectable so it can be tested without a camera.
 */

export interface PermissionGateDeps {
  /** Current status, read synchronously. Must not prompt. */
  status: () => string;
  /** Prompts the user. Called at most once at a time. */
  request: () => Promise<string>;
  /** Optional trace hook: (result, viaPrompt). */
  onResult?: (status: string, prompted: boolean) => void;
}

export interface PermissionGate {
  (): Promise<boolean>;
  /** Test seam: forget any in-flight request. */
  reset(): void;
}

export function createPermissionGate(deps: PermissionGateDeps): PermissionGate {
  let inFlight: Promise<boolean> | null = null;

  const gate = (async () => {
    // Already granted: never prompt. This is the whole fix for a returning
    // user, and it also means the common path costs one synchronous read.
    let current: string;
    try {
      current = String(deps.status());
    } catch {
      current = 'unknown';
    }
    if (current === 'granted') {
      deps.onResult?.(current, false);
      return true;
    }

    // A second caller joins the first request rather than issuing its own —
    // the concurrent one would be dropped by the OS and hang.
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const status = String(await deps.request());
        deps.onResult?.(status, true);
        return status === 'granted';
      } catch (e) {
        deps.onResult?.(`threw: ${String(e)}`, true);
        return false;
      }
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }) as PermissionGate;

  gate.reset = () => { inFlight = null; };
  return gate;
}
