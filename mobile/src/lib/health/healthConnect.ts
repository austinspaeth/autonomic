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
import type { CycleFlow, Entry } from '../types';
import { keyOf } from '../dates';
import { logError } from '../diagnostics/errorLog';
import {
  hasAskedAuth, markAskedAuth, markPromptedThisLaunch, markUngrantable, promptedThisLaunch,
  shareAuthRequest, ungrantable, ungrantableScope,
} from './askedAuth';
import { hrWindowBlocked, markHrReadDone, markHrReadStart } from './hrPoisonMemory';
import { NIGHT_END_HOUR, NIGHT_START_HOUR, nightKeyOf, summarizeHcSessions, type SleepSummary } from './sleepSummary';
import { thinSeries, type HrPoint, type RespPoint } from '../sleep/night';
import { activityTypeFromHc, workoutHrSeries } from './workoutMap';
import { stepTotalFromRecords } from './stepTotal';
import { largestSourceMeters, recordsForSession, sessionOwnMeters } from './workoutDistance';
import { HISTORY_SLEEP_MIN_MIN, NIGHT_SERIES_MAX, emptyHistory, heaviestPerDay } from './index';
import type {
  CycleImport, HealthApi, HealthDaySamples, ImportedReading, ImportedWorkout, SleepImport,
} from './index';

/** This app's Android package — used to skip re-importing our own write-backs. */
const OWN_PACKAGE = 'com.autonomic.journal';

type TimeRangeFilter = { operator: 'between'; startTime: string; endTime: string };
type Metadata = { id?: string; dataOrigin?: string };
type RestingHrRecord = { time: string; beatsPerMinute: number; metadata?: Metadata };
type HrSample = { time: string; beatsPerMinute: number };
type HrRecord = { startTime: string; endTime: string; samples: HrSample[]; metadata?: Metadata };
type RmssdRecord = { time: string; heartRateVariabilityMillis: number; metadata?: Metadata };
type StepsRecord = { startTime: string; endTime: string; count: number; metadata?: Metadata };
type PressureValue = { inMillimetersOfMercury: number };
type BpRecord = { time: string; systolic: PressureValue; diastolic: PressureValue; metadata?: Metadata };
type WeightRecord = { time: string; weight: { inKilograms: number }; metadata?: Metadata };
type RespRecord = { time: string; rate: number; metadata?: Metadata };
type SleepStageRaw = { startTime: string; endTime: string; stage: number };
type SleepRecord = { startTime: string; endTime: string; stages?: SleepStageRaw[]; metadata?: Metadata };
type ExerciseRecord = { startTime: string; endTime: string; exerciseType: number; metadata?: Metadata };
type DistanceRecord = { startTime: string; endTime: string; distance: { inMeters: number }; metadata?: Metadata };
type FlowRecord = { time: string; flow?: number; metadata?: Metadata };
type InstantRecord = { time: string; metadata?: Metadata };
/** Health Connect's MenstruationPeriod is an interval record; the bridge's
 *  types call it instantaneous, so both shapes are read. */
type PeriodRecord = { time?: string; startTime?: string; endTime?: string; metadata?: Metadata };
type BbtRecord = { time: string; temperature: { inCelsius: number }; metadata?: Metadata };

interface HcModule {
  initialize: () => Promise<boolean>;
  getSdkStatus: () => Promise<number>;
  requestPermission: (perms: { accessType: 'read' | 'write'; recordType: string }[]) => Promise<unknown[]>;
  getGrantedPermissions: () => Promise<{ accessType?: string; recordType?: string }[]>;
  readRecords: (recordType: string, opts: {
    timeRangeFilter: TimeRangeFilter; pageSize?: number; pageToken?: string; ascendingOrder?: boolean;
  }) => Promise<{ records: unknown[]; pageToken?: string }>;
  /** Health Connect's own aggregation, which MERGES SOURCES by app priority —
   *  the same total the Health Connect app itself displays, and the Android
   *  twin of HealthKit's HKStatisticsQuery. Optional so a stub module (or an
   *  older library) still satisfies this interface; `stepTotal` falls back. */
  aggregateRecord?: (req: { recordType: string; timeRangeFilter: TimeRangeFilter })
    => Promise<Record<string, unknown>>;
  insertRecords: (records: Record<string, unknown>[]) => Promise<string[]>;
  /** Deletes only records THIS app wrote, whatever the filter says (Health
   *  Connect enforces that), which is what makes replacing a day's flow safe. */
  deleteRecordsByTimeRange?: (recordType: string, filter: TimeRangeFilter) => Promise<void>;
  SdkAvailabilityStatus: { SDK_AVAILABLE: number };
}

const READ_TYPES = [
  'RestingHeartRate', 'HeartRate', 'HeartRateVariabilityRmssd',
  'RespiratoryRate', 'BloodPressure', 'Weight', 'SleepSession',
  'ExerciseSession', 'Distance',
  // The pacing budget's passive floor. Android phones write their own step
  // count through the system provider, so this works with no wearable.
  // NOTE: android.permission.health.READ_STEPS must be declared in app.json
  // alongside this. Requesting a record type with no manifest permission
  // behind it can never be granted and loops the consent sheet forever — we
  // have shipped that bug once already (ExerciseSession/Distance).
  // Health Connect has no stand-time record, which is why `standMin` is
  // always null here and the caller falls back to walking minutes.
  'Steps',
];
const WRITE_TYPES = [
  'HeartRateVariabilityRmssd', 'HeartRate', 'RestingHeartRate', 'BloodPressure',
];

/**
 * Cycle-aware tracking's records, asked for SEPARATELY (`scope: 'cycle'`) and
 * only from a tap — never added to READ_TYPES, whose joined list is the core
 * set's once-only ask key: one more type there re-asks every install on its
 * next launch. Every one needs its android.permission.health.* line in app.json
 * (READ/WRITE_MENSTRUATION, READ/WRITE_INTERMENSTRUAL_BLEEDING,
 * READ_BASAL_BODY_TEMPERATURE); an undeclared one loops the consent sheet.
 * SkinTemperature is deliberately NOT asked for: Play rejected it under the
 * Health Connect minimum-scope policy (1.38), and basal body temperature is
 * the input the ovulation read is built on. Do not add it back without a
 * user-facing feature Play can see and a matching declaration.
 */
const CYCLE_READ_TYPES = ['MenstruationFlow', 'MenstruationPeriod', 'IntermenstrualBleeding', 'BasalBodyTemperature'];
const CYCLE_WRITE_TYPES = ['MenstruationFlow', 'IntermenstrualBleeding'];

/** Health Connect flow constants: 0 unknown, 1 light, 2 medium, 3 heavy. An
 *  unknown flow is a period day without a level, filed as medium for the
 *  reason the HealthKit side gives. */
const hcFlow = (v: number | undefined): CycleFlow => (v === 1 ? 'light' : v === 3 ? 'heavy' : 'medium');
const HC_FLOW_VALUE: Record<Exclude<CycleFlow, 'spotting'>, number> = { light: 1, medium: 2, heavy: 3 };

/** Health Connect sleep-stage constants live with the pure stitcher
 *  (`summarizeHcSessions` in ./sleepSummary). */

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

/**
 * When a cycle record for day `dk` is stamped: noon, so a time-zone shift can
 * never move it onto a neighbouring day, EXCEPT on the day itself before noon.
 * Health Connect refuses any record whose time is after the phone's clock
 * ("Record time must not be in the future"), so today's period logged at
 * 9 AM was rejected and never reached Health Connect. Until noon, today's
 * record is stamped a second ago instead, which is still on the right day.
 * A day that has not started yet keeps noon; there is no honest time for it.
 */
export function cycleRecordTime(dk: string, nowMs: number): Date {
  const noon = dateAt(dk, '12:00');
  if (noon.getTime() <= nowMs) return noon;
  const start = dateAt(dk, '00:00');
  if (start.getTime() > nowMs) return noon;
  return new Date(Math.max(start.getTime(), nowMs - 1000));
}


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

  /**
   * A merged cumulative total, the Android answer to iOS's `sumQ`. Health
   * Connect de-duplicates across writing apps during aggregation, which is
   * what its own UI shows; raw records must never be summed (see
   * `stepTotalFromRecords`). Null means the aggregation could not be run.
   */
  async function aggregate(recordType: string, metric: string, from: Date, to: Date): Promise<number | null> {
    if (!mod.aggregateRecord || !(await ensureInit())) return null;
    try {
      const res = await mod.aggregateRecord({ recordType, timeRangeFilter: between(from, to) });
      // A count is a bare number; a length (Distance's DISTANCE) is an object.
      const raw = res?.[metric];
      const v = Number(raw && typeof raw === 'object' ? (raw as { inMeters?: unknown }).inMeters : raw);
      return Number.isFinite(v) ? v : null;
    } catch { return null; }
  }

  const avgOf = (values: number[]): number | null =>
    values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;

  /**
   * The raw heart-rate records for a window, or NULL when reading them is
   * known to kill the process.
   *
   * Every HeartRate read in this file goes through here. The reason is in
   * ./hrPoison: a stored record with no samples throws inside the platform's
   * own read callback, on a binder thread, where `readAll`'s catch — or any
   * other catch of ours — cannot reach it. So a window that has already
   * crashed us once is never read again, and the callers fall back to the
   * aggregation, which returns scalars and never materialises a record.
   *
   * Null is deliberately NOT the same as `[]`: an empty list is a window with
   * no heart rate in it, and a caller that confused the two would report a
   * poisoned day as a day the user's heart was never measured.
   */
  async function readHr(from: Date, to: Date): Promise<HrRecord[] | null> {
    if (hrWindowBlocked(from, to)) return null;
    const token = markHrReadStart(from, to);
    try {
      return await readAll<HrRecord>('HeartRate', from, to);
    } finally {
      markHrReadDone(token);
    }
  }

  /**
   * Heart rate as the aggregation sees it: the fallback for a poisoned window.
   *
   * One call rather than three (the result map carries all of them), and a
   * zero is read as absent — react-native-health-connect fills a missing
   * metric with 0.0, and nobody's heart rate is zero.
   *
   * It merges every writing app by Health Connect's own priority, where
   * `workoutOf` otherwise restricts heart rate to the session's own app. That
   * is a real loss of precision and still the right trade: a mean cannot
   * double-count the way a summed distance can, and the alternative is a
   * workout with no heart rate at all.
   */
  async function hrAggregate(from: Date, to: Date): Promise<{ avg: number | null; min: number | null; max: number | null }> {
    const none = { avg: null, min: null, max: null };
    if (!mod.aggregateRecord || !(await ensureInit())) return none;
    try {
      const res = await mod.aggregateRecord({ recordType: 'HeartRate', timeRangeFilter: between(from, to) });
      const bpm = (k: string): number | null => {
        const v = Number(res?.[k]);
        return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
      };
      return { avg: bpm('BPM_AVG'), min: bpm('BPM_MIN'), max: bpm('BPM_MAX') };
    } catch { return none; }
  }

  // One insertRecords call per record TYPE. The native side parses a whole
  // batch with the FIRST record's type (`parseWriteRecords` in
  // react-native-health-connect), so the HRV session's [RMSSD, HeartRate] pair
  // read the HeartRate record as an RMSSD one, threw on its missing `time`, and
  // rejected the batch: every live capture on Android wrote nothing, silently.
  const insert = async (records: Record<string, unknown>[]): Promise<boolean> => {
    if (!records.length || !(await ensureInit())) return false;
    const byType = new Map<unknown, Record<string, unknown>[]>();
    for (const r of records) byType.set(r.recordType, [...(byType.get(r.recordType) || []), r]);
    let ok = true;
    for (const [type, batch] of byType) {
      try { await mod.insertRecords(batch); } catch (e) { ok = false; logError(`hc.write.${String(type)}`, e); }
    }
    return ok;
  };

  /** Every session in the window → the night, stitched (see summarizeHcSessions). */
  const summarizeSessions = (sessions: SleepRecord[]): SleepSummary | null =>
    summarizeHcSessions(sessions.map((r) => ({
      startMs: new Date(r.startTime).getTime(),
      endMs: new Date(r.endTime).getTime(),
      origin: r.metadata?.dataOrigin || '',
      stages: (r.stages || []).map((st) => ({
        startMs: new Date(st.startTime).getTime(), endMs: new Date(st.endTime).getTime(), stage: st.stage,
      })),
    })));

  /**
   * The stitched night → the app's night shape, including the overnight HR
   * range read across it. Stages: light→core (Apple's name for it); SLEEPING
   * counts as asleep but carries no stage, so a night of only SLEEPING blocks
   * reports stages: null (mirrors iOS asleepUnspecified).
   */
  async function nightOf(night: SleepSummary): Promise<SleepImport> {
    const { bed, wake } = night;
    const bedMs = bed.getTime();

    // The overnight heart-rate curve, kept rather than reduced to min/max on
    // the way past — the iOS side keeps it too, and the report reads the same
    // sidecar on both platforms.
    const hrRecords = await readHr(bed, wake);
    const hrPts: HrPoint[] = [];
    for (const rec of hrRecords || []) {
      for (const smp of rec.samples || []) {
        const bpm = smp.beatsPerMinute;
        if (!Number.isFinite(bpm) || bpm <= 0) continue;
        hrPts.push({ t: Math.round((new Date(smp.time).getTime() - bedMs) / 1000), bpm });
      }
    }
    hrPts.sort((a, b) => a.t - b.t);
    const hrSeries = thinSeries(hrPts, NIGHT_SERIES_MAX);
    const bpms = hrSeries.map((q) => q.bpm);
    // A poisoned night (hrRecords === null) keeps its low and high through the
    // aggregation, so the nocturnal dip still has a minimum to work from; it
    // loses only the curve, which is the state every night imported before the
    // series shipped is already in.
    const agg = hrRecords ? null : await hrAggregate(bed, wake);

    // Respiratory rate across the same window.
    const respRecords = await readAll<RespRecord>('RespiratoryRate', bed, wake);
    const respPts: RespPoint[] = respRecords
      .map((r) => ({ t: Math.round((new Date(r.time).getTime() - bedMs) / 1000), br: r.rate }))
      .filter((q) => Number.isFinite(q.br) && q.br > 0)
      .sort((a, b) => a.t - b.t);

    return {
      bed: hhmm(bed),
      wake: hhmm(wake),
      bedISO: bed.toISOString(),
      wakeISO: wake.toISOString(),
      hrLow: bpms.length ? Math.round(Math.min(...bpms)) : agg?.min ?? null,
      hrHigh: bpms.length ? Math.round(Math.max(...bpms)) : agg?.max ?? null,
      interrupted: night.interrupted,
      minutesAsleep: night.minutesAsleep,
      stages: night.stages,
      hrSeries: hrSeries.length ? hrSeries : null,
      respSeries: respPts.length ? thinSeries(respPts, NIGHT_SERIES_MAX) : null,
      spans: night.spans,
    } satisfies SleepImport;
  }

  /**
   * One exercise session → an ImportedWorkout. Sessions carry no distance or HR
   * of their own, so the Distance and HeartRate records logged while the
   * session ran are read here — the SESSION'S OWN APP's records, never every
   * app's summed (./workoutDistance: a Garmin run plus the phone's step-based
   * distance was filed at 18.76 km for a 10.75 km run). Returns null for
   * zero-length blips.
   */
  async function workoutOf(s: ExerciseRecord): Promise<ImportedWorkout | null> {
    const start = new Date(s.startTime);
    const end = new Date(s.endTime);
    const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
    if (durationMin < 1) return null;
    const [dist, hrRecords] = await Promise.all([
      readAll<DistanceRecord>('Distance', start, end),
      readHr(start, end),
    ]);
    const origin = s.metadata?.dataOrigin;
    const meters = sessionOwnMeters(dist, origin)
      ?? (dist.length ? await aggregate('Distance', 'DISTANCE', start, end) : null)
      ?? largestSourceMeters(dist);
    let avgHr: number | null = null; let minHr: number | null = null; let maxHr: number | null = null;
    let hrSum = 0; let hrN = 0;
    const hrPoints: { ms: number; bpm: number }[] = [];
    for (const rec of recordsForSession(hrRecords || [], origin)) {
      for (const smp of rec.samples || []) {
        hrSum += smp.beatsPerMinute; hrN++;
        if (minHr == null || smp.beatsPerMinute < minHr) minHr = smp.beatsPerMinute;
        if (maxHr == null || smp.beatsPerMinute > maxHr) maxHr = smp.beatsPerMinute;
        hrPoints.push({ ms: new Date(smp.time).getTime(), bpm: smp.beatsPerMinute });
      }
    }
    if (hrN) { avgHr = Math.round(hrSum / hrN); minHr = Math.round(minHr!); maxHr = Math.round(maxHr!); }
    // A poisoned window keeps its three numbers (merged across apps, see
    // hrAggregate) and loses the trace, so the workout still carries zones
    // rather than reading as one taken with no heart-rate monitor at all.
    if (!hrRecords) ({ avg: avgHr, min: minHr, max: maxHr } = await hrAggregate(start, end));
    return {
      type: activityTypeFromHc(s.exerciseType),
      time: hhmm(start),
      startMs: start.getTime(),
      durationMin,
      distanceMi: meters > 0 ? Math.round((meters / 1609.344) * 100) / 100 : null,
      avgHr, minHr, maxHr,
      hrSeries: workoutHrSeries(hrPoints, start.getTime()),
      sourceName: s.metadata?.dataOrigin || 'Health Connect',
      ownApp: isOwnRecord(s.metadata),
    };
  }

  return {
    available: true,

    requestAuth(opts) {
      const force = !!opts?.force;
      // The cycle set is its own request with its own key, so asking for it
      // never disturbs (or re-asks) the core set.
      const cycle = opts?.scope === 'cycle';
      // Every other scope resolves to the core set, `scope: 'connect'`
      // included: that scope exists to add the SYMPTOM reads to the connect
      // sheet, and Health Connect has no symptom record. Requesting a record
      // type with no `android.permission.health.*` declared behind it is the
      // documented consent-loop trap (the sheet returns forever), so the
      // widening must never reach this side.
      const reads = cycle ? CYCLE_READ_TYPES : READ_TYPES;
      const writes = cycle ? CYCLE_WRITE_TYPES : WRITE_TYPES;
      return shareAuthRequest(async () => {
        try {
          if (!(await ensureInit())) return false;
          const wanted = [
            ...reads.map((recordType) => ({ accessType: 'read' as const, recordType })),
            ...writes.map((recordType) => ({ accessType: 'write' as const, recordType })),
          ];
          // Everything already granted: never touch the permission activity.
          let have: { accessType?: string; recordType?: string }[] = [];
          try { have = await mod.getGrantedPermissions(); } catch { /* treat as none */ }
          const has = (w: { accessType: string; recordType: string }) =>
            have.some((g) => g.recordType === w.recordType && g.accessType === w.accessType);
          const setKey = cycle
            ? `hc1cycle:${CYCLE_READ_TYPES.join(',')}|${CYCLE_WRITE_TYPES.join(',')}`
            : `hc1:${READ_TYPES.join(',')}|${WRITE_TYPES.join(',')}`;
          // Permissions this build has already proven it cannot obtain (not
          // declared in the manifest, or refused) don't count as "left to ask".
          // Without this, one undeclared type re-opens the sheet forever, no
          // matter how many times the user grants everything on offer.
          const scope = ungrantableScope(setKey);
          const blocked = ungrantable(scope);
          const id = (w: { accessType: string; recordType: string }) => `${w.accessType}:${w.recordType}`;
          const askable = wanted.filter((w) => !blocked.has(id(w)));
          if (askable.every(has)) { markAskedAuth(setKey); return true; }
          // A grant is provably missing (Health Connect, unlike HealthKit, says
          // so), so entry paths ask rather than reading a permission-shaped
          // hole as "nothing recorded".
          //
          // But "missing" is the NORMAL steady state: Health Connect lets the
          // user grant a subset, and the ones they left off (Distance and
          // Exercise, in practice) are missing on every launch forever. This
          // path only paced itself per launch and never consulted the asked-set
          // memory that the iOS path uses (src/lib/health/index.ts), so the
          // whole set was re-requested on EVERY cold start — the user answers,
          // and is asked the same question again next time they open the app.
          // Once we have asked for this exact set, the answer stands: only an
          // explicit Connect press (`force`) or a set that changed because the
          // app shipped a new record type (the key carries the set) asks again.
          if (!force && hasAskedAuth(setKey)) return have.length > 0;
          // Bounded to one prompt per launch besides: two dismissals of the
          // permission activity permanently block it.
          if (!force && promptedThisLaunch()) return have.length > 0;
          markPromptedThisLaunch();
          const granted = await mod.requestPermission(wanted);
          markAskedAuth(setKey);
          // The user has now answered. Anything still missing is not obtainable
          // on this build — remember it, so the next check doesn't reopen the
          // sheet over a permission that can never come back granted.
          try {
            const after = await mod.getGrantedPermissions();
            const stillMissing = wanted
              .filter((w) => !after.some((g) => g.recordType === w.recordType && g.accessType === w.accessType))
              .map(id);
            markUngrantable(scope, stillMissing);
          } catch { /* leave the memory alone; the per-launch cap still holds */ }
          return granted.length > 0;
        } catch { return false; }
      });
    },

    async readAuthStatus(scope) {
      // Health Connect, unlike HealthKit, reports its grants — so an empty
      // workout list here can be blamed accurately instead of guessed at.
      // 'logs' is symptoms and medication doses. Health Connect has a record
      // for neither, so there is nothing to be granted and `denied` is the
      // honest answer — which is also what keeps the two logs reads from
      // running here at all (./updates). Answered BEFORE the init, since
      // nothing about it depends on the platform's state.
      if (scope === 'logs') return 'denied';
      try {
        if (!(await ensureInit())) return 'unknown';
        const granted = await mod.getGrantedPermissions();
        const has = (recordType: string) => granted.some(
          (g) => g.recordType === recordType && g.accessType === 'read',
        );
        const need = scope === 'workouts' ? ['ExerciseSession', 'HeartRate']
          : scope === 'steps' ? ['Steps'] : scope === 'cycle' ? ['MenstruationFlow'] : READ_TYPES;
        return need.every(has) ? 'granted' : 'denied';
      } catch { return 'unknown'; }
    },

    async requestBackgroundRead() {
      // Its own request and never part of requestAuth's set: that set is asked
      // from launch paths, and on a Health Connect too old to know this
      // permission the set could never read as fully granted, which is the
      // re-prompt-forever bug ungrantableScope exists for.
      // NOTE: android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND must be
      // declared in app.json, for the same reason READ_STEPS must.
      try {
        if (!(await ensureInit())) return false;
        const isBg = (g: { recordType?: string }) => g.recordType === 'BackgroundAccessPermission';
        let have: { accessType?: string; recordType?: string }[] = [];
        try { have = await mod.getGrantedPermissions(); } catch { /* treat as none */ }
        if (have.some(isBg)) return true;
        await mod.requestPermission([{ accessType: 'read', recordType: 'BackgroundAccessPermission' }]);
        return (await mod.getGrantedPermissions()).some(isBg);
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

    async readDayLoad(dk) {
      const { from, to: dayEnd } = dayBounds(dk);
      const now = new Date();
      const to = now < dayEnd ? now : dayEnd;

      // The records are read for their SPANS (when the walking happened); the
      // TOTAL comes from the aggregation, which merges the several apps
      // writing steps for the same minutes. Summing the records instead is
      // the double-count `stepTotalFromRecords` describes.
      const [stepRecords, hrRecords, stepAgg] = await Promise.all([
        readAll<StepsRecord>('Steps', from, to),
        readHr(from, to),
        aggregate('Steps', 'COUNT_TOTAL', from, to),
      ]);

      const baseMs = from.getTime();
      const steps = stepAgg != null ? Math.round(stepAgg) : stepTotalFromRecords(stepRecords);
      const stepSpans: { startMin: number; endMin: number }[] = [];
      stepRecords.forEach((r) => {
        const n = Number(r.count);
        if (!Number.isFinite(n) || n <= 0) return;
        const a = Math.floor((new Date(r.startTime).getTime() - baseMs) / 60000);
        const b = Math.ceil((new Date(r.endTime).getTime() - baseMs) / 60000);
        if (Number.isFinite(a) && Number.isFinite(b) && b > a) stepSpans.push({ startMin: a, endMin: b });
      });

      // Flattened the way `nightOf` does it: a Health Connect heart-rate
      // record is a bucket of samples, not one reading.
      // A poisoned day charges nothing from heart rate and says so through the
      // burn's own coverage sentence: `hr: null` is the day the app could not
      // watch, which is a state the budget already draws honestly. There is no
      // aggregate fallback here because the pacing curve is the one thing a
      // scalar cannot stand in for.
      const hr: { t: number; bpm: number }[] = [];
      (hrRecords || []).forEach((r) => {
        (r.samples || []).forEach((sm) => {
          const bpm = Number(sm.beatsPerMinute);
          const t = Math.round((new Date(sm.time).getTime() - baseMs) / 1000);
          if (Number.isFinite(bpm) && bpm > 0 && Number.isFinite(t)) hr.push({ t, bpm });
        });
      });
      hr.sort((a, b) => a.t - b.t);

      return {
        steps: stepRecords.length ? steps : null,
        stepSpans: stepSpans.length ? stepSpans : null,
        standMin: null,
        standByHour: null,
        hr: hr.length ? hr : null,
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

    async readHistory({ fromISO, toISO, onProgress }) {
      const from = new Date(fromISO);
      const to = new Date(toISO);
      const out = emptyHistory();
      const step = (label: string, done = 0, total = 0) => {
        try { onProgress?.({ label, done, total }); } catch { /* progress is advisory */ }
      };
      step('Readings');
      const [rhr, bp] = await Promise.all([
        readAll<RestingHrRecord>('RestingHeartRate', from, to),
        readAll<BpRecord>('BloodPressure', from, to),
      ]);
      const ts = (iso: string, meta?: Metadata) => {
        const d = new Date(iso);
        return { time: hhmm(d), startMs: d.getTime(), ownApp: isOwnRecord(meta), dayKey: keyOf(d) };
      };
      rhr.forEach((r) => out.readings.push({ type: 'restingHr', ...ts(r.time, r.metadata), fields: { hr: String(Math.round(r.beatsPerMinute)), position: 'Laying' } }));
      bp.forEach((r) => out.readings.push({
        type: 'bp', ...ts(r.time, r.metadata),
        fields: { sys: String(Math.round(r.systolic.inMillimetersOfMercury)), dia: String(Math.round(r.diastolic.inMillimetersOfMercury)) },
      }));
      // HRV is deliberately NOT swept. Health Connect exposes no beat-to-beat
      // series, so its RMSSD records are bare numbers — typically a wearable's
      // short passive samples, minutes long at most, which are not comparable to
      // a real seated reading and drag every average when a year of them lands
      // at once. An HRV reading with no qualifying RR behind it is excluded
      // everywhere in the app (src/lib/hrvQuality.ts), so importing these would
      // only write rows that are never shown. Same rule the daily import check
      // has always applied (health/updateSet).

      // Sleep — one range query bucketed into nights (see groupNights), each
      // summarized exactly as its own day's read would have. Every night costs
      // an extra HR query, so they run a few at a time.
      step('Sleep');
      const sessions = await readAll<SleepRecord>('SleepSession', from, to);
      const byNight = new Map<string, SleepRecord[]>();
      for (const s of sessions) {
        const dk = nightKeyOf(new Date(s.endTime));
        if (!dk) continue;                                  // an afternoon nap
        const bucket = byNight.get(dk);
        if (bucket) bucket.push(s); else byNight.set(dk, [s]);
      }
      const nights = [...byNight.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      let doneNights = 0;
      for (const [dayKey, group] of nights) {
        const summary = summarizeSessions(group);
        doneNights++;
        step('Sleep', doneNights, nights.length);
        if (!summary) continue;
        const night = await nightOf(summary);
        if (night.minutesAsleep >= HISTORY_SLEEP_MIN_MIN) out.sleep.push({ ...night, dayKey });
      }

      // Workouts — every exercise session in the range, each with its HR trace.
      step('Workouts');
      const exercises = await readAll<ExerciseRecord>('ExerciseSession', from, to);
      let doneWorkouts = 0;
      for (const s of exercises) {
        const w = await workoutOf(s);
        doneWorkouts++;
        step('Workouts', doneWorkouts, exercises.length);
        if (w) out.workouts.push({ ...w, dayKey: keyOf(new Date(s.startTime)) });
      }
      out.workouts.sort((a, b) => a.startMs - b.startMs);

      // Medications — Health Connect's dose record is still experimental and
      // unexposed (see readMedications), so history has nothing to sweep.
      step('Medications');

      return out;
    },

    // Apple Watch Breathe/ECG sync flow — no Android equivalent (no heartbeat
    // series record type in Health Connect).
    async readHrvSessions() { return []; },

    // Health Connect's medication record type is still experimental and not
    // exposed by react-native-health-connect — wire it here when it ships.
    // Apple Health's medication log (iOS 26) has no Android counterpart yet,
    // so the import's Medications group simply never appears here.
    async readMedications() { return []; },

    // Health Connect has no symptom record types at all — the same reason
    // writeCycleSymptoms below writes nothing. There is nothing to read.
    async readSymptoms() { return []; },

    async readWorkouts(dk) {
      const { from, to } = dayBounds(dk);
      const sessions = await readAll<ExerciseRecord>('ExerciseSession', from, to);
      const out: ImportedWorkout[] = [];
      for (const s of sessions) {
        const w = await workoutOf(s);
        if (w) out.push(w);
      }
      return out.sort((a, b) => a.startMs - b.startMs);
    },

    async readSleep(dk) {
      // Same window strategy as iOS: the night ending on `dk` starts the prior
      // evening; query prev-day 18:00 → this-day 14:00 and stitch the
      // sessions into the night (so a split night is whole and a nap doesn't win).
      const [y, m, d] = dk.split('-').map(Number);
      const from = new Date(y, m - 1, d - 1, NIGHT_START_HOUR, 0, 0);
      const to = new Date(y, m - 1, d, NIGHT_END_HOUR, 0, 0);
      const sessions = await readAll<SleepRecord>('SleepSession', from, to);
      const night = summarizeSessions(sessions);
      return night ? nightOf(night) : null;
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

    async readCycle(fromDk, toDk): Promise<CycleImport> {
      const from = dateAt(fromDk, '00:00');
      const to = dateAt(toDk, '23:59');
      const [flows, periods, spots, bbts] = await Promise.all([
        readAll<FlowRecord>('MenstruationFlow', from, to),
        readAll<PeriodRecord>('MenstruationPeriod', from, to),
        readAll<InstantRecord>('IntermenstrualBleeding', from, to),
        readAll<BbtRecord>('BasalBodyTemperature', from, to),
      ]);
      const rows: CycleImport['flows'] = [];
      const keyFor = (type: string, m: Metadata | undefined, t: string) => `hc:${m?.id || `${type}:${t}`}`;
      for (const r of flows) rows.push({ dk: keyOf(new Date(r.time)), flow: hcFlow(r.flow), key: keyFor('flow', r.metadata, r.time), ownApp: isOwnRecord(r.metadata) });
      for (const r of spots) rows.push({ dk: keyOf(new Date(r.time)), flow: 'spotting', key: keyFor('spot', r.metadata, r.time), ownApp: isOwnRecord(r.metadata) });
      // A period record from an app that logs ranges rather than days: every
      // day it covers is a period day, but a real flow record for a day wins.
      const flowDays = new Set(rows.map((r) => r.dk));
      for (const r of periods) {
        const a = new Date(r.startTime || r.time || '');
        const b = new Date(r.endTime || r.startTime || r.time || '');
        if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) continue;
        for (let d = new Date(a); d <= b && rows.length < 5000; d = new Date(d.getTime() + 86400000)) {
          const dk = keyOf(d);
          if (flowDays.has(dk)) continue;
          rows.push({ dk, flow: 'medium', key: keyFor('period', r.metadata, `${r.startTime || r.time}:${dk}`), ownApp: isOwnRecord(r.metadata) });
        }
      }
      const temps = new Map<string, { dk: string; bbt?: number }>();
      for (const r of bbts) {
        const v = r.temperature?.inCelsius;
        if (!Number.isFinite(v) || v < 30 || v > 43) continue;
        const dk = keyOf(new Date(r.time));
        temps.set(dk, { ...(temps.get(dk) || { dk }), bbt: Math.round(v * 100) / 100 });
      }
      return { flows: heaviestPerDay(rows), temps: [...temps.values()].sort((a, b) => (a.dk < b.dk ? -1 : 1)) };
    },

    // Health Connect has no symptom record types; nothing to write.
    async writeCycleSymptoms() { return false; },

    async writeCycleDay(dk, flow, { replace }) {
      if (!(await ensureInit())) return false;
      const start = dateAt(dk, '00:00');
      const end = new Date(start.getTime() + 24 * 3600 * 1000 - 1000);
      if (replace) {
        if (!mod.deleteRecordsByTimeRange) return false;
        try {
          await mod.deleteRecordsByTimeRange('MenstruationFlow', between(start, end));
          await mod.deleteRecordsByTimeRange('IntermenstrualBleeding', between(start, end));
        } catch (e) { logError('hc.write.cycleDelete', e); return false; }
      }
      if (!flow) return true;
      // Noon, or just now when today is not yet at noon (see cycleRecordTime).
      const when = cycleRecordTime(dk, Date.now()).toISOString();
      return insert([flow === 'spotting'
        ? { recordType: 'IntermenstrualBleeding', time: when }
        : { recordType: 'MenstruationFlow', time: when, flow: HC_FLOW_VALUE[flow] }]);
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
