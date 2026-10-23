import { appFrames, formatStack, STACK_NAMES, stackFrames, stackVia } from '../stack';
import { readFileSync } from 'fs';
import { join } from 'path';
import { redactMessage } from '../../errorReport';

// The shape a Hermes release bundle throws "Maximum update depth exceeded"
// with, function names kept by keep_fnames: a store emit, delivered to React
// through useSyncExternalStore, called from a timer.
const HERMES = [
  'Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate.',
  '    at throwIfInfiniteUpdateLoopDetected (address at index.android.bundle:1:812345)',
  '    at scheduleUpdateOnFiber (address at index.android.bundle:1:798765)',
  '    at forceStoreRerender (address at index.android.bundle:1:776655)',
  '    at handleStoreChange (address at index.android.bundle:1:776601)',
  '    at anonymous (address at index.android.bundle:1:2211009)',
  '    at forEach (native)',
  '    at emit (address at index.android.bundle:1:2211000)',
  '    at bump (address at index.android.bundle:1:2211100)',
  '    at armBreath (address at index.android.bundle:1:2212345)',
  '    at callTimer (address at InternalBytecode.js:1:1234)',
].join('\n');

describe('stackFrames', () => {
  it('reads Hermes frames nearest the throw first', () => {
    expect(stackFrames(HERMES).slice(0, 3)).toEqual(['throwIfInfiniteUpdateLoopDetected', 'scheduleUpdateOnFiber', 'forceStoreRerender']);
  });

  it('reads JSC frames and keeps the last segment of a dotted name', () => {
    const jsc = 'dispatchSetState@file:///app/main.jsbundle:1:2345\nObject.fitCheck@file:///app/main.jsbundle:1:9999\n@file:///x:1:2';
    expect(stackFrames(jsc)).toEqual(['dispatchSetState', 'fitCheck']);
  });

  it('skips generated anonymous names and lines that are not frames', () => {
    expect(stackFrames('Error: x\n    at ?anon_0_ (address at b:1:2)\n    at realName (address at b:1:3)')).toEqual(['realName']);
  });

  it('is total', () => {
    expect(stackFrames(undefined)).toEqual([]);
    expect(stackFrames('')).toEqual([]);
  });
});

describe('appFrames', () => {
  it("drops React's frames and builtins but keeps the app's own emit", () => {
    expect(appFrames(stackFrames(HERMES))).toEqual(['emit', 'bump', 'armBreath']);
  });

  it('collapses a recursive loop into one name', () => {
    expect(appFrames(['setLoop', 'setLoop', 'setLoop', 'caller'])).toEqual(['setLoop', 'caller']);
  });

  it(`caps at ${STACK_NAMES}`, () => {
    expect(appFrames(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).toHaveLength(STACK_NAMES);
  });
});

describe('stackVia', () => {
  it('names a store-driven update', () => {
    expect(stackVia(stackFrames(HERMES))).toBe('store');
  });

  it('names an effect-driven one', () => {
    expect(stackVia(['dispatchSetState', 'commitHookEffectListMount', 'commitHookLayoutEffects'])).toBe('layout');
    // The shared mount frame is read through to the one beneath it.
    expect(stackVia(['dispatchSetState', 'commitHookEffectListMount', 'commitHookPassiveMountEffects'])).toBe('effect');
  });

  it('says nothing when no React frame does', () => {
    expect(stackVia(['myFn'])).toBeNull();
  });
});

describe('formatStack', () => {
  it('leads with the tag and the mechanism', () => {
    expect(formatStack('uncaught.fatal', HERMES)).toBe('uncaught.fatal via store @ emit < bump < armBreath');
  });

  it('says unknown rather than sending nothing', () => {
    expect(formatStack('uncaught.fatal', '')).toBe('uncaught.fatal @ unknown');
  });

  it('survives fault redaction intact', () => {
    const line = formatStack('uncaught.fatal', HERMES);
    expect(redactMessage(line)).toBe(line);
  });

  it('carries no offsets or file names', () => {
    expect(formatStack('uncaught.fatal', HERMES)).not.toMatch(/bundle|\d{3,}/);
  });
});

// The release bundle runs React's PROD renderer, whose throw site and hops
// differ from the dev build's. If a React upgrade renames them, the row fills
// up with React's own frames and pushes the app's off the end — so pin that
// the names this module drops still exist where they are expected.
describe('the production renderer', () => {
  const src = readFileSync(join(__dirname, '../../../../node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-prod.js'), 'utf8');
  it.each(['getRootForUpdatedFiber', 'enqueueConcurrentHookUpdate', 'enqueueConcurrentRenderForLane', 'dispatchSetStateInternal', 'dispatchSetState', 'forceStoreRerender', 'commitHookEffectListMount', 'commitPassiveMountOnFiber', 'commitLayoutEffectOnFiber'])('still defines %s', (name) => {
    expect(src).toMatch(new RegExp(`function ${name}\\(`));
  });

  it('throws the update-depth error from getRootForUpdatedFiber', () => {
    const at = src.indexOf('Maximum update depth exceeded');
    // The nearest function definition above the message is the throw site.
    expect(src.lastIndexOf('\nfunction ', at)).toBe(src.lastIndexOf('\nfunction getRootForUpdatedFiber(', at));
  });

  it('reduces a prod store-driven loop to the app frames', () => {
    const prod = [
      'Error: Maximum update depth exceeded.',
      '    at getRootForUpdatedFiber (address at index.android.bundle:1:100001)',
      '    at enqueueConcurrentRenderForLane (address at index.android.bundle:1:100002)',
      '    at forceStoreRerender (address at index.android.bundle:1:100003)',
      '    at anonymous (address at index.android.bundle:1:100004)',
      '    at anonymous (address at index.android.bundle:1:200001)',
      '    at forEach (native)',
      '    at setPillSlotClaim (address at index.android.bundle:1:200002)',
      '    at hide (address at index.android.bundle:1:200003)',
    ].join('\n');
    expect(formatStack('uncaught.fatal', prod)).toBe('uncaught.fatal via store @ setPillSlotClaim < hide');
  });
});
