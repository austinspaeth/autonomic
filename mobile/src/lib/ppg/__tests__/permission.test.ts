import { createPermissionGate } from '../permission';

/** A request that resolves only when the test says so — the OS prompt is
 *  asynchronous and slow, which is exactly when a second caller shows up. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createPermissionGate', () => {
  it('never prompts for a permission already held', async () => {
    const request = jest.fn();
    const gate = createPermissionGate({ status: () => 'granted', request });
    expect(await gate()).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  // The reported bug: the setup card asks on mount AND on the wait step, which
  // for a saved layout land in the same effect flush. VisionCamera issues a
  // real OS request for each, Android drops the second, and React Native's
  // single listener slot means neither promise ever settles.
  it('coalesces concurrent callers onto one request', async () => {
    const d = deferred<string>();
    const request = jest.fn(() => d.promise);
    const gate = createPermissionGate({ status: () => 'not-determined', request });

    const a = gate();
    const b = gate();
    d.resolve('granted');

    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('lets a later caller ask again once the first request has settled', async () => {
    const request = jest.fn().mockResolvedValueOnce('denied').mockResolvedValueOnce('granted');
    const gate = createPermissionGate({ status: () => 'not-determined', request });
    expect(await gate()).toBe(false);
    expect(await gate()).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('reports denial rather than hanging', async () => {
    const gate = createPermissionGate({ status: () => 'denied', request: async () => 'denied' });
    expect(await gate()).toBe(false);
  });

  it('treats a throwing request as denied, not as a rejection', async () => {
    const gate = createPermissionGate({
      status: () => 'not-determined',
      request: async () => { throw new Error('NO_ACTIVITY'); },
    });
    await expect(gate()).resolves.toBe(false);
  });

  it('survives a status read that throws', async () => {
    const gate = createPermissionGate({
      status: () => { throw new Error('module missing'); },
      request: async () => 'granted',
    });
    expect(await gate()).toBe(true);
  });

  it('tells the trace whether it prompted, so a dump can say which', async () => {
    const seen: [string, boolean][] = [];
    const held = createPermissionGate({ status: () => 'granted', request: async () => 'granted', onResult: (s, p) => seen.push([s, p]) });
    await held();
    const asked = createPermissionGate({ status: () => 'not-determined', request: async () => 'granted', onResult: (s, p) => seen.push([s, p]) });
    await asked();
    expect(seen).toEqual([['granted', false], ['granted', true]]);
  });

  it('does not strand a caller when a failed request is followed by a grant elsewhere', async () => {
    let status = 'not-determined';
    const gate = createPermissionGate({
      status: () => status,
      request: async () => { throw new Error('dropped by the OS'); },
    });
    expect(await gate()).toBe(false);
    // Granted from system Settings while the app was backgrounded.
    status = 'granted';
    expect(await gate()).toBe(true);
  });
});
