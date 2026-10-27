/**
 * What a metric does across this person's cycle. Pure, over a built model.
 *
 * Two questions, both answered only from the user's OWN finished cycles and
 * never from a textbook:
 *
 *  1. `phaseProfile` — the median of a metric in each phase ("RMSSD runs lower
 *     in your luteal phase"). Descriptive, like Best vs hardest weeks: it says
 *     where the numbers sat, never why.
 *
 *  2. `cycleDip` — is the slide in front of me the one this person has before
 *     every period, or more than that? This is what keeps the downturn card
 *     from raising the same alarm once a month, and its bias is deliberate:
 *     it can only say "typical" when the current drop is NO DEEPER than the
 *     deepest drop the same window has shown in the last cycles (plus a small
 *     tolerance). A slide past that is reported as deeper than usual, which
 *     is louder, not quieter. It never suppresses anything; the downturn and
 *     its notification fire exactly as before, and only their words change.
 *
 * Both need `PATTERN_MIN_CYCLES` finished cycles that actually hold data in
 * the windows compared. Two cycles is an anecdote.
 */
import { dayDiff, shiftDay } from './periods';
import { PATTERN_MIN_CYCLES, type CycleModel, type CyclePhase } from './model';

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const PROFILE_PHASES: CyclePhase[] = ['menstrual', 'follicular', 'ovulatory', 'luteal', 'premenstrual'];

export interface PhaseStat { median: number | null; n: number; cycles: number }

/** Values per day → their median per phase, over finished cycles only (a
 *  forecast phase never feeds a pattern). */
export function phaseProfile(model: CycleModel, value: (dk: string) => number | null): Record<CyclePhase, PhaseStat> {
  const acc: Record<CyclePhase, { xs: number[]; cyc: Set<string> }> = {
    menstrual: { xs: [], cyc: new Set() }, follicular: { xs: [], cyc: new Set() },
    ovulatory: { xs: [], cyc: new Set() }, luteal: { xs: [], cyc: new Set() },
    premenstrual: { xs: [], cyc: new Set() },
  };
  for (const c of model.cycles) {
    if (!c.next || !c.plausible) continue;
    for (let dk = c.start; dk < c.next; dk = shiftDay(dk, 1)) {
      const ph = model.phaseOn(dk);
      if (!ph?.phase || ph.predicted) continue;
      const v = value(dk);
      if (v == null || !Number.isFinite(v)) continue;
      acc[ph.phase].xs.push(v);
      acc[ph.phase].cyc.add(c.start);
    }
  }
  const out = {} as Record<CyclePhase, PhaseStat>;
  for (const ph of PROFILE_PHASES) out[ph] = { median: median(acc[ph].xs), n: acc[ph].xs.length, cycles: acc[ph].cyc.size };
  return out;
}

/** Scored days needed in each window of a cycle before its dip counts. */
export const DIP_MIN_DAYS = 3;
/** Points of slack before a drop reads as deeper than usual. One reading's
 *  noise; anything bigger is a real difference. */
export const DIP_TOLERANCE = 3;
/** The dip window: the premenstrual days and the first days of the period,
 *  as offsets from day 1 of the period that ends it. */
export const DIP_WINDOW = { from: -5, to: 2 };

export interface CycleDip {
  verdict: 'typical' | 'deeper';
  /** Points the current window sits under its cycle's follicular median. */
  drop: number;
  /** The median and the deepest of the same drop in past cycles. */
  usualDrop: number;
  deepestDrop: number;
  /** Past cycles compared. */
  cycles: number;
  /** Where today sits. */
  phase: CyclePhase;
}

/**
 * Today against the same window in past cycles. Null unless today is inside a
 * dip window (premenstrual or the first period days), the model has a pattern,
 * and enough past cycles carry scores in both windows.
 */
export function cycleDip(model: CycleModel, dk: string, score: (dk: string) => number | null): CycleDip | null {
  if (!model.patternReady) return null;
  const ph = model.phaseOn(dk);
  if (!ph?.phase || (ph.phase !== 'premenstrual' && ph.phase !== 'menstrual')) return null;

  // The period this window belongs to: the one that started this cycle when
  // we are IN the period, or the coming one when we are before it.
  let anchor: string | null;
  if (ph.phase === 'menstrual') anchor = ph.cycleStart;
  else anchor = model.prediction?.start ?? null;
  if (!anchor) return null;
  const off = dayDiff(anchor, dk);
  if (off < DIP_WINDOW.from || off > DIP_WINDOW.to) return null;

  // The follicular median the drop is measured from: the cycle BEFORE the
  // anchor period (for a premenstrual today that is the cycle in progress).
  const prevCycle = [...model.cycles].reverse().find((c) => c.start < anchor! && c.plausible);
  if (!prevCycle) return null;
  const base = follicularMedian(model, prevCycle.start, anchor, score);
  if (base == null) return null;
  // Today's window so far: from the window's start through dk.
  const now: number[] = [];
  for (let d = shiftDay(anchor, DIP_WINDOW.from); d <= dk; d = shiftDay(d, 1)) {
    const s = score(d);
    if (s != null) now.push(s);
  }
  if (!now.length) return null;
  const drop = base - (median(now) as number);

  // The same measurement in each finished past cycle, over the same offsets.
  const past: number[] = [];
  for (let i = 1; i < model.cycles.length; i++) {
    const c = model.cycles[i];
    const before = model.cycles[i - 1];
    if (c.start >= anchor || !before.plausible || !before.next) continue;
    const b = follicularMedian(model, before.start, c.start, score);
    if (b == null) continue;
    const win: number[] = [];
    for (let d = shiftDay(c.start, DIP_WINDOW.from); d <= shiftDay(c.start, off); d = shiftDay(d, 1)) {
      const s = score(d);
      if (s != null) win.push(s);
    }
    if (win.length < Math.min(DIP_MIN_DAYS, off - DIP_WINDOW.from + 1)) continue;
    past.push(b - (median(win) as number));
  }
  if (past.length < PATTERN_MIN_CYCLES) return null;
  const deepest = Math.max(...past);
  return {
    verdict: drop <= deepest + DIP_TOLERANCE ? 'typical' : 'deeper',
    drop: Math.round(drop),
    usualDrop: Math.round(median(past) as number),
    deepestDrop: Math.round(deepest),
    cycles: past.length,
    phase: ph.phase,
  };
}

function follicularMedian(model: CycleModel, start: string, end: string, score: (dk: string) => number | null): number | null {
  const xs: number[] = [];
  for (let d = start; d < end; d = shiftDay(d, 1)) {
    const ph = model.phaseOn(d);
    if (ph?.phase !== 'follicular' && ph?.phase !== 'ovulatory') continue;
    const s = score(d);
    if (s != null) xs.push(s);
  }
  return xs.length >= DIP_MIN_DAYS ? median(xs) : null;
}

/** The longest cycle day the aligned chart draws. Past it, a long cycle's tail
 *  would stretch every other line into the left third of the chart. */
export const ALIGNED_MAX_DAY = 35;
/** Past cycles the aligned chart overlays. */
export const ALIGNED_CYCLES = 6;

export interface AlignedCycles {
  /** Cycle days 1..length. */
  length: number;
  /** Each recent FINISHED cycle's value per cycle day, oldest first. */
  past: (number | null)[][];
  /** The cycle in progress, through today. Null when there is none. */
  current: (number | null)[] | null;
  /** Per cycle day, the median across `past` (needs two cycles with a value). */
  median: (number | null)[];
  /** Today's cycle day, when today is inside the cycle in progress. */
  todayDay: number | null;
}

/**
 * A metric laid out by CYCLE DAY instead of by date, so the same point in
 * every cycle lines up: the chart that shows a woman her HRV falling at the
 * same place each month. Implausible cycles (a logging gap) are left out.
 */
export function alignByCycleDay(model: CycleModel, value: (dk: string) => number | null): AlignedCycles {
  const finished = model.cycles.filter((c) => c.next && c.plausible).slice(-ALIGNED_CYCLES);
  const open = model.cycles.length && !model.cycles[model.cycles.length - 1].next ? model.cycles[model.cycles.length - 1] : null;
  const longest = Math.max(0, ...finished.map((c) => c.length as number));
  const todayDay = open ? dayDiff(open.start, model.today) + 1 : null;
  const length = Math.min(ALIGNED_MAX_DAY, Math.max(longest, todayDay ?? 0, 21));
  const row = (start: string, days: number) => Array.from({ length }, (_, i) => (i < days ? value(shiftDay(start, i)) : null));
  const past = finished.map((c) => row(c.start, c.length as number));
  const current = open && todayDay != null && todayDay <= length ? row(open.start, todayDay) : null;
  const median = Array.from({ length }, (_, i) => {
    const xs = past.map((r) => r[i]).filter((v): v is number => v != null && Number.isFinite(v));
    if (xs.length < 2) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  });
  return { length, past, current, median, todayDay: current ? todayDay : null };
}

/* ---------- the Cycle impact charts ---------- */

/** Past cycles the "Score by cycle day" chart draws. */
export const IMPACT_CYCLES = 3;
/** The usual dip: the last this-many days of a cycle (cycle-day coordinates). */
export const DIP_SPAN_DAYS = 9;

export interface UsualDip {
  /** Cycle days the box spans, against the median cycle length. */
  fromDay: number;
  toDay: number;
  /** The value range the box covers. */
  low: number;
  high: number;
  /** Median of each past cycle's drop (follicular median minus its window's median). */
  usualDrop: number;
  cycles: number;
  /** The same drop in the cycle in progress so far, when today is in the window. */
  currentDrop: number | null;
}

const medianOf = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function folMedian(model: CycleModel, start: string, end: string, value: (dk: string) => number | null): number | null {
  const xs: number[] = [];
  for (let d = start; d < end; d = shiftDay(d, 1)) {
    const ph = model.phaseOn(d)?.phase;
    if (ph !== 'follicular' && ph !== 'ovulatory') continue;
    const v = value(d);
    if (v != null && Number.isFinite(v)) xs.push(v);
  }
  return xs.length >= DIP_MIN_DAYS ? medianOf(xs) : null;
}

/**
 * Where a metric usually dips before a period, from the last `IMPACT_CYCLES`
 * finished cycles: the last `DIP_SPAN_DAYS` of each cycle against that cycle's
 * own follicular median. Needs two cycles with data in both windows; a single
 * cycle is an anecdote, not a usual.
 */
export function usualDip(model: CycleModel, value: (dk: string) => number | null): UsualDip | null {
  const done = model.cycles.filter((c) => c.next && c.plausible).slice(-IMPACT_CYCLES);
  const drops: number[] = [];
  const winMedians: number[] = [];
  for (const c of done) {
    const len = c.length as number;
    const base = folMedian(model, c.start, c.next!, value);
    if (base == null) continue;
    const win: number[] = [];
    for (let i = len - DIP_SPAN_DAYS; i < len; i++) {
      const v = value(shiftDay(c.start, i));
      if (v != null && Number.isFinite(v)) win.push(v);
    }
    if (win.length < DIP_MIN_DAYS) continue;
    const wm = medianOf(win) as number;
    drops.push(base - wm);
    winMedians.push(wm);
  }
  if (drops.length < 2) return null;
  const lens = done.map((c) => c.length as number).sort((a, b) => a - b);
  const L = lens[Math.floor(lens.length / 2)];
  const pad = 4;

  // This cycle so far, once today has entered the window.
  let currentDrop: number | null = null;
  const open = model.cycles[model.cycles.length - 1];
  if (open && !open.next) {
    const day = dayDiff(open.start, model.today) + 1;
    if (day > L - DIP_SPAN_DAYS) {
      const base = folMedian(model, open.start, model.today, value);
      const win: number[] = [];
      for (let i = L - DIP_SPAN_DAYS; i < day; i++) {
        const v = value(shiftDay(open.start, i));
        if (v != null && Number.isFinite(v)) win.push(v);
      }
      if (base != null && win.length) currentDrop = base - (medianOf(win) as number);
    }
  }
  return {
    fromDay: L - DIP_SPAN_DAYS + 1, toDay: L,
    low: Math.min(...winMedians) - pad, high: Math.max(...winMedians) + pad,
    usualDrop: medianOf(drops) as number, cycles: drops.length, currentDrop,
  };
}

/** The four columns the "by phase" chart draws. Premenstrual days are part of
 *  luteal here: the chart is about the four phases people know by name. */
export const CHART_PHASES: { phase: CyclePhase; label: string; members: CyclePhase[] }[] = [
  { phase: 'menstrual', label: 'Period', members: ['menstrual'] },
  { phase: 'follicular', label: 'Follicular', members: ['follicular'] },
  { phase: 'ovulatory', label: 'Ovulation', members: ['ovulatory'] },
  { phase: 'luteal', label: 'Luteal', members: ['luteal', 'premenstrual'] },
];

export interface PhaseColumn { phase: CyclePhase; label: string; perCycle: number[]; median: number | null }

/** One dot per finished cycle (that cycle's median in the phase), and the
 *  median of those dots. Forecast phases never count. */
export function phaseColumns(model: CycleModel, value: (dk: string) => number | null, maxCycles = 6): PhaseColumn[] {
  const done = model.cycles.filter((c) => c.next && c.plausible).slice(-maxCycles);
  return CHART_PHASES.map(({ phase, label, members }) => {
    const want = new Set(members);
    const perCycle: number[] = [];
    for (const c of done) {
      const xs: number[] = [];
      for (let d = c.start; d < c.next!; d = shiftDay(d, 1)) {
        const ph = model.phaseOn(d);
        if (!ph?.phase || ph.predicted || !want.has(ph.phase)) continue;
        const v = value(d);
        if (v != null && Number.isFinite(v)) xs.push(v);
      }
      const m = medianOf(xs);
      if (m != null) perCycle.push(m);
    }
    return { phase, label, perCycle, median: medianOf(perCycle) };
  });
}
