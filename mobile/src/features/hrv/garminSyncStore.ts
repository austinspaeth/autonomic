/**
 * "Waiting for the Garmin reading" — the small amount of state that has to
 * outlive the sync card, so "Continue using app" can put it away without
 * abandoning the wait.
 *
 * Deliberately thinner than watchSyncStore: that one owns a poller, because an
 * Apple Watch reading has to be fetched out of the health store. Garmin pushes
 * its reading to us over the Connect IQ link, so there is nothing to poll —
 * this is just a flag saying a reading is expected, and the receiver's arrival
 * event ends it.
 */
export interface GarminSyncState {
  /** A reading is expected from the watch. */
  waiting: boolean;
  /** The card has been put away; the pill stands in for it. */
  minimized: boolean;
  /** Device name, for the pill's label. */
  deviceName: string | null;
  /** The watch gave up on the reading and said why (a `diag` message:
   *  `nopulse` / `nobeats` / `thin`). Nothing is coming, so the wait is over
   *  and the card says what the watch saw instead of spinning for ever. */
  failed: string | null;
}

let state: GarminSyncState = { waiting: false, minimized: false, deviceName: null, failed: null };
const listeners = new Set<() => void>();

export const getGarminSyncState = () => state;

export function subscribeGarminSync(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function set(patch: Partial<GarminSyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function startGarminSync(deviceName: string | null) {
  set({ waiting: true, minimized: false, deviceName, failed: null });
}

/** The watch reported a reading it could not take. Ends the wait. */
export function failGarminSync(signal: string, deviceName: string | null) {
  set({ waiting: false, minimized: false, failed: signal, deviceName: deviceName ?? state.deviceName });
}

/** The reading landed, or the user gave up on it. */
export function stopGarminSync() {
  set({ waiting: false, minimized: false, failed: null });
}

export const minimizeGarminSync = () => set({ minimized: true });
export const restoreGarminSync = () => set({ minimized: false });
