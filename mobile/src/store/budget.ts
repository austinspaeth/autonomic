/**
 * The pacing budget's shell: the only impure part of the feature.
 *
 * src/lib/budget is pure and reads only what this module has already written.
 * Everything native lives here — the health read, the waveform sidecar write,
 * and the one permission prompt.
 *
 * Two things it is careful about:
 *
 *   THE ALL-DAY HEART-RATE SERIES NEVER REACHES THE JOURNAL. It is read raw,
 *   summarised into a handful of numbers, thinned, and only the thinned curve
 *   goes to the sidecar under `load:<dk>`. A year of per-minute samples in the
 *   persisted blob would be tens of megabytes of MMKV rewritten on every save.
 *
 *   IT NEVER REQUESTS A PERMISSION ON ITS OWN. `refreshDayLoad` reads with
 *   whatever grants exist; the prompt lives in `connectPacingHealth`, which is
 *   only ever called from a tap. Adding read types changed the auth set, and
 *   an extra HealthKit sheet appearing during a background update check is the
 *   exact nag lib/health/askedAuth exists to prevent.
 */
import { AppState as RNAppState } from 'react-native';
import { addDays, todayKey } from '../lib/dates';
import { health } from '../lib/health';
import { logError } from '../lib/diagnostics/errorLog';
import { exertionLine, hrMinutesAbove, stillUprightMinutes, uprightSignature, walkingMinutes } from '../lib/budget';
import { hrMinutesBelow } from '../lib/budget/burn';
import { BASELINE_DAYS, recoveryLine } from '../lib/budget/baseline';
import { thinSeries } from '../lib/sleep/night';
import { loadWaveformId } from '../lib/waveforms';
import { RECOVERY_MIN } from '../lib/budget/upright';
import { noteStepsSeen, stepsEverSeen } from '../lib/budget/stepsMemory';
import { RESTORE_MAX_ATTEMPTS, erasedLoadDays, readHasEvidence, readLosesEvidence } from '../lib/budget/restore';
import { noteRestoreAttempt, restoreAttempts } from '../lib/budget/restoreMemory';
import type { DayLoad, Entry } from '../lib/types';
import { blankDay } from '../lib/migrate';
import { getState, getWaveform, mutate, storeWaveform } from './store';

/** Days scanned for any evidence that steps are reaching us. */
const STEPS_LOOKBACK_DAYS = 7;

/**
 * How stale a read may be before an opportunistic refresh bothers to run.
 *
 * This used to be twenty minutes, which is how the strip could sit on a figure
 * from before lunch while the user watched it. The read is one health query
 * per call and the whole point of the bar is that it tracks the day, so the
 * ceiling on staleness is now the tick below rather than a third of an hour.
 */
export const LOAD_STALE_MIN = 5;

/**
 * The gate a FOREGROUND uses: opening the app, or waking the screen on it.
 *
 * Not zero. Several things fire together on a return to the app (the AppState
 * change, the Journal tab regaining focus, a pull-to-refresh a moment later)
 * and one read between them is the honest answer to all three; a forced read
 * per event would run the same query three times in a second.
 */
export const LOAD_FOCUS_STALE_MIN = 0.5;

/** How often the day is re-read while the app is open and being looked at. */
export const LOAD_TICK_MS = 3 * 60_000;
/** Points kept in the sidecar curve, matching the night series. */
const CURVE_MAX = 400;

let inFlight: Promise<void> | null = null;

const num = (v: unknown): number | null => {
  const n = parseFloat(v as string);
  return isNaN(n) ? null : n;
};

const minutesOf = (hhmm: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  return isNaN(h) || isNaN(mi) ? null : h * 60 + mi;
};

/**
 * Windows the standing-still inference must not count.
 *
 * Sleep, every logged activity plus its recovery tail, and live captures. The
 * recovery tail matters most: heart rate after a workout sits squarely in the
 * standing band for half an hour, and counting it would charge every workout
 * twice and call the sofa afterwards "upright".
 */
function excludedWindows(dk: string): { startMin: number; endMin: number }[] {
  const day = getState().days[dk];
  if (!day) return [];
  const out: { startMin: number; endMin: number }[] = [];

  const wake = minutesOf(day.sleep?.wake);
  if (wake != null && wake > 0) out.push({ startMin: 0, endMin: wake });
  const bed = minutesOf(day.sleep?.bed);
  if (bed != null && bed > 12 * 60) out.push({ startMin: bed, endMin: 1440 });

  (day.activities || []).forEach((a: Entry) => {
    const start = minutesOf(a.time);
    if (start == null) return;
    const dur = num(a.duration) ?? 20;
    out.push({ startMin: start, endMin: start + dur + RECOVERY_MIN });
  });
  (day.readings || []).forEach((r: Entry) => {
    if (r.type !== 'hrv' && r.type !== 'breathHrv' && r.type !== 'standTest') return;
    const start = minutesOf(r.time);
    if (start == null) return;
    const dur = num(r.durationSec) != null ? num(r.durationSec)! / 60 : 10;
    out.push({ startMin: start, endMin: start + dur + 5 });
  });
  return out;
}

/**
 * Read today's passive load and write it into the journal.
 *
 * Silent on every failure: being offline, unpaired, or unauthorised is a
 * phone's normal state, and the budget degrades to "logged activities only"
 * rather than showing an error. It logs, because a health read that stops
 * working is otherwise invisible (the app has no other symptom for it).
 */
export async function refreshDayLoad(
  dk: string = todayKey(),
  opts: { force?: boolean; maxAgeMin?: number; requireEvidence?: boolean } = {},
): Promise<void> {
  // A FORCED refresh waits for whatever is running and then runs anyway. It
  // used to return the in-flight promise, which is how "I just granted steps"
  // could resolve into a background check that had already decided the data
  // was fresh enough to skip — so the grant landed and nothing re-read.
  if (inFlight) {
    if (!opts.force) return inFlight;
    try { await inFlight; } catch { /* its own logging */ }
  }
  const run = async () => {
    try {
      const state = getState();
      if (!state.settings?.healthEnabled) return;
      const api = health();
      if (!api.available) return;

      const existing = state.days[dk]?.load;
      if (!opts.force && existing?.readAt) {
        const age = (Date.now() - new Date(existing.readAt).getTime()) / 60000;
        if (Number.isFinite(age) && age < (opts.maxAgeMin ?? LOAD_STALE_MIN)) return;
      }

      const read = await api.readDayLoad(dk);

      // A read that lost a source the record already holds FAILED (a locked
      // phone reads HealthKit as empty); writing it would seal the day as a
      // quiet one. The record stands, and an unsealed day is retried later.
      if (readLosesEvidence(read, getState().days[dk]?.load)) return;
      // Reading a past day back must not create a record out of nothing.
      if (opts.requireEvidence && !readHasEvidence(read)) return;

      const lineBpm = exertionLine(state.days, dk, {}, addDays);
      const above = hrMinutesAbove(read.hr, lineBpm);
      // Recovery is measured over the WAKING day only: the same excluded
      // windows the upright inference uses already carve out the night.
      const excluded = excludedWindows(dk);
      const settled = hrMinutesBelow(read.hr, recoveryLine(state.days, dk, {}, addDays), excluded);
      const sig = uprightSignature(state.days, dk, {}, addDays);
      const still = stillUprightMinutes(read.hr, read.stepSpans, sig, excluded, lineBpm);
      const walkMin = walkingMinutes(read.stepSpans);

      const walkSpans = (read.stepSpans || []).map((s) => ({ ...s, kind: 'walk' as const }));
      const spans = [...walkSpans, ...(still?.spans || [])].sort((a, b) => a.startMin - b.startMin);

      const next: DayLoad = {
        steps: read.steps,
        walkingMin: walkMin,
        standMin: read.standMin,
        stillUprightMin: still ? still.stillMin : null,
        uprightSpans: spans.length ? spans.slice(0, 60) : null,
        hrAboveMin: above ? above.aboveMin : null,
        hrBands: above ? above.bands : null,
        hrBelowMin: settled,
        hrCoverageMin: above ? above.coverageMin : null,
        hrStretches: above ? above.stretches : null,
        longestStretch: above?.longest ?? null,
        peakBpm: above?.peak ?? null,
        lineBpm,
        readAt: new Date().toISOString(),
      };

      // A step count that landed is proof the permission works, and the proof
      // outlives this journal: the ask must never come back for somebody who
      // already answered it.
      if (read.steps != null) noteStepsSeen();

      // The curve goes to the sidecar BEFORE the journal write, the same order
      // storeWaveform requires everywhere else: an entry that references a
      // curve which is not there yet is a reading with a missing trace.
      if (read.hr && read.hr.length) {
        storeWaveform(loadWaveformId(dk), { sampledHr: thinSeries(read.hr.map((p) => ({ t: p.t, bpm: p.bpm })), CURVE_MAX) });
      }

      // ensureDay, not a guard: a user who has logged nothing today still has
      // steps worth reading, and that is exactly the day the passive floor is
      // for. An otherwise-empty day record is inert — `dayHasOwnData` does not
      // look at `load`, so this cannot retire the demo month.
      mutate((s) => {
        if (!s.days[dk]) s.days[dk] = blankDay();
        s.days[dk].load = next;
      });
    } catch (e) {
      logError('budget.load', e);
    }
  };
  inFlight = run().finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Close out yesterday.
 *
 * The budget reads TODAY, so a day's stored load is only ever as complete as
 * the last moment the app was open on it. Someone who checks the app at eight
 * and then puts the phone down has a record that stops at eight: the evening
 * is simply missing from it, and the next morning the strip reports that day
 * as cheaper than it was — which then feeds the ceiling medians, the accuracy
 * strip and every comparison the Progress card draws.
 *
 * So on launch and on a foreground, the previous day is read ONE last time,
 * for its whole length, and then never again: `readAt` past the day's own end
 * is the seal. It is one query, it happens once per day, and it is the only
 * place the shell reads a day other than today.
 */
export async function sealYesterday(dk: string = todayKey()): Promise<void> {
  try {
    const yk = addDays(dk, -1);
    const state = getState();
    if (!state.settings?.healthEnabled || !health().available) return;
    const load = state.days[yk]?.load;
    // Nothing was ever read for that day, so there is nothing to complete: the
    // app was not running, and a read now would invent a record for a day it
    // never watched. `dayIsKnown` treats that as unknown on purpose.
    if (!load?.readAt) return;
    const endMs = new Date(`${yk}T23:59:59`).getTime();
    if (!Number.isFinite(endMs)) return;
    const readMs = new Date(load.readAt).getTime();
    if (!Number.isFinite(readMs) || readMs >= endMs) return;
    await refreshDayLoad(yk, { force: true });
  } catch (e) {
    logError('budget.seal', e);
  }
}

let restoreTried = false;

/**
 * Read back the days a migrator erased (see lib/budget/restore).
 *
 * Runs at most once per launch, only in the foreground (a background launch on
 * a locked iPhone reads nothing, and that would spend an attempt), and gives up
 * after RESTORE_MAX_ATTEMPTS launches. Each day goes through the ordinary read,
 * so it is priced against that day's own exertion line exactly as a live read
 * would have been; a day the health store has nothing for stays unknown.
 */
export async function restoreErasedDays(dk: string = todayKey()): Promise<void> {
  if (restoreTried) return;
  try {
    const state = getState();
    if (!state.settings?.healthEnabled || !health().available) return;
    // Skip only a launch KNOWN to be in the background: a cold start in the
    // foreground can still report 'unknown' here, and that is the launch the
    // user is waiting on.
    if (RNAppState.currentState === 'background') return;
    const todo = erasedLoadDays(state.days, dk, addDays, stepsEverSeen());
    if (!todo.length || restoreAttempts() >= RESTORE_MAX_ATTEMPTS) return;
    restoreTried = true;
    noteRestoreAttempt();
    for (const k of todo) {
      if (RNAppState.currentState === 'background') break;
      await refreshDayLoad(k, { force: true, requireEvidence: true });
    }
  } catch (e) {
    logError('budget.restore', e);
  }
}

/**
 * Are we getting this user's steps?
 *
 * Answered from what actually LANDED rather than from a permission API, and
 * deliberately so: on iOS `readAuthStatus` cannot distinguish granted from
 * denied once a type is determined, so it would answer "unknown" forever. The
 * observable fact is the useful one — a read ran today and brought back no step
 * count — and it is also the one the user can act on.
 *
 * False (nothing missing) until a read has actually happened, so the mark never
 * appears on a launch that has not looked yet.
 */
export function stepsMissing(dk: string = todayKey()): boolean {
  const state = getState();
  if (!health().available) return false;
  // Steps have reached this install before, so whatever today looks like, the
  // permission is not the problem and the mark would be an accusation.
  if (stepsEverSeen()) return false;
  if (!state.settings?.healthEnabled) return true;
  // Look back a week, not just at today. Two things go wrong with reading only
  // today: a step count that has not landed YET (the read right after a grant
  // can beat the grant) reads as denied, and so does a genuinely stepless day,
  // since the health store returns nothing rather than zero. One day in the
  // last week carrying a count is proof the permission works.
  for (let i = 0; i < STEPS_LOOKBACK_DAYS; i++) {
    if (state.days[addDays(dk, -i)]?.load?.steps != null) return false;
  }
  // Nothing yet, and nothing has even been read: too early to accuse anything.
  return !!state.days[dk]?.load?.readAt;
}

/**
 * Connect the step and stand reads. The ONLY place this feature prompts, and
 * it is reached from a tap: the strip's "Todo: Connect steps" or the sheet's
 * Connect row.
 */
export async function connectPacingHealth(): Promise<boolean> {
  try {
    const api = health();
    if (!api.available) return false;
    const ok = await api.requestAuth({ force: true, scope: 'steps' });
    // Twice, a moment apart. HealthKit can report the grant before it will
    // actually answer a query with it, and the first read then comes back
    // empty — which is exactly the state that keeps the Todo on screen.
    await refreshDayLoad(todayKey(), { force: true });
    if (stepsMissing()) {
      await new Promise((r) => setTimeout(r, 1200));
      await refreshDayLoad(todayKey(), { force: true });
    }
    return ok;
  } catch (e) {
    logError('budget.connect', e);
    return false;
  }
}

/**
 * Re-price the days that were read before intensity bands existed.
 *
 * A finished day cannot be read again — the health store will answer, but the
 * budget only ever reads today — so without this every day already in the
 * journal would stay charged flat while new ones were graded, and the ceiling
 * medians the two together. The curve is still there: `refreshDayLoad` puts a
 * thinned copy in the sidecar under `load:<dk>`, ~2.5 minutes a point, which
 * is finer than HR_GAP_MIN and so integrates to the same answer.
 *
 * A day whose curve is gone is stamped with an EMPTY band set rather than left
 * alone: absent means "never looked" and would be rescanned on every launch,
 * and it must keep reading as unknown intensity in `buildBurn` either way.
 * Silent and best-effort — this is a repair, not a feature.
 */
export function backfillHrBands(dk: string = todayKey()): void {
  try {
    const state = getState();
    const todo: { k: string; bands: number[] }[] = [];
    for (let i = 0; i <= BASELINE_DAYS; i++) {
      const k = addDays(dk, -i);
      const l = state.days[k]?.load;
      if (!l || l.hrBands != null || l.hrAboveMin == null || l.lineBpm == null) continue;
      const hr = getWaveform(loadWaveformId(k))?.sampledHr;
      const above = hrMinutesAbove(hr, l.lineBpm);
      todo.push({ k, bands: above ? above.bands : [] });
    }
    if (!todo.length) return;
    mutate((st) => {
      todo.forEach(({ k, bands }) => {
        const l = st.days[k]?.load;
        if (l) l.hrBands = bands;
      });
    });
  } catch (e) {
    logError('budget.bands', e);
  }
}

/**
 * Launch, foreground and a slow tick while the app is open. Today, plus the
 * one closing read of yesterday (see `sealYesterday`).
 *
 * The tick exists because the strip is the one thing in the Outlook card that
 * moves on its own. Minutes above the line accrue while the phone is in a
 * pocket, and a bar that only caught up on a cold start meant the figure a user
 * checked at four o'clock was the figure from whenever they last relaunched.
 * It runs only while the app is ACTIVE — a timer against the health store from
 * the background would be a read nobody is looking at.
 */
export function initBudgetSync(): () => void {
  backfillHrBands();
  void refreshDayLoad(undefined, { maxAgeMin: LOAD_FOCUS_STALE_MIN }).then(() => sealYesterday()).then(() => restoreErasedDays());

  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const start = () => {
    stop();
    timer = setInterval(() => { void refreshDayLoad(); }, LOAD_TICK_MS);
  };
  start();

  const sub = RNAppState.addEventListener('change', (st) => {
    if (st === 'active') {
      void refreshDayLoad(undefined, { maxAgeMin: LOAD_FOCUS_STALE_MIN }).then(() => sealYesterday()).then(() => restoreErasedDays());
      start();
    } else {
      stop();
    }
  });
  return () => { stop(); sub.remove(); };
}

/**
 * The day the user is looking at, re-read now.
 *
 * Called from the Journal's own focus, which is a stronger signal than the
 * AppState change: switching back from Progress does not foreground anything.
 * Shares the foreground gate, so arriving on the tab a second after a launch
 * is not a second query.
 */
export function refreshDayLoadOnFocus(): void {
  void refreshDayLoad(undefined, { maxAgeMin: LOAD_FOCUS_STALE_MIN });
}
