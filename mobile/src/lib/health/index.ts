/**
 * Apple HealthKit wrapper (iOS only).
 *
 * Read: resting/walking HR, HRV SDNN, respiratory rate, blood pressure,
 * body mass (profile weight only), sleep (with overnight HR range). Write: HRV
 * SDNN, resting/avg HR, a Mindfulness session, and blood pressure (as a proper
 * correlation). `publishReading` maps an app journal entry to the right writes.
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
import { Platform } from 'react-native';
import type { Entry } from '../types';
import { computeHrv } from '../hrv';

/** This app's bundle id — used to skip re-importing our own write-backs. */
const OWN_BUNDLE = 'com.autonomic.journal';

export interface HealthApi {
  available: boolean;
  requestAuth(): Promise<boolean>;
  /** Pull the day's relevant samples for a YYYY-MM-DD key. */
  readDay(dk: string): Promise<HealthDaySamples>;
  /**
   * Per-sample, timestamped readings for a day (resting HR, BP, HRV) —
   * each keeps its real clock time and a flag for whether this app authored it.
   */
  readImports(dk: string): Promise<ImportedReading[]>;
  /** Read the night that *ends* on `dk` (spans the prior evening → this morning). */
  readSleep(dk: string): Promise<SleepImport | null>;
  writeHrvSession(opts: { sdnnMs: number; avgHr: number; startISO: string; durationSec: number }): Promise<void>;
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

export interface SleepImport {
  bed: string;        // HH:MM local
  wake: string;       // HH:MM local
  bedISO: string;
  wakeISO: string;
  hrLow: number | null;
  hrHigh: number | null;
  interrupted: boolean;
  minutesAsleep: number;
}

const emptyDay: HealthDaySamples = {
  restingHr: null, hrvSdnn: null, systolic: null, diastolic: null,
  respiratoryRate: null, weightLb: null, sleep: null,
};

const stub: HealthApi = {
  available: false,
  async requestAuth() { return false; },
  async readDay() { return emptyDay; },
  async readImports() { return []; },
  async readSleep() { return null; },
  async writeHrvSession() { /* no-op */ },
  async writeQuantity() { /* no-op */ },
  async publishReading() { return 0; },
};

let cached: HealthApi | null = null;

export function health(): HealthApi {
  if (cached) return cached;
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

/** For tests: force a specific implementation (or reset). */
export function __setHealth(api: HealthApi | null) { cached = api; }

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
interface HkModule {
  isHealthDataAvailable?: () => Promise<boolean>;
  requestAuthorization?: (read: string[], write: string[]) => Promise<boolean>;
  queryQuantitySamples?: (id: string, opts: Record<string, unknown>) => Promise<readonly QSample[]>;
  queryCategorySamples?: (id: string, opts: Record<string, unknown>) => Promise<readonly CSample[]>;
  queryHeartbeatSeriesSamples?: (opts: Record<string, unknown>) => Promise<readonly HeartbeatSeries[]>;
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

const READ_IDS = [
  QID.restingHr, QID.heartRate, QID.hrvSdnn, QID.respiratoryRate,
  QID.systolic, QID.diastolic, QID.bodyMass, CID.sleep, HEARTBEAT_SERIES,
];
const WRITE_IDS = [
  QID.hrvSdnn, QID.restingHr, QID.heartRate,
  QID.systolic, QID.diastolic, CID.mindful,
];

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

    async requestAuth() {
      try {
        if (mod.isHealthDataAvailable && !(await mod.isHealthDataAvailable())) return false;
        // v8 order: (read, write).
        return (await mod.requestAuthorization?.(READ_IDS, WRITE_IDS)) ?? false;
      } catch { return false; }
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

    async readSleep(dk) {
      // A night that ends on `dk` usually starts the previous evening. Query a
      // generous window (prev-day 18:00 → this-day 14:00) and pick the main block.
      const [y, m, d] = dk.split('-').map(Number);
      const from = new Date(y, m - 1, d - 1, 18, 0, 0);
      const to = new Date(y, m - 1, d, 14, 0, 0);
      try {
        const rows = (await mod.queryCategorySamples?.(CID.sleep, { from, to, limit: 400 })) || [];
        // HKCategoryValueSleepAnalysis: 0 inBed, 1 asleepUnspecified, 2 awake,
        // 3 asleepCore, 4 asleepDeep, 5 asleepREM.
        const asleep = rows.filter((r) => r.value === 1 || r.value === 3 || r.value === 4 || r.value === 5);
        if (!asleep.length) return null;
        const bed = asleep.reduce((a, b) => (a.startDate < b.startDate ? a : b)).startDate;
        const wake = asleep.reduce((a, b) => (a.endDate > b.endDate ? a : b)).endDate;
        const minutesAsleep = Math.round(
          asleep.reduce((s, r) => s + (r.endDate.getTime() - r.startDate.getTime()), 0) / 60000,
        );
        const awakeSegments = rows.filter((r) => r.value === 2 && r.startDate >= bed && r.endDate <= wake);
        const hr = await rangeQ(QID.heartRate, bed, wake);
        return {
          bed: hhmm(bed),
          wake: hhmm(wake),
          bedISO: bed.toISOString(),
          wakeISO: wake.toISOString(),
          hrLow: hr ? Math.round(hr.min) : null,
          hrHigh: hr ? Math.round(hr.max) : null,
          interrupted: awakeSegments.length >= 2,
          minutesAsleep,
        };
      } catch { return null; }
    },

    async writeHrvSession({ sdnnMs, avgHr, startISO, durationSec }) {
      const start = new Date(startISO);
      const end = new Date(start.getTime() + durationSec * 1000);
      await saveQ(QID.hrvSdnn, 'ms', sdnnMs, start, end);
      if (Number.isFinite(avgHr) && avgHr > 0) await saveQ(QID.restingHr, 'count/min', avgHr, start, end);
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
