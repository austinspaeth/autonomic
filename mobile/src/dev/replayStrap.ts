/**
 * A heart-rate strap that is not there — DEV ONLY, for the marketing
 * screenshot harness. Never reachable from a release build.
 *
 * WHY IT SITS HERE AND NOT IN THE FEATURES. The HRV session and the POTS stand
 * test both reach their sensor through exactly one call, `ble().connect(id,
 * onSample, onDisconnect)`, and both do everything else themselves. Standing a
 * replacement behind that ONE seam therefore drives both screens down their own
 * real code paths — `collect`, the rolling SDNN, the live artifact hint, the
 * rrSupport verdict, the stand test's own baseline and delta maths, the results
 * card, the entry it writes. The alternative (a hook per feature that pokes
 * values into each view) would photograph a mock-up of the app rather than the
 * app, which is the one thing this library may not do.
 *
 * It emits on the same contract a real strap does: an `HrSample` about once a
 * second carrying the whole pulse plus the beat intervals that landed inside
 * that second (so the per-notification beat count rises and falls with the
 * rate, as it does on the wire), and nothing at all before `connect` resolves.
 *
 * The intervals themselves come from `./beats`, which models the physiology and
 * is pinned by `__tests__/beatcheck.test.ts`. Nothing is faked downstream of
 * this file.
 */
import type { BleManagerApi, HrSample } from '../lib/ble/manager';
import { beatsFrom, type Beat, type RateFn } from './beats';

/** Matches a real strap's ~1 Hz Heart Rate Measurement notification. */
const TICK_MS = 1000;
/** Long enough to read as a connection, short enough not to stall a shot. */
const CONNECT_MS = 450;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Build a manager that streams `rate` for `seconds`, starting the clock when
 * the caller connects. The series is generated up front so the shape of the
 * reading is fixed before a single sample goes out.
 */
export function replayStrap(rate: RateFn, seconds: number, seed?: number): BleManagerApi {
  const beats = beatsFrom(rate, seconds, { seed });
  return {
    available: true,
    async ready() { return { ok: true, state: 'PoweredOn', message: '' }; },
    async requestPermissions() { return true; },
    async scan() { /* the shots never open the strap picker */ },
    stopScan() { /* no-op */ },
    async connect(_id: string, onSample: (s: HrSample) => void, _onDisconnect: () => void) {
      stopReplay();
      await new Promise<void>((r) => setTimeout(r, CONNECT_MS));
      const t0 = Date.now();
      let next = 0;
      timer = setInterval(() => {
        const ms = Date.now() - t0;
        // Every beat whose moment has now passed, exactly as they would have
        // arrived: a fast stretch delivers three in a notification, a slow one
        // delivers none.
        const due: Beat[] = [];
        while (next < beats.length && beats[next].at <= ms) due.push(beats[next++]);
        if (next >= beats.length) stopReplay();
        // A strap reports its pulse every second whether or not an interval
        // landed in that second, and the session uses that as the connection
        // cue — so a tick with no beats still carries a heart rate.
        const last = beats[Math.max(0, next - 1)];
        const hr = last ? Math.round(60000 / last.rr) : 0;
        onSample({ hr, rr: due.map((b) => b.rr) });
      }, TICK_MS);
    },
    async readBattery() { return 84; },
    async disconnect() { stopReplay(); },
    destroy() { stopReplay(); },
    async diagnose() {
      return {
        at: new Date().toISOString(),
        app: { version: 'dev', build: 'shots', runtime: 'replay' },
        platform: { os: 'ios', version: 'sim' },
        adapter: { available: true, state: 'PoweredOn' },
        permissions: {},
        requires: [],
        scan: { ms: 0, error: null, started: false, devices: [] },
      } as unknown as Awaited<ReturnType<BleManagerApi['diagnose']>>;
    },
  };
}

export function stopReplay() {
  if (timer) { clearInterval(timer); timer = null; }
}
