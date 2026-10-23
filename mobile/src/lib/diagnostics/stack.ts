/**
 * The stack half of a crash's context — the pure part. WHICH CODE looped.
 *
 * `crash.where` says where the user was; it cannot say what in the app did
 * it. "Maximum update depth exceeded" with an HRV card open and the app just
 * foregrounded still leaves a dozen subscribers that could be the one. The
 * stack can say, now that the release bundle keeps function names
 * (`keep_fnames` in metro.config.js): a Hermes frame reads
 * `at armBreath (address at index.android.bundle:1:81234)`, and the first
 * frame above React's own scheduler is the code that asked for the update
 * that tipped it over.
 *
 * Only NAMES leave the phone. The offsets are digits (the fault redaction
 * eats them anyway) and the file is the bundle, which is the same on every
 * phone. A function name is a name this codebase chose, the same standard a
 * breadcrumb is held to.
 *
 * React's own frames are dropped, because they are the same on every crash of
 * a kind and are what pushes the useful names off the end of a capped row.
 * But which of them were present is kept as a single word (`via store`,
 * `via effect`), since "an external store emitted" and "an effect set state"
 * are the two halves of the search and they want different places to look.
 *
 * One honest limit: an effect is an anonymous arrow (`useEffect(() => …)`),
 * and Hermes names a function only from an assignment, so a loop driven by
 * an effect that calls a state setter directly reads `via effect @ unknown`.
 * That still halves the search, and `crash.where` says which screen to read.
 */

/** Names reported per row. The row is capped after redaction, and the names
 *  nearest the throw are the ones that matter, so they lead. */
export const STACK_NAMES = 6;

/** Frames read before giving up. React's commit can run deep, but a loop's
 *  instigator is never hundreds of frames down. */
export const STACK_SCAN = 60;

/**
 * React's own frames: the scheduler, the hooks dispatchers, the commit
 * phase, and the RN bridge that calls into them. Not exhaustive — anything
 * React-internal that is missing here simply appears in the row, which costs
 * a slot and never misleads, since the user-code frames still follow it.
 */
const REACT_FRAMES = new Set([
  // The production throw site and the hops into it (the dev build throws from
  // `throwIfInfiniteUpdateLoopDetected`, which the prod renderer inlines).
  'getRootForUpdatedFiber', 'enqueueConcurrentHookUpdate', 'enqueueConcurrentRenderForLane',
  'recursivelyTraverseReconnectPassiveEffects', 'recursivelyTraverseReappearLayoutEffects',
  'commitMutationEffectsOnFiber', 'performWorkOnRootViaSchedulerTask', 'nativeOnCaughtError',
  'updateContainer', 'applyDerivedStateFromProps', 'startTransition',
  'throwIfInfiniteUpdateLoopDetected', 'scheduleUpdateOnFiber', 'markUpdateLaneFromFiberToRoot',
  'dispatchSetState', 'dispatchSetStateInternal', 'dispatchReducerAction', 'dispatchOptimisticSetState',
  'dispatchAction', 'enqueueConcurrentHookUpdate', 'enqueueUpdate', 'classComponentUpdater',
  'forceStoreRerender', 'handleStoreChange', 'checkIfSnapshotChanged', 'subscribeToStore', 'updateStoreInstance',
  'commitHookEffectListMount', 'commitHookEffectListUnmount', 'commitHookLayoutEffects', 'commitHookPassiveMountEffects',
  'commitPassiveMountOnFiber', 'recursivelyTraversePassiveMountEffects', 'commitPassiveMountEffects',
  'commitPassiveMountEffects_begin', 'commitPassiveMountEffects_complete', 'commitPassiveMountEffectsOnFiber',
  'commitLayoutEffectOnFiber', 'recursivelyTraverseLayoutEffects', 'commitLayoutEffects', 'commitLayoutEffects_begin',
  'commitLayoutMountEffects_complete', 'commitClassLayoutLifecycles', 'safelyCallComponentDidMount', 'commitAttachRef',
  'safelyAttachRef', 'flushPassiveEffects', 'flushPassiveEffectsImpl', 'flushPendingEffects', 'flushLayoutEffects',
  'flushSpawnedWork', 'commitRoot', 'commitRootImpl', 'commitRootWhenReady', 'completeRoot',
  'performSyncWorkOnRoot', 'performWorkOnRoot', 'performWorkOnRootViaSchedulerTask', 'performConcurrentWorkOnRoot',
  'flushSyncWorkAcrossRoots_impl', 'flushSyncWorkOnAllRoots', 'flushSyncWorkOnLegacyRootsOnly', 'flushSyncCallbacks',
  'processRootScheduleInMicrotask', 'processRootScheduleInImmediateTask', 'scheduleImmediateRootScheduleTask',
  'renderRootSync', 'renderRootConcurrent', 'workLoopSync', 'workLoopConcurrent', 'performUnitOfWork', 'beginWork',
  'completeUnitOfWork', 'completeWork', 'finishConcurrentRender', 'runWithFiberInDEV', 'callCallback',
  'renderWithHooks', 'batchedUpdates', 'batchedUpdatesImpl', 'flushSync', 'flushSyncFromReconciler',
  'dispatchEvent', 'dispatchEventForPluginEventSystem', 'executeDispatch', 'processDispatchQueue',
  'runWithPriority', 'unstable_runWithPriority', 'flushWork', 'workLoop', 'performWorkUntilDeadline',
  'callFunctionReturnFlushedQueue', '__callFunction', '__guard', 'guard', 'flushedQueue', 'invokeCallbackAndReturnFlushedQueue',
  '__invokeCallback', 'callTimer', 'callTimers', 'callReactNativeMicrotasks', '_callReactNativeMicrotasksPass',
  'callImmediates', '_callImmediatesPass', 'anonymous', 'global', 'eval',
  // Builtins a callback is invoked through. `emit` is deliberately NOT here:
  // the app's own stores are called that, and a store's emit is exactly the
  // frame this row exists to find.
  'forEach', 'map', 'filter', 'reduce', 'some', 'every', 'call', 'apply',
  'tryCallOne', 'tryCallTwo', 'doResolve', 'handle', 'handleResolved', 'finale', 'resolve',
]);

/** React frames that say HOW the update arrived. First match wins, nearest
 *  the throw first, so a store emit inside an effect reads as the store. */
const VIA: [RegExp, string][] = [
  [/^(forceStoreRerender|handleStoreChange|checkIfSnapshotChanged|subscribeToStore|updateStoreInstance)$/, 'store'],
  // Not `commitHookEffectListMount`: React 19 runs layout AND passive effects
  // through it, so it says nothing until the frame beneath it does.
  [/^commitHookLayoutEffects$|Layout(Effect|Mount)|commitClassLayoutLifecycles|componentDidUpdate|componentDidMount/, 'layout'],
  [/Passive|flushPassiveEffects/, 'effect'],
  [/^(dispatchEvent|executeDispatch|processDispatchQueue)$/, 'event'],
];

/** A name is kept to identifier characters. Anything else is dropped rather
 *  than escaped: a frame that needed escaping did not hold a function name. */
function cleanName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_$.]/g, '').slice(0, 48);
}

/**
 * The function names in a stack, nearest the throw first. Reads the two
 * shapes that reach this app: Hermes/V8 (`    at name (where)`) and
 * JSC (`name@where`). Frames with no name, and Hermes's generated
 * `?anon_0_` names, are skipped.
 */
export function stackFrames(stack: string | undefined | null): string[] {
  if (!stack) return [];
  const out: string[] = [];
  for (const raw of String(stack).split('\n').slice(0, STACK_SCAN + 1)) {
    const line = raw.trim();
    let name = '';
    const v8 = /^at\s+(?:new\s+)?([^\s(]+)(?:\s|$)/.exec(line);
    if (v8) name = v8[1];
    else {
      const jsc = /^([^@\s]+)@/.exec(line);
      if (jsc) name = jsc[1];
    }
    // `Object.foo` / `Foo.prototype.bar`: the last segment is the function.
    const parts = cleanName(name).split('.').filter((p) => p && p !== 'prototype');
    const fn = parts[parts.length - 1] ?? '';
    if (!fn || fn.startsWith('?anon') || fn.startsWith('anon_')) continue;
    out.push(fn);
  }
  return out;
}

/** How the update reached React: `store`, `layout`, `effect`, `event`, or
 *  null when no React frame says. */
export function stackVia(frames: string[]): string | null {
  for (const f of frames) {
    for (const [re, word] of VIA) if (re.test(f)) return word;
  }
  return null;
}

/**
 * The app's own frames, nearest the throw first, consecutive repeats
 * collapsed (a recursive loop is one name, not six of it).
 */
export function appFrames(frames: string[], max = STACK_NAMES): string[] {
  const out: string[] = [];
  for (const f of frames) {
    if (REACT_FRAMES.has(f)) continue;
    if (out[out.length - 1] === f) continue;
    out.push(f);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The text of a `crash.stack` row: the crash's tag, how the update arrived,
 * then the app's own frames nearest the throw first — read it as "thrown in
 * the first, called from the second". `unknown` when the stack carried no
 * name worth sending, so a crash whose stack was asked for still says so.
 */
export function formatStack(tag: string, stack: string | undefined | null): string {
  const frames = stackFrames(stack);
  const via = stackVia(frames);
  const names = appFrames(frames);
  const head = via ? `${tag} via ${via}` : tag;
  return `${head} @ ${names.length ? names.join(' < ') : 'unknown'}`;
}
