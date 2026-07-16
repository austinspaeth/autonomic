/**
 * Health Connect wrapper (Android only) — the Android twin of the HealthKit
 * implementation in index.ts, satisfying the same HealthApi surface so every
 * consumer (settings sync, sleep import, reading picker, write-backs) works
 * unchanged.
 *
 * Differences from HealthKit that shape this file:
 *  - Health Connect's HRV record is RMSSD (HeartRateVariabilityRmssd), not
 *    SDNN, and there is no beat-to-beat (heartbeat series) type at all. HRV
 *    imports therefore carry an `rmssd` field instead of `sdnn`, and
 *    `readHrvSessions` (an Apple Watch flow) always returns [].
 *  - Blood pressure is a single record holding both values — no pairing pass.
 *  - Provenance is `metadata.dataOrigin` (a package name), not a bundle id.
 *  - Queries take ISO strings and are paged via pageToken.
 */
import type { Entry, SleepStages } from '../types';
import { keyOf } from '../dates';
import { INTERRUPTED_AWAKE_MIN } from './sleepSummary';
import { activityTypeFromHc } from './workoutMap';
import type {
  HealthApi, HealthDaySamples, HistoryReading, ImportedReading, ImportedWorkout, SleepImport,
} from './index';

/** This app's Android package — used to skip re-importing our own write-backs. */
const OWN_PACKAGE = 'com.autonomic.journal';

type TimeRangeFilter = { operator: 'between'; startTime: string; endTime: string };
type Metadata = { id?: string; dataOrigin?: string };
type RestingHrRecord = { time: string; beatsPerMinute: number; metadata?: Metadata };
type HrSample = { time: string; beatsPerMinute: number };
type HrRecord = { startTime: string; endTime: string; samples: HrSample[]; metadata?: Metadata };
type RmssdRecord = { time: string; heartRateVariabilityMillis: number; metadata?: Metadata };
type PressureValue = { inMillimetersOfMercury: number };
type BpRecord = { time: string; systolic: PressureValue; diastolic: PressureValue; metadata?: Metadata };
type WeightRecord = { time: string; weight: { inKilograms: number }; metadata?: Metadata };
type RespRecord = { time: string; rate: number; metadata?: Metadata };
type SleepStageRaw = { startTime: string; endTime: string; stage: number };
type SleepRecord = { startTime: string; endTime: string; stages?: SleepStageRaw[]; metadata?: Metadata };
type ExerciseRecord = { startTime: string; endTime: string; exerciseType: number; metadata?: Metadata };
type DistanceRecord = { startTime: string; endTime: string; distance: { inMeters: number }; metadata?: Metadata };

interface HcModule {
  initialize: () => Promise<boolean>;
  getSdkStatus: () => Promise<number>;
  requestPermission: (perms: { accessType: 'read' | 'write'; recordType: string }[]) => Promise<unknown[]>;
  readRecords: (recordType: string, opts: {
    timeRangeFilter: TimeRangeFilter; pageSize?: number; pageToken?: string; ascendingOrder?: boolean;
  }) => Promise<{ records: unknown[]; pageToken?: string }>;
  insertRecords: (records: Record<string, unknown>[]) => Promise<string[]>;
  SdkAvailabilityStatus: { SDK_AVAILABLE: number };
}

const READ_TYPES = [
  'RestingHeartRate', 'HeartRate', 'HeartRateVariabilityRmssd',
  'RespiratoryRate', 'BloodPressure', 'Weight', 'SleepSession',
  'ExerciseSession', 'Distance',
];
const WRITE_TYPES = [
  'HeartRateVariabilityRmssd', 'HeartRate', 'RestingHeartRate', 'BloodPressure',
];

/** Health Connect sleep-stage constants → the app's stage buckets. */
const STAGE_AWAKE = [1, 7];          // AWAKE, AWAKE_IN_BED
const STAGE_LIGHT = 4;               // → core (Apple's naming for light sleep)
const STAGE_DEEP = 5;
const STAGE_REM = 6;
const STAGE_UNSPECIFIED = 2;         // SLEEPING — asleep, stage unknown

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

const isOwnRecord = (meta?: Metadata): boolean => meta?.dataOrigin === OWN_PACKAGE;

export function makeHealthConnect(mod: HcModule): HealthApi {
  let initialized = false;
  const ensureInit = async (): Promise<boolean> => {
    if (initialized) return true;
    try {
      const status = await mod.getSdkStatus();
      if (status !== mod.SdkAvailabilityStatus.SDK_AVAILABLE) return false;
      initialized = await mod.initialize();
      return initialized;
    } catch { return false; }
  };

  const between = (from: Date, to: Date): TimeRangeFilter => ({
    operator: 'between', startTime: from.toISOString(), endTime: to.toISOString(),
  });
  const dayBounds = (dk: string) => ({ from: dateAt(dk, '00:00'), to: dateAt(dk, '23:59') });

  /** All records of a type in a window, following pageToken to the end. */
  async function readAll<T>(recordType: string, from: Date, to: Date, cap = 50000): Promise<T[]> {
    if (!(await ensureInit())) return [];
    const out: T[] = [];
    let pageToken: string | undefined;
    try {
      do {
        const res = await mod.readRecords(recordType, {
          timeRangeFilter: between(from, to), pageSize: 1000, pageToken, ascendingOrder: true,
        });
        out.push(...(res.records as T[]));
        pageToken = res.pageToken;
      } while (pageToken && out.length < cap);
    } catch { /* type unavailable or permission missing — treat as empty */ }
    return out;
  }

  const avgOf = (values: number[]): number | null =>
    values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

  const insert = async (records: Record<string, unknown>[]): Promise<boolean> => {
    if (!records.length || !(await ensureInit())) return false;
    try { await mod.insertRecords(records); return true; } catch { return false; }
  };

  return {
    available: true,

    async requestAuth() {
      try {
        if (!(await ensureInit())) return false;
        const granted = await mod.requestPermission([
          ...READ_TYPES.map((recordType) => ({ accessType: 'read' as const, recordType })),
          ...WRITE_TYPES.map((recordType) => ({ accessType: 'write' as const, recordType })),
        ]);
        return granted.length > 0;
      } catch { return false; }
    },

    async readDay(dk) {
      const { from, to } = dayBounds(dk);
      const [rhr, resp, bp, weight] = await Promise.all([
        readAll<RestingHrRecord>('RestingHeartRate', from, to),
        readAll<RespRecord>('RespiratoryRate', from, to),
        readAll<BpRecord>('BloodPressure', from, to),
        readAll<WeightRecord>('Weight', from, to),
      ]);
      const restingHr = avgOf(rhr.map((r) => r.beatsPerMinute));
      const respiratoryRate = avgOf(resp.map((r) => r.rate));
      const systolic = avgOf(bp.map((r) => r.systolic.inMillimetersOfMercury));
      const diastolic = avgOf(bp.map((r) => r.diastolic.inMillimetersOfMercury));
      const weightKg = avgOf(weight.map((r) => r.weight.inKilograms));
      let sleep: HealthDaySamples['sleep'] = null;
      const s = await this.readSleep(dk);
      if (s) sleep = { bed: s.bed, wake: s.wake, interrupted: s.interrupted };
      return {
        restingHr: restingHr != null ? Math.round(restingHr) : null,
        // Health Connect's HRV metric is RMSSD, not SDNN — never report it here.
        hrvSdnn: null,
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
      const [rhr, bp, rmssd] = await Promise.all([
        readAll<RestingHrRecord>('RestingHeartRate', from, to),
        readAll<BpRecord>('BloodPressure', from, to),
        readAll<RmssdRecord>('HeartRateVariabilityRmssd', from, to),
      ]);
      const ts = (iso: string, meta?: Metadata) => {
        const d = new Date(iso);
        return { time: hhmm(d), startMs: d.getTime(), ownApp: isOwnRecord(meta) };
      };
      rhr.forEach((r) => out.push({ type: 'restingHr', ...ts(r.time, r.metadata), fields: { hr: String(Math.round(r.beatsPerMinute)), position: 'Laying' } }));
      bp.forEach((r) => out.push({
        type: 'bp', ...ts(r.time, r.metadata),
        fields: { sys: String(Math.round(r.systolic.inMillimetersOfMercury)), dia: String(Math.round(r.diastolic.inMillimetersOfMercury)) },
      }));
      rmssd.forEach((r) => out.push({ type: 'hrv', ...ts(r.time, r.metadata), fields: { rmssd: String(Math.round(r.heartRateVariabilityMillis)) } }));
      return out;
    },

    async readHistory({ fromISO, toISO }) {
      const from = new Date(fromISO);
      const to = new Date(toISO);
      const out: HistoryReading[] = [];
      const [rhr, bp, rmssd] = await Promise.all([
        readAll<RestingHrRecord>('RestingHeartRate', from, to),
        readAll<BpRecord>('BloodPressure', from, to),
        readAll<RmssdRecord>('HeartRateVariabilityRmssd', from, to),
      ]);
      const ts = (iso: string, meta?: Metadata) => {
        const d = new Date(iso);
        return { time: hhmm(d), startMs: d.getTime(), ownApp: isOwnRecord(meta), dayKey: keyOf(d) };
      };
      rhr.forEach((r) => out.push({ type: 'restingHr', ...ts(r.time, r.metadata), fields: { hr: String(Math.round(r.beatsPerMinute)), position: 'Laying' } }));
      bp.forEach((r) => out.push({
        type: 'bp', ...ts(r.time, r.metadata),
        fields: { sys: String(Math.round(r.systolic.inMillimetersOfMercury)), dia: String(Math.round(r.diastolic.inMillimetersOfMercury)) },
      }));
      // No beat-to-beat series exists on Android, so unlike iOS (which imports
      // only RR-backed HRV) the history sweep takes the RMSSD records as-is.
      rmssd.forEach((r) => out.push({ type: 'hrv', ...ts(r.time, r.metadata), fields: { rmssd: String(Math.round(r.heartRateVariabilityMillis)) } }));
      return out;
    },

    // Apple Watch Breathe/ECG sync flow — no Android equivalent (no heartbeat
    // series record type in Health Connect).
    async readHrvSessions() { return []; },

    async readWorkouts(dk) {
      const { from, to } = dayBounds(dk);
      const sessions = await readAll<ExerciseRecord>('ExerciseSession', from, to);
      const out: ImportedWorkout[] = [];
      for (const s of sessions) {
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
        if (durationMin < 1) continue;
        // Sessions carry no distance or HR of their own — aggregate the raw
        // Distance and HeartRate records logged while the session ran.
        const [dist, hrRecords] = await Promise.all([
          readAll<DistanceRecord>('Distance', start, end),
          readAll<HrRecord>('HeartRate', start, end),
        ]);
        const meters = dist.reduce((sum, r) => sum + (r.distance?.inMeters || 0), 0);
        let avgHr: number | null = null; let minHr: number | null = null; let maxHr: number | null = null;
        let hrSum = 0; let hrN = 0;
        for (const rec of hrRecords) {
          for (const smp of rec.samples || []) {
            hrSum += smp.beatsPerMinute; hrN++;
            if (minHr == null || smp.beatsPerMinute < minHr) minHr = smp.beatsPerMinute;
            if (maxHr == null || smp.beatsPerMinute > maxHr) maxHr = smp.beatsPerMinute;
          }
        }
        if (hrN) { avgHr = Math.round(hrSum / hrN); minHr = Math.round(minHr!); maxHr = Math.round(maxHr!); }
        out.push({
          type: activityTypeFromHc(s.exerciseType),
          time: hhmm(start),
          startMs: start.getTime(),
          durationMin,
          distanceMi: meters > 0 ? Math.round((meters / 1609.344) * 100) / 100 : null,
          avgHr, minHr, maxHr,
          sourceName: s.metadata?.dataOrigin || 'Health Connect',
          ownApp: isOwnRecord(s.metadata),
        });
      }
      return out.sort((a, b) => a.startMs - b.startMs);
    },

    async readSleep(dk) {
      // Same window strategy as iOS: the night ending on `dk` starts the prior
      // evening; query prev-day 18:00 → this-day 14:00 and take the longest
      // session (so a nap doesn't win).
      const [y, m, d] = dk.split('-').map(Number);
      const from = new Date(y, m - 1, d - 1, 18, 0, 0);
      const to = new Date(y, m - 1, d, 14, 0, 0);
      const sessions = await readAll<SleepRecord>('SleepSession', from, to);
      if (!sessions.length) return null;
      const durMs = (s: SleepRecord) => new Date(s.endTime).getTime() - new Date(s.startTime).getTime();
      const main = sessions.reduce((a, b) => (durMs(b) > durMs(a) ? b : a));
      const bed = new Date(main.startTime);
      const wake = new Date(main.endTime);

      // Per-stage minutes. Health Connect stages: light→core (Apple's name for
      // it), SLEEPING counts as asleep but carries no stage; a night with only
      // SLEEPING blocks reports stages: null (mirrors iOS asleepUnspecified).
      let deepMin = 0; let remMin = 0; let coreMin = 0; let awakeMin = 0; let unspecMin = 0;
      for (const st of main.stages || []) {
        const mins = (new Date(st.endTime).getTime() - new Date(st.startTime).getTime()) / 60000;
        if (STAGE_AWAKE.includes(st.stage)) awakeMin += mins;
        else if (st.stage === STAGE_LIGHT) coreMin += mins;
        else if (st.stage === STAGE_DEEP) deepMin += mins;
        else if (st.stage === STAGE_REM) remMin += mins;
        else if (st.stage === STAGE_UNSPECIFIED) unspecMin += mins;
      }
      const staged = deepMin + remMin + coreMin > 0;
      const asleepMin = staged || unspecMin > 0
        ? deepMin + remMin + coreMin + unspecMin
        : durMs(main) / 60000;
      const stages: SleepStages | null = staged
        ? { deep: Math.round(deepMin), rem: Math.round(remMin), core: Math.round(coreMin), awake: Math.round(awakeMin) }
        : null;

      // Overnight HR range from raw HeartRate samples across the night.
      let hrLow: number | null = null; let hrHigh: number | null = null;
      const hrRecords = await readAll<HrRecord>('HeartRate', bed, wake);
      for (const rec of hrRecords) {
        for (const s of rec.samples || []) {
          if (hrLow == null || s.beatsPerMinute < hrLow) hrLow = s.beatsPerMinute;
          if (hrHigh == null || s.beatsPerMinute > hrHigh) hrHigh = s.beatsPerMinute;
        }
      }

      return {
        bed: hhmm(bed),
        wake: hhmm(wake),
        bedISO: bed.toISOString(),
        wakeISO: wake.toISOString(),
        hrLow: hrLow != null ? Math.round(hrLow) : null,
        hrHigh: hrHigh != null ? Math.round(hrHigh) : null,
        interrupted: awakeMin > INTERRUPTED_AWAKE_MIN,
        minutesAsleep: Math.round(asleepMin),
        stages,
      } satisfies SleepImport;
    },

    async writeHrvSession({ rmssdMs, avgHr, startISO, durationSec }) {
      // Health Connect has no SDNN record — RMSSD is the HRV type. Nothing is
      // written when the session produced no RMSSD (never approximate one).
      const start = new Date(startISO);
      const end = new Date(start.getTime() + durationSec * 1000);
      const records: Record<string, unknown>[] = [];
      if (rmssdMs != null && Number.isFinite(rmssdMs) && rmssdMs > 0) {
        records.push({ recordType: 'HeartRateVariabilityRmssd', time: end.toISOString(), heartRateVariabilityMillis: rmssdMs });
      }
      // Session-average HR as a plain HeartRate sample (NOT RestingHeartRate) —
      // same reasoning as iOS: resting HR is a derived all-day metric.
      if (avgHr != null && Number.isFinite(avgHr) && avgHr > 0) {
        records.push({
          recordType: 'HeartRate', startTime: start.toISOString(), endTime: end.toISOString(),
          samples: [{ time: end.toISOString(), beatsPerMinute: Math.round(avgHr) }],
        });
      }
      await insert(records);
    },

    async writeQuantity(kind, value, when) {
      // Blood pressure is a single two-value record in Health Connect, so the
      // lone-systolic / lone-diastolic writes have no target here; BP flows
      // through publishReading instead.
      if (kind !== 'restingHr') return;
      await insert([{ recordType: 'RestingHeartRate', time: when.toISOString(), beatsPerMinute: Math.round(value) }]);
    },

    async publishReading(entry: Entry, dk: string) {
      const when = dateAt(dk, (entry.time as string) || '12:00').toISOString();
      let written = 0;

      if (entry.type === 'bp') {
        const sys = num(entry.sys); const dia = num(entry.dia);
        if (sys != null && dia != null) {
          const ok = await insert([{
            recordType: 'BloodPressure', time: when,
            systolic: { unit: 'millimetersOfMercury', value: sys },
            diastolic: { unit: 'millimetersOfMercury', value: dia },
            bodyPosition: 0, measurementLocation: 0,
          }]);
          written += ok ? 1 : 0;
        }
        return written;
      }

      if (entry.type === 'restingHr') {
        const v = num(entry.hr);
        if (v != null) {
          const ok = await insert([{ recordType: 'RestingHeartRate', time: when, beatsPerMinute: Math.round(v) }]);
          written += ok ? 1 : 0;
        }
        return written;
      }

      if (entry.type === 'hrv' || entry.type === 'breathHrv') {
        const rmssd = num(entry.rmssd);
        if (rmssd != null) {
          const ok = await insert([{ recordType: 'HeartRateVariabilityRmssd', time: when, heartRateVariabilityMillis: rmssd }]);
          written += ok ? 1 : 0;
        }
        return written;
      }

      return written;
    },
  };
}
