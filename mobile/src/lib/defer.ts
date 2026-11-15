/**
 * "Run this once the app is idle" — the replacement for React Native's
 * `InteractionManager.runAfterInteractions`, which RN 0.88 removed.
 *
 * Same contract the call sites were written against: the task runs later, off
 * the frame that asked for it, and the returned handle cancels it. Backed by
 * `requestIdleCallback` (the scheduler's own idle priority, so a tab
 * transition or a sheet spring finishes first) with a timeout so a busy screen
 * cannot starve a task for ever, and by a plain timer where the global is
 * missing (jest, web).
 *
 * One behaviour is deliberately DIFFERENT from the queue it replaces: every
 * task is independent. InteractionManager ran its tasks off one shared queue,
 * and a task that threw stopped the queue for every screen that deferred after
 * it. Here a throw is confined to its own task — and still must not escape as
 * an uncaught fatal, so callers keep their own try/catch + `logError`.
 */
export interface DeferredTask { cancel(): void }

/** Long enough for a transition to finish, short enough that a skeleton does not linger. */
const IDLE_TIMEOUT_MS = 600;

type IdleApi = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function runAfterInteractions(task: () => void): DeferredTask {
  let cancelled = false;
  const run = () => { if (!cancelled) task(); };
  const g = globalThis as unknown as IdleApi;
  if (typeof g.requestIdleCallback === 'function') {
    const id = g.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return { cancel: () => { cancelled = true; g.cancelIdleCallback?.(id); } };
  }
  const timer = setTimeout(run, 0);
  return { cancel: () => { cancelled = true; clearTimeout(timer); } };
}
