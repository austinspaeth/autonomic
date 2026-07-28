/**
 * Platform health wrapper — Apple HealthKit on iOS, Health Connect on Android
 * (see ./healthConnect.ts). Both implement the same HealthApi so consumers
 * never branch on platform; anything else gets a stub with `available: false`.
 *
 * Read: resting/walking HR, HRV (SDNN on iOS, RMSSD on Android), respiratory
 * rate, blood pressure, body mass (profile weight only), sleep (with overnight
 * HR range), and workouts (mapped to app activity types, with per-workout HR
 * stats). Write: HRV, resting/avg HR, a Mindfulness session (iOS), and blood
 * pressure. `publishReading` maps an app journal entry to the right writes.
 *
 * IMPORTANT — this targets @kingstinct/react-native-healthkit v8, whose API
 * differs from older majors: `requestAuthorization(read, write)` (read first),
 * and every query/save takes real `Date` objects, not ISO strings. Passing a
 * string makes the library throw internally (it calls `.toISOString()` on it),
 * which is why the previous version silently synced nothing.
 *
 * Guarded so importing on Android or without the native module returns a stub
 * with `available: false`. The module is loaded lazily.
 */
import { Linking, Platform } from 'react-native';
import type { Entry, SleepStages } from '../types';
import { computeHrv } from '../hrv';
import { keyOf } from '../dates';
import { hasAskedAuth, markAskedAuth } from './askedAuth';
import { groupNights, summarizeSleep } from './sleepSummary';
import { activityTypeFromHk, workoutHrSeries } from './workoutMap';

/** This app's bundle id — used to skip re-importing our own write-backs. */
const OWN_BUNDLE = 'com.autonomic.journal';

/** Which slice of the read set a permission question is about. */
export type HealthScope = 'all' | 'workouts';
/**
 * What we can honestly say about read access.
 *  - `shouldRequest` — the OS still has questions to ask; requesting shows UI.
 *  - `granted` / `denied` — provable (Health Connect reports grants).
 *  - `unknown` — we asked and the platform won't say. HealthKit *never* reveals
 *    read grants, so iOS lands here for every already-requested type.
 */
export type HealthAuthStatus = 'shouldRequest' | 'granted' | 'denied' | 'unknown';

export interface HealthApi {
  available: boolean;
  /**
   * Ask for the app's WHOLE health permission set — once. Self-gating: when the
   * platform reports nothing left to present (or this exact set was already
   * asked, see ./askedAuth), it resolves without any UI, so entry paths (the
   * add-activity import card, update checks, watch sync) can call it freely
   * without ever re-nagging. Only the explicit Connect buttons pass `force`,
   * which skips the asked-before latch (the OS still won't re-present types it
   * considers determined).
   */
  requestAuth(opts?: { force?: boolean }): Promise<boolean>;
  /**
   * Whether a read scope has been asked about yet, and (where the platform
   * says) whether it was granted. Lets callers tell "nothing recorded that day"
   * apart from "we may have been denied" instead of showing one empty state for
   * both — see `HEALTH_PERMISSION_HINT`.
   */
  readAuthStatus(scope: HealthScope): Promise<HealthAuthStatus>;
  /** Pull the day's relevant samples for a YYYY-MM-DD key. */
  readDay(dk: string): Promise<HealthDaySamples>;
  /**
   * Per-sample, timestamped readings for a day (resting HR, BP, HRV) —
   * each keeps its real clock time and a flag for whether this app authored it.
   */
  readImports(dk: string): Promise<ImportedReading[]>;
  /**
   * The day's workouts (Apple Workout app / Health Connect exercise sessions),
   * already mapped to app activity types, each with HR stats aggregated from
   * the heart-rate samples recorded during it.
   */
  readWorkouts(dk: string): Promise<ImportedWorkout[]>;
  /** Read the night that *ends* on `dk` (spans the prior evening → this morning). */
  readSleep(dk: string): Promise<SleepImport | null>;
  /**
   * One-shot historical import across a date range (used once, from onboarding):
   * readings (RR-based HRV, blood pressure, resting heart rate), nights of
   * sleep with their overnight HR, workouts with their HR traces, and
   * medication doses — each tagged with the local day it belongs to. HRV comes
   * only from heartbeat series covering at least {@link HISTORY_HRV_MIN_MS}
   * (real beat-to-beat RR); plain SDNN-only samples are excluded. A year of
   * data takes a while to walk, so `onProgress` reports each phase.
   */
  readHistory(opts: {
    fromISO: string; toISO: string; onProgress?: (p: HistoryProgress) => void;
  }): Promise<HistoryBundle>;
  /**
   * Heartbeat-series readings (real beat-to-beat RR) overlapping a time window,
   * newest first — what an Apple Watch Mindfulness/Breathe session produces.
   * Excludes samples this app authored and series with too few beats.
   */
  readHrvSessions(opts: { fromMs: number; toMs: number }): Promise<WatchHrvSample[]>;
  /**
   * The day's medication doses logged in the platform health app. Neither
   * bridge library exposes medication reads yet (HealthKit gained a meds API
   * in iOS 26 but @kingstinct/react-native-healthkit doesn't surface it, and
   * Health Connect's medication record is still experimental), so both
   * implementations currently return [] — this seam exists so the periodic
   * import check grows a Medications group the moment a library ships it.
   */
  readMedications(dk: string): Promise<ImportedMed[]>;
  /** iOS writes SDNN (HealthKit's HRV type); Android writes RMSSD (Health
   *  Connect's). Callers pass both when they have them. */
  writeHrvSession(opts: { sdnnMs?: number; rmssdMs?: number; avgHr?: number; startISO: string; durationSec: number }): Promise<void>;
  writeQuantity(kind: 'systolic' | 'diastolic' | 'restingHr', value: number, when: Date): Promise<void>;
  /** Publish an app journal reading to Health. Returns how many samples were written. */
  publishReading(entry: Entry, dk: string): Promise<number>;
}

export interface HealthDaySamples {
  restingHr: number | null;
  hrvSdnn: number | null;
  systolic: number | null;
  diastolic: number | null;
  respiratoryRate: number | null;
  weightLb: number | null;
  sleep: { bed?: string; wake?: string; interrupted?: boolean } | null;
}

export interface ImportedReading {
  type: 'restingHr' | 'bp' | 'hrv';
  time: string;   // HH:MM local, from the sample's real timestamp
  startMs: number; // epoch ms of the sample start, for dedup windows
  fields: Record<string, string>;
  rr?: number[];        // beat-to-beat RR (ms), when derived from a heartbeat series
  rrClean?: number[];
  ownApp: boolean;      // true when this app authored the sample (skip on import)
}

/** An {@link ImportedReading} from the historical sweep, tagged with its day. */
export interface HistoryReading extends ImportedReading {
  dayKey: string;       // YYYY-MM-DD (local) the sample belongs to
}

/** An {@link ImportedWorkout} from the historical sweep, tagged with its day. */
export interface HistoryWorkout extends ImportedWorkout { dayKey: string }

/** An {@link ImportedMed} from the historical sweep, tagged with its day. */
export interface HistoryMed extends ImportedMed { dayKey: string }

/** A night from the historical sweep, tagged with the day it *ends* on —
 *  the day whose `sleep` record it belongs to. */
export interface HistorySleep extends SleepImport { dayKey: string }

/** Everything one historical sweep found, ready to be written into the journal. */
export interface HistoryBundle {
  readings: HistoryReading[];
  sleep: HistorySleep[];
  workouts: HistoryWorkout[];
  meds: HistoryMed[];
}

/** Progress from a historical sweep: a phase label plus its own item counts
 *  (0/0 while the phase is still fetching its index). */
export interface HistoryProgress { label: string; done: number; total: number }

/** Minimum RR coverage for an importable historical HRV reading — the same bar
 *  the periodic update check applies (see ./updateSet). */
export const HISTORY_HRV_MIN_MS = 4 * 60 * 1000;

/** A night this short in the historical sweep is a nap or a stray sample, not
 *  a night worth writing into the journal's sleep record. */
export const HISTORY_SLEEP_MIN_MIN = 120;

/** Empty bundle — the stub's answer, and a safe base for partial sweeps. */
export const emptyHistory = (): HistoryBundle => ({ readings: [], sleep: [], workouts: [], meds: [] });

/**
 * Run `work` over `items` a few at a time, reporting progress as each lands.
 * Historical sweeps need one extra query per night/workout; unbounded
 * Promise.all over a year of them would swamp the bridge.
 */
async function mapPooled<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<R | null>,
  onEach?: (done: number, total: number) => void,
): Promise<R[]> {
  const out: R[] = [];
  let done = 0;
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const res = await Promise.all(slice.map((it) => work(it).catch(() => null)));
    for (const r of res) if (r) out.push(r);
    done += slice.length;
    onEach?.(done, items.length);
  }
  return out;
}

/** A workout from the platform health store, mapped to an app activity type. */
export interface ImportedWorkout {
  type: string;              // ACTIVITY_TYPES key (via workoutMap)
  time: string;              // HH:MM local start
  startMs: number;           // epoch ms of the workout start, for dedup windows
  durationMin: number;
  distanceMi: number | null;
  avgHr: number | null;
  minHr: number | null;
  maxHr: number | null;
  /** Full HR trace over the workout ({ t: seconds from start, bpm }), for the
   *  post-import report; null when the source recorded no HR. */
  hrSeries: { t: number; bpm: number }[] | null;
  sourceName: string;        // e.g. "Apple Watch"
  ownApp: boolean;           // authored by this app (watch sessions) — skip on import
}

/** A medication dose from the platform health store (see readMedications). */
export interface ImportedMed {
  name: string;              // as recorded by the health app, e.g. "Magnesium Glycinate"
  time: string;              // HH:MM local
  startMs: number;           // epoch ms of the dose, for dedup windows
  amount: string | null;     // display amount, e.g. "400 mg", when recorded
  ownApp: boolean;           // authored by this app — skip on import
}

/** A watch heartbeat-series reading pulled for the live-capture sync flow. */
export interface WatchHrvSample {
  startMs: number;
  endMs: number;
  rr: number[];         // beat-to-beat RR (ms)
  sourceName: string;   // e.g. "Apple Watch"
}

export interface SleepImport {
  bed: string;        // HH:MM local
  wake: string;       // HH:MM local
  bedISO: string;
  wakeISO: string;
  hrLow: number | null;
  hrHigh: number | null;
  interrupted: boolean;
  minutesAsleep: number;
  /** Per-stage minutes when the source recorded stages; null when every
   *  sample is plain asleepUnspecified (manual logs, older sources). */
  stages: SleepStages | null;
}

const emptyDay: HealthDaySamples = {
  restingHr: null, hrvSdnn: null, systolic: null, diastolic: null,
  respiratoryRate: null, weightLb: null, sleep: null,
};

const stub: HealthApi = {
  available: false,
  async requestAuth() { return false; },
  async readAuthStatus() { return 'unknown'; },
  async readDay() { return emptyDay; },
  async readImports() { return []; },
  async readHistory() { return emptyHistory(); },
  async readHrvSessions() { return []; },
  async readMedications() { return []; },
  async readWorkouts() { return []; },
  async readSleep() { return null; },
  async writeHrvSession() { /* no-op */ },
  async writeQuantity() { /* no-op */ },
  async publishReading() { return 0; },
};

let cached: HealthApi | null = null;

export function health(): HealthApi {
  if (cached) return cached;
  if (Platform.OS === 'android') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const hc = require('react-native-health-connect');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { makeHealthConnect } = require('./healthConnect');
      cached = makeHealthConnect(hc);
    } catch {
      cached = stub;
    }
    return cached!;
  }
  if (Platform.OS !== 'ios') { cached = stub; return cached; }
  let hk: typeof import('@kingstinct/react-native-healthkit');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hk = require('@kingstinct/react-native-healthkit');
  } catch {
    cached = stub;
    return cached;
  }
  const mod = (hk as { default?: unknown }).default ?? hk;
  cached = makeReal(mod as HkModule);
  return cached;
}

/** User-facing name of the platform health store, for UI copy. */
export function healthAppName(): string {
  return Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';
}

/**
 * Where a user fixes a read permission we can't fix from here. HealthKit has no
 * deep link into an app's Data Access page, so iOS opens the Health app itself
 * and the copy carries the rest of the path.
 */
export function healthPermissionPath(): string {
  return Platform.OS === 'android'
    ? 'Health Connect → App permissions → Autonomic'
    : 'Apple Health → your profile → Apps';
}

/** Open the platform health app so the user can review this app's access. */
export function openHealthApp(): void {
  if (Platform.OS === 'android') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native-health-connect').openHealthConnectSettings();
    } catch { /* Health Connect missing — nothing to open */ }
    return;
  }
  Linking.openURL('x-apple-health://').catch(() => { /* Health app unavailable */ });
}

/**
 * Hand the user the platform's own permission UI to cut access.
 * Health Connect can actually revoke from here (Android 14+ applies it on the
 * next app start); HealthKit has no revoke API at all, so iOS falls back to
 * opening the Health app where the user flips the toggles themselves.
 * Returns true when the platform revoked it for us.
 */
export async function revokeHealthAuth(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      await require('react-native-health-connect').revokeAllPermissions();
      return true;
    } catch { return false; }
  }
  openHealthApp();
  return false;
}

/**
 * Loosely-typed surface over the healthkit module (v8). Queries/saves take Date
 * objects; requestAuthorization is (read, write).
 */
type SourceRev = { source?: { bundleIdentifier?: string; name?: string } };
type QSample = { quantity: number; startDate: Date; endDate: Date; uuid?: string; sourceRevision?: SourceRev };
type CSample = { value: number; startDate: Date; endDate: Date };
type Heartbeat = { timeSinceSeriesStart: number; precededByGap?: boolean };
type HeartbeatSeries = { startDate: Date; endDate: Date; heartbeats: readonly Heartbeat[]; uuid?: string; sourceRevision?: SourceRev };
type SaveSample = { quantityType: string; unit: string; quantity: number; startDate: Date; endDate: Date };
type HkWorkout = {
  uuid?: string;
  workoutActivityType: number;
  duration: number;                                    // seconds
  totalDistance?: { unit: string; quantity: number };  // in the requested distanceUnit
  startDate: Date;
  endDate: Date;
  metadata?: { HKIndoorWorkout?: number | boolean } & Record<string, unknown>;
  sourceRevision?: SourceRev;
};
interface HkModule {
  isHealthDataAvailable?: () => Promise<boolean>;
  requestAuthorization?: (read: string[], write: string[]) => Promise<boolean>;
  /** HKAuthorizationRequestStatus: 0 unknown · 1 shouldRequest · 2 unnecessary. */
  getRequestStatusForAuthorization?: (read: string[], write?: string[]) => Promise<number>;
  queryQuantitySamples?: (id: string, opts: Record<string, unknown>) => Promise<readonly QSample[]>;
  queryCategorySamples?: (id: string, opts: Record<string, unknown>) => Promise<readonly CSample[]>;
  queryHeartbeatSeriesSamples?: (opts: Record<string, unknown>) => Promise<readonly HeartbeatSeries[]>;
  queryWorkoutSamples?: (opts: Record<string, unknown>) => Promise<readonly HkWorkout[]>;
  saveQuantitySample?: (id: string, unit: string, value: number, opts?: Record<string, unknown>) => Promise<boolean>;
  saveCategorySample?: (id: string, value: number, opts?: Record<string, unknown>) => Promise<boolean>;
  saveCorrelationSample?: (id: string, samples: SaveSample[], opts?: Record<string, unknown>) => Promise<boolean>;
}

/** True when a HealthKit sample was authored by this app (skip re-importing). */
const isOwnSample = (rev?: SourceRev): boolean => {
  const b = rev?.source?.bundleIdentifier;
  const nm = rev?.source?.name || '';
  return b === OWN_BUNDLE || /autonomic/i.test(nm);
};

/** RR intervals (ms) from a heartbeat series; drops beats flagged after a gap. */
const rrFromSeries = (hb: HeartbeatSeries): number[] => {
  const beats = hb.heartbeats || [];
  const rr: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    if (beats[i].precededByGap) continue;
    const dt = (beats[i].timeSinceSeriesStart - beats[i - 1].timeSinceSeriesStart) * 1000;
    if (dt > 250 && dt < 2500) rr.push(dt);
  }
  return rr;
};

const QID = {
  restingHr: 'HKQuantityTypeIdentifierRestingHeartRate',
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
  hrvSdnn: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  respiratoryRate: 'HKQuantityTypeIdentifierRespiratoryRate',
  systolic: 'HKQuantityTypeIdentifierBloodPressureSystolic',
  diastolic: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
  bodyMass: 'HKQuantityTypeIdentifierBodyMass',
} as const;
const CID = {
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
  mindful: 'HKCategoryTypeIdentifierMindfulSession',
} as const;
const CORR = { bloodPressure: 'HKCorrelationTypeIdentifierBloodPressure' } as const;
const HEARTBEAT_SERIES = 'HKDataTypeIdentifierHeartbeatSeries';
const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier';

const READ_IDS = [
  QID.restingHr, QID.heartRate, QID.hrvSdnn, QID.respiratoryRate,
  QID.systolic, QID.diastolic, QID.bodyMass, CID.sleep, HEARTBEAT_SERIES,
  WORKOUT_TYPE,
];
const WRITE_IDS = [
  QID.hrvSdnn, QID.restingHr, QID.heartRate,
  QID.systolic, QID.diastolic, CID.mindful,
  // Workout SHARE is what the watch app needs (its sessions are HKWorkouts).
  // HealthKit syncs authorization to the paired watch, so asking here — in the
  // one connect-time sheet — means the watch never has to present its own
  // sheet. Before this, phone (workout read) and watch (workout share) each
  // requested a different set and kept re-prompting in turn.
  WORKOUT_TYPE,
];

/** Identity of the current permission set, for the once-only ask latch. */
const HK_SET_KEY = `hk1:${READ_IDS.join(',')}|${WRITE_IDS.join(',')}`;

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const num = (v: unknown): number | null => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
};

/** Build a local Date from a YYYY-MM-DD key and an optional HH:MM time. */
function dateAt(dk: string, time?: string): Date {
  const [y, m, d] = dk.split('-').map(Number);
  const [hh, mm] = (time && /^\d{1,2}:\d{2}$/.test(time) ? time : '12:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0);
}

function makeReal(mod: HkModule): HealthApi {
  const dayBounds = (dk: string) => ({ from: dateAt(dk, '00:00'), to: dateAt(dk, '23:59') });

  const avgQ = async (id: string, from: Date, to: Date): Promise<number | null> => {
    try {
      const rows = (await mod.queryQuantitySamples?.(id, { from, to, limit: 500 })) || [];
      if (!rows.length) return null;
      return rows.reduce((s, r) => s + r.quantity, 0) / rows.length;
    } catch { return null; }
  };
  /** Raw per-sample rows (kept: timestamp + provenance), for timestamped imports. */
  const samplesQ = async (id: string, from: Date, to: Date): Promise<readonly QSample[]> => {
    try { return (await mod.queryQuantitySamples?.(id, { from, to, limit: 500 })) || []; }
    catch { return []; }
  };
  const rangeQ = async (id: string, from: Date, to: Date): Promise<{ min: number; max: number } | null> => {
    try {
      const rows = (await mod.queryQuantitySamples?.(id, { from, to, limit: 2000 })) || [];
      if (!rows.length) return null;
      let min = Infinity; let max = -Infinity;
      for (const r of rows) { if (r.quantity < min) min = r.quantity; if (r.quantity > max) max = r.quantity; }
      return { min, max };
    } catch { return null; }
  };
  const saveQ = async (id: string, unit: string, value: number, start: Date, end: Date) => {
    try { await mod.saveQuantitySample?.(id, unit, value, { start, end }); return true; } catch { return false; }
  };

  return {
    available: true,

    async requestAuth(opts) {
      try {
        if (mod.isHealthDataAvailable && !(await mod.isHealthDataAvailable())) return false;
        // Fully determined (status 2 = unnecessary): a request would present
        // nothing — skip the native round-trip entirely.
        let st = 0;
        try { st = (await mod.getRequestStatusForAuthorization?.(READ_IDS, WRITE_IDS)) ?? 0; } catch { st = 0; }
        if (st === 2) return true;
        // The OS wants to present, but we've already shown this exact set once.
        // Entry paths stop here; only an explicit Connect press re-presents.
        if (!opts?.force && st === 1 && hasAskedAuth(HK_SET_KEY)) return true;
        // v8 order: (read, write).
        const ok = (await mod.requestAuthorization?.(READ_IDS, WRITE_IDS)) ?? false;
        if (ok) markAskedAuth(HK_SET_KEY);
        return ok;
      } catch { return false; }
    },

    async readAuthStatus(scope) {
      // HealthKit answers only "would a request show UI?" — a determined type
      // reads back as `unnecessary` whether the user granted it or denied it,
      // so an already-asked scope can never resolve better than 'unknown'.
      try {
        const read = scope === 'workouts' ? [WORKOUT_TYPE, QID.heartRate] : READ_IDS;
        const write = scope === 'workouts' ? [] : WRITE_IDS;
        const st = await mod.getRequestStatusForAuthorization?.(read, write);
        return st === 1 ? 'shouldRequest' : 'unknown';
      } catch { return 'unknown'; }
    },

    async readDay(dk) {
      const { from, to } = dayBounds(dk);
      const [restingHr, hrvSdnn, respiratoryRate, systolic, diastolic, weightKg] = await Promise.all([
        avgQ(QID.restingHr, from, to),
        avgQ(QID.hrvSdnn, from, to),
        avgQ(QID.respiratoryRate, from, to),
        avgQ(QID.systolic, from, to),
        avgQ(QID.diastolic, from, to),
        avgQ(QID.bodyMass, from, to),
      ]);
      let sleep: HealthDaySamples['sleep'] = null;
      const s = await this.readSleep(dk);
      if (s) sleep = { bed: s.bed, wake: s.wake, interrupted: s.interrupted };
      return {
        restingHr: restingHr != null ? Math.round(restingHr) : null,
        hrvSdnn: hrvSdnn != null ? Math.round(hrvSdnn) : null,
        respiratoryRate,
        systolic: systolic != null ? Math.round(systolic) : null,
        diastolic: diastolic != null ? Math.round(diastolic) : null,
        weightLb: weightKg != null ? Math.round(weightKg * 2.20462) : null,
        sleep,
      };
    },

    async readImports(dk) {
      const { from, to } = dayBounds(dk);
      const out: ImportedReading[] = [];
      const ts = (s: QSample) => ({ time: hhmm(s.startDate), startMs: s.startDate.getTime(), ownApp: isOwnSample(s.sourceRevision) });

      const [rhr, sys, dia, sdnn] = await Promise.all([
        samplesQ(QID.restingHr, from, to),
        samplesQ(QID.systolic, from, to),
        samplesQ(QID.diastolic, from, to),
        samplesQ(QID.hrvSdnn, from, to),
      ]);

      rhr.forEach((s) => out.push({ type: 'restingHr', ...ts(s), fields: { hr: String(Math.round(s.quantity)), position: 'Laying' } }));
      // Pair systolic + diastolic by (near-)identical timestamps (saved together).
      sys.forEach((s) => {
        const m = dia.find((d) => Math.abs(d.startDate.getTime() - s.startDate.getTime()) < 2000);
        if (m) out.push({ type: 'bp', ...ts(s), fields: { sys: String(Math.round(s.quantity)), dia: String(Math.round(m.quantity)) } });
      });

      // Beat-to-beat HRV from heartbeat series → full metrics (RMSSD, power, …).
      const hrvSeriesTimes: number[] = [];
      try {
        const series = (await mod.queryHeartbeatSeriesSamples?.({ from, to, limit: 100 })) || [];
        for (const hb of series) {
          const rr = rrFromSeries(hb);
          if (rr.length < 20) continue;
          const res = computeHrv(rr);
          if (!res.time || !Object.keys(res.fields).length) continue;
          hrvSeriesTimes.push(hb.startDate.getTime());
          out.push({ type: 'hrv', time: hhmm(hb.startDate), startMs: hb.startDate.getTime(), ownApp: isOwnSample(hb.sourceRevision), fields: res.fields, rr, rrClean: res.rrClean });
        }
      } catch { /* series unavailable */ }

      // SDNN-only fallback where a beat series didn't already cover that moment.
      sdnn.forEach((s) => {
        if (hrvSeriesTimes.some((t) => Math.abs(t - s.startDate.getTime()) < 5 * 60000)) return;
        out.push({ type: 'hrv', ...ts(s), fields: { sdnn: String(Math.round(s.quantity)) } });
      });

      return out;
    },

    async readHistory({ fromISO, toISO, onProgress }) {
      const from = new Date(fromISO);
      const to = new Date(toISO);
      const out = emptyHistory();
      const step = (label: string, done = 0, total = 0) => {
        try { onProgress?.({ label, done, total }); } catch { /* progress is advisory */ }
      };
      // Generous cap: resting HR is ~1/day, so this comfortably spans years.
      const LIMIT = 50000;

      // Resting HR — one reading each, at its real timestamp.
      step('Resting heart rate');
      try {
        const rows = (await mod.queryQuantitySamples?.(QID.restingHr, { from, to, limit: LIMIT })) || [];
        for (const s of rows) {
          out.readings.push({
            type: 'restingHr', time: hhmm(s.startDate), startMs: s.startDate.getTime(),
            ownApp: isOwnSample(s.sourceRevision), dayKey: keyOf(s.startDate),
            fields: { hr: String(Math.round(s.quantity)), position: 'Laying' },
          });
        }
      } catch { /* resting HR unavailable */ }

      // Blood pressure — pair systolic + diastolic saved at (near-)identical times.
      step('Blood pressure');
      try {
        const [sys, dia] = await Promise.all([
          mod.queryQuantitySamples?.(QID.systolic, { from, to, limit: LIMIT }),
          mod.queryQuantitySamples?.(QID.diastolic, { from, to, limit: LIMIT }),
        ]);
        for (const s of sys || []) {
          const m = (dia || []).find((d) => Math.abs(d.startDate.getTime() - s.startDate.getTime()) < 2000);
          if (!m) continue;
          out.readings.push({
            type: 'bp', time: hhmm(s.startDate), startMs: s.startDate.getTime(),
            ownApp: isOwnSample(s.sourceRevision), dayKey: keyOf(s.startDate),
            fields: { sys: String(Math.round(s.quantity)), dia: String(Math.round(m.quantity)) },
          });
        }
      } catch { /* blood pressure unavailable */ }

      // HRV — heartbeat series only, so every reading carries real RR intervals,
      // and only sessions long enough to trust (same bar as the daily check).
      step('HRV sessions');
      try {
        const series = (await mod.queryHeartbeatSeriesSamples?.({ from, to, limit: LIMIT })) || [];
        for (const hb of series) {
          const rr = rrFromSeries(hb);
          if (rr.length < 20) continue;
          if (rr.reduce((s, v) => s + v, 0) < HISTORY_HRV_MIN_MS) continue;
          const res = computeHrv(rr);
          if (!res.time || !Object.keys(res.fields).length) continue;
          out.readings.push({
            type: 'hrv', time: hhmm(hb.startDate), startMs: hb.startDate.getTime(),
            ownApp: isOwnSample(hb.sourceRevision), dayKey: keyOf(hb.startDate),
            fields: res.fields, rr, rrClean: res.rrClean,
          });
        }
      } catch { /* heartbeat series unavailable */ }

      // Sleep — one range query bucketed into nights (see groupNights), then
      // each night's overnight HR range. Per-night HR is a separate query, so
      // they run pooled rather than 365-at-once.
      step('Sleep');
      try {
        const rows = (await mod.queryCategorySamples?.(CID.sleep, { from, to, limit: 100000 })) || [];
        const nights = groupNights(rows);
        out.sleep = await mapPooled(nights, 6, async ({ dayKey, rows: night }) => {
          const sum = summarizeSleep(night);
          if (!sum || sum.minutesAsleep < HISTORY_SLEEP_MIN_MIN) return null;
          const hr = await rangeQ(QID.heartRate, sum.bed, sum.wake);
          return {
            dayKey,
            bed: hhmm(sum.bed),
            wake: hhmm(sum.wake),
            bedISO: sum.bed.toISOString(),
            wakeISO: sum.wake.toISOString(),
            hrLow: hr ? Math.round(hr.min) : null,
            hrHigh: hr ? Math.round(hr.max) : null,
            interrupted: sum.interrupted,
            minutesAsleep: sum.minutesAsleep,
            stages: sum.stages,
          } satisfies HistorySleep;
        }, (done, total) => step('Sleep', done, total));
      } catch { /* sleep unavailable */ }

      // Workouts — one range query, then each session's HR samples for its
      // stats and the trace the workout report draws.
      step('Workouts');
      try {
        const rows = (await mod.queryWorkoutSamples?.({ from, to, distanceUnit: 'mi', limit: 5000 })) || [];
        const usable = rows.filter((w) => Math.round((w.duration || 0) / 60) >= 1);
        out.workouts = await mapPooled(usable, 4, async (w) => {
          let avgHr: number | null = null; let minHr: number | null = null; let maxHr: number | null = null;
          let hr: readonly QSample[] = [];
          try { hr = (await mod.queryQuantitySamples?.(QID.heartRate, { from: w.startDate, to: w.endDate, limit: 5000 })) || []; } catch { /* HR unavailable */ }
          if (hr.length) {
            let sum = 0; let min = Infinity; let max = -Infinity;
            for (const s of hr) { sum += s.quantity; if (s.quantity < min) min = s.quantity; if (s.quantity > max) max = s.quantity; }
            avgHr = Math.round(sum / hr.length); minHr = Math.round(min); maxHr = Math.round(max);
          }
          const dist = w.totalDistance?.quantity;
          return {
            type: activityTypeFromHk(w.workoutActivityType, !!w.metadata?.HKIndoorWorkout),
            time: hhmm(w.startDate),
            startMs: w.startDate.getTime(),
            dayKey: keyOf(w.startDate),
            durationMin: Math.round((w.duration || 0) / 60),
            distanceMi: dist && dist > 0 ? Math.round(dist * 100) / 100 : null,
            avgHr, minHr, maxHr,
            hrSeries: workoutHrSeries(hr.map((s) => ({ ms: s.startDate.getTime(), bpm: s.quantity })), w.startDate.getTime()),
            sourceName: w.sourceRevision?.source?.name || 'Apple Health',
            ownApp: isOwnSample(w.sourceRevision),
          } satisfies HistoryWorkout;
        }, (done, total) => step('Workouts', done, total));
        out.workouts.sort((a, b) => a.startMs - b.startMs);
      } catch { /* workouts unavailable */ }

      // Medications — no HealthKit dose query exists yet (see readMedications),
      // so history has nothing to sweep; wired through for when it lands.
      step('Medications');

      return out;
    },

    async readHrvSessions({ fromMs, toMs }) {
      try {
        // predicateForSamples matches on overlap, so a Breathe session that
        // started slightly before the window still comes back.
        const series = (await mod.queryHeartbeatSeriesSamples?.({ from: new Date(fromMs), to: new Date(toMs), limit: 50 })) || [];
        const out: WatchHrvSample[] = [];
        for (const hb of series) {
          if (isOwnSample(hb.sourceRevision)) continue;
          const rr = rrFromSeries(hb);
          if (rr.length < 20) continue;
          out.push({
            startMs: hb.startDate.getTime(),
            endMs: hb.endDate.getTime(),
            rr,
            sourceName: hb.sourceRevision?.source?.name || 'Apple Watch',
          });
        }
        return out.sort((a, b) => b.startMs - a.startMs);
      } catch { return []; }
    },

    async readMedications() {
      // @kingstinct/react-native-healthkit has no medication-dose query yet
      // (the HKMedication APIs are iOS 26+); wire it here when it lands.
      return [];
    },

    async readWorkouts(dk) {
      const { from, to } = dayBounds(dk);
      try {
        const rows = (await mod.queryWorkoutSamples?.({ from, to, distanceUnit: 'mi', limit: 200 })) || [];
        const out: ImportedWorkout[] = [];
        for (const w of rows) {
          const durationMin = Math.round((w.duration || 0) / 60);
          if (durationMin < 1) continue; // zero-length blips (triathlon transitions etc.)
          // HR stats from the raw samples recorded during the workout — a watch
          // workout samples every few seconds, so one query covers avg/min/max.
          let avgHr: number | null = null; let minHr: number | null = null; let maxHr: number | null = null;
          let hr: readonly QSample[] = [];
          try { hr = (await mod.queryQuantitySamples?.(QID.heartRate, { from: w.startDate, to: w.endDate, limit: 5000 })) || []; } catch { /* HR unavailable */ }
          if (hr.length) {
            let sum = 0; let min = Infinity; let max = -Infinity;
            for (const s of hr) { sum += s.quantity; if (s.quantity < min) min = s.quantity; if (s.quantity > max) max = s.quantity; }
            avgHr = Math.round(sum / hr.length); minHr = Math.round(min); maxHr = Math.round(max);
          }
          const dist = w.totalDistance?.quantity;
          out.push({
            type: activityTypeFromHk(w.workoutActivityType, !!w.metadata?.HKIndoorWorkout),
            time: hhmm(w.startDate),
            startMs: w.startDate.getTime(),
            durationMin,
            distanceMi: dist && dist > 0 ? Math.round(dist * 100) / 100 : null,
            avgHr, minHr, maxHr,
            hrSeries: workoutHrSeries(hr.map((s) => ({ ms: s.startDate.getTime(), bpm: s.quantity })), w.startDate.getTime()),
            sourceName: w.sourceRevision?.source?.name || 'Apple Health',
            ownApp: isOwnSample(w.sourceRevision),
          });
        }
        return out.sort((a, b) => a.startMs - b.startMs);
      } catch { return []; }
    },

    async readSleep(dk) {
      // A night that ends on `dk` usually starts the previous evening. Query a
      // generous window (prev-day 18:00 → this-day 14:00); summarizeSleep picks
      // the main session out of it (so a nap doesn't skew bed/wake) and
      // measures minutes on the interval union (so overlapping iPhone + Watch
      // samples don't double-count).
      const [y, m, d] = dk.split('-').map(Number);
      const from = new Date(y, m - 1, d - 1, 18, 0, 0);
      const to = new Date(y, m - 1, d, 14, 0, 0);
      try {
        const rows = (await mod.queryCategorySamples?.(CID.sleep, { from, to, limit: 400 })) || [];
        const night = summarizeSleep(rows);
        if (!night) return null;
        const hr = await rangeQ(QID.heartRate, night.bed, night.wake);
        return {
          bed: hhmm(night.bed),
          wake: hhmm(night.wake),
          bedISO: night.bed.toISOString(),
          wakeISO: night.wake.toISOString(),
          hrLow: hr ? Math.round(hr.min) : null,
          hrHigh: hr ? Math.round(hr.max) : null,
          interrupted: night.interrupted,
          minutesAsleep: night.minutesAsleep,
          stages: night.stages,
        };
      } catch { return null; }
    },

    async writeHrvSession({ sdnnMs, avgHr, startISO, durationSec }) {
      const start = new Date(startISO);
      const end = new Date(start.getTime() + durationSec * 1000);
      if (sdnnMs != null && Number.isFinite(sdnnMs) && sdnnMs > 0) await saveQ(QID.hrvSdnn, 'ms', sdnnMs, start, end);
      // Session-average HR is a HeartRate sample, NOT RestingHeartRate — that
      // identifier is Apple's derived all-day metric and writing to it skews
      // every consumer of resting HR (including our own readAll/import).
      if (avgHr != null && Number.isFinite(avgHr) && avgHr > 0) await saveQ(QID.heartRate, 'count/min', avgHr, start, end);
      try { await mod.saveCategorySample?.(CID.mindful, 0, { start, end }); } catch { /* graceful */ }
    },

    async writeQuantity(kind, value, when) {
      const map: Record<string, [string, string, number]> = {
        systolic: [QID.systolic, 'mmHg', value],
        diastolic: [QID.diastolic, 'mmHg', value],
        restingHr: [QID.restingHr, 'count/min', value],
      };
      const entry = map[kind];
      if (!entry) return;
      const [id, unit, v] = entry;
      await saveQ(id, unit, v, when, when);
    },

    async publishReading(entry, dk) {
      const when = dateAt(dk, (entry.time as string) || '12:00');
      let written = 0;

      if (entry.type === 'bp') {
        const sys = num(entry.sys); const dia = num(entry.dia);
        if (sys != null && dia != null) {
          try {
            await mod.saveCorrelationSample?.(CORR.bloodPressure, [
              { quantityType: QID.systolic, unit: 'mmHg', quantity: sys, startDate: when, endDate: when },
              { quantityType: QID.diastolic, unit: 'mmHg', quantity: dia, startDate: when, endDate: when },
            ], { start: when, end: when });
            written += 1;
          } catch { /* graceful */ }
        }
        return written;
      }

      if (entry.type === 'restingHr') {
        const v = num(entry.hr);
        if (v != null) written += (await saveQ(QID.restingHr, 'count/min', v, when, when)) ? 1 : 0;
        return written;
      }

      if (entry.type === 'hrv' || entry.type === 'breathHrv') {
        const sdnn = num(entry.sdnn);
        if (sdnn != null) written += (await saveQ(QID.hrvSdnn, 'ms', sdnn, when, when)) ? 1 : 0;
        return written;
      }

      return written;
    },
  };
}
