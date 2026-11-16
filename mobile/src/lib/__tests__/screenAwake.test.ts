import { createScreenAwake, KeepAwakeNative } from '../screenAwake';

/** A native side that records calls and resolves them in a controllable order. */
function fakeNative() {
  const calls: string[] = [];
  const native: KeepAwakeNative = {
    activate: async (t) => { calls.push(`on:${t}`); },
    deactivate: async (t) => { calls.push(`off:${t}`); },
  };
  return { native, calls };
}

describe('createScreenAwake', () => {
  it('turns on once for several holders and off only when the last lets go', async () => {
    const { native, calls } = fakeNative();
    const s = createScreenAwake(native, 'T');
    s.hold('setup');
    s.hold('session');
    await s.settled();
    s.release('session');
    await s.settled();
    expect(calls).toEqual(['on:T']);
    s.release('setup');
    await s.settled();
    expect(calls).toEqual(['on:T', 'off:T']);
  });

  it('a release and a hold that overlap (Try again) leave the screen held', async () => {
    const { native, calls } = fakeNative();
    const s = createScreenAwake(native, 'T');
    s.hold('card-1');
    await s.settled();
    // The old card unmounts and the new one mounts in the same commit.
    s.release('card-1');
    s.hold('card-2');
    await s.settled();
    expect(calls).toEqual(['on:T']);
    expect(s.holders()).toEqual(['card-2']);
  });

  it('never runs two native calls at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    };
    const s = createScreenAwake({ activate: slow, deactivate: slow }, 'T');
    s.hold('a'); s.release('a'); s.hold('b'); s.release('b'); s.hold('c');
    await s.settled();
    expect(maxInFlight).toBe(1);
  });

  it('only ever uses its one tag', async () => {
    const { native, calls } = fakeNative();
    const s = createScreenAwake(native, 'T');
    s.hold('x'); s.hold('y');
    await s.settled();
    s.release('x'); s.release('y');
    await s.settled();
    expect(new Set(calls.map((c) => c.split(':')[1]))).toEqual(new Set(['T']));
  });

  it('retries after a failed call instead of believing it worked', async () => {
    let fail = true;
    const calls: string[] = [];
    const s = createScreenAwake({
      activate: async () => { calls.push('on'); if (fail) throw new Error('no activity'); },
      deactivate: async () => { calls.push('off'); },
    }, 'T');
    s.hold('a');
    await s.settled();
    fail = false;
    s.hold('b');
    await s.settled();
    expect(calls).toEqual(['on', 'on']);
  });

  it('ignores a release for a holder it never had', async () => {
    const { native, calls } = fakeNative();
    const s = createScreenAwake(native, 'T');
    s.release('ghost');
    await s.settled();
    expect(calls).toEqual([]);
  });
});
