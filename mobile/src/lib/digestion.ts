/**
 * Bowel movements as DATA: what each one was, what each day was, and which days
 * the app knows anything about at all.
 *
 * Gut motility is autonomic. Slow transit (hard stools, straining, days without
 * going) and the fast end (loose stools, diarrhea) are both common in this
 * population, and both move with everything else the app measures. Until this
 * existed the whole entry was reduced to a COUNT, which is the least useful thing
 * in it: one hard, severely strained movement sat in the healthy 1-2 a day band,
 * and a slide into constipation read as "no change" as long as the person still
 * went once a day. The form and the effort are the signal.
 *
 * THE HARD PART IS THE ZERO. A day with no movement logged is either a day
 * without one or a day nobody wrote it down, and every metric built on bowel
 * movements is built mostly on zeros. So a zero is INFERRED, and only where the
 * journal earns it (`isTrackedDay`):
 *
 * 1. Somebody who has never logged a movement is not tracking them, and every
 *    one of their days is unknown. They are never read as constipated.
 * 2. Before the first movement ever logged, days are unknown: the same "months
 *    before you started logging are not supplement-free days" rule
 *    ../insights/factors applies to everything else.
 * 3. A day with no movement counts as a zero only when the user logged SOMETHING
 *    ELSE that day (../engaged). An untouched day is silent about everything.
 * 4. A silence longer than `MAX_SILENCE_DAYS` between two logged movements, or
 *    after the last one, reads as having stopped logging them rather than as a
 *    week without going, and the whole stretch is unknown. Real constipation
 *    that long exists and this under-reports it; that is the direction to be
 *    wrong in, since the alternative tells everybody who drifts away from the
 *    feature that their gut has stopped. It also means a trailing silence is
 *    counted while it is short and withdrawn once it passes the bar.
 *
 * Nothing here feeds the daily score, deliberately: the score is built from
 * measurements, not from what somebody chose to log, and a gut term there would
 * cost the users who log honestly and spare the ones who log nothing.
 *
 * Pure: no store, no native, no React.
 */
import type { DayRecord, Movement, ScoreCat } from './types';
import { isEngagedDay } from './engaged';

type DaysMap = Record<string, DayRecord>;

/* ---------- one movement ---------- */

/** The four forms the log offers (`BM_KINDS` in ./registry), by Bristol range. */
export type StoolForm = 'hard' | 'formed' | 'loose' | 'diarrhea';

/** Display order: the healthy form first, then the two ends. */
export const STOOL_FORMS: StoolForm[] = ['formed', 'loose', 'hard', 'diarrhea'];

export const FORM_LABEL: Record<StoolForm, string> = {
  hard: 'Hard', formed: 'Formed', loose: 'Loose', diarrhea: 'Diarrhea',
};

/**
 * The grade each form wears. These are the colours the log form's own glyphs
 * already draw (`KindGlyph` in features/drawers), so a Progress bar and the card
 * the user tapped to log it cannot disagree about what "hard" looks like.
 */
export const FORM_CAT: Record<StoolForm, ScoreCat> = {
  formed: 'good', hard: 'ok', loose: 'bad', diarrhea: 'crash',
};

/** Midpoint of each form's Bristol range: Hard 1-2, Formed 3-4, Loose 5-6, Diarrhea 7. */
const FORM_BRISTOL: Record<StoolForm, number> = { hard: 1.5, formed: 3.5, loose: 5.5, diarrhea: 7 };

const formOfType = (n: number): StoolForm => (n <= 2 ? 'hard' : n <= 4 ? 'formed' : n <= 6 ? 'loose' : 'diarrhea');

/** A Bristol type written into the kind ("Type 6", "Bristol 2"), from older
 *  journals and the web app's exports. */
function bristolNumber(kind: string): number | null {
  const m = /(?:type|bristol)\s*([1-7])\b/i.exec(kind);
  return m ? +m[1] : null;
}

/** What form a movement was, or null when it was logged without one. */
export function stoolForm(m: Movement): StoolForm | null {
  const kind = (m.kind || '').trim();
  if (!kind) return null;
  const n = bristolNumber(kind);
  if (n != null) return formOfType(n);
  const k = kind.toLowerCase();
  return k === 'hard' || k === 'formed' || k === 'loose' || k === 'diarrhea' ? k : null;
}

/** A movement on the Bristol scale: its exact type when one was recorded, the
 *  midpoint of its form's range otherwise, null when no form was logged. */
export function bristolOf(m: Movement): number | null {
  const n = m.kind ? bristolNumber(m.kind) : null;
  if (n != null) return n;
  const f = stoolForm(m);
  return f ? FORM_BRISTOL[f] : null;
}

/** 0 none, 1 mild, 2 severe. Legacy entries stored a bare boolean, read as mild. */
export function strainLevel(m: Movement): 0 | 1 | 2 {
  if (m.straining === 'severe') return 2;
  return m.straining ? 1 : 0;
}

/* ---------- which days are known ---------- */

/** The longest silence read as days without going rather than days not logged. */
export const MAX_SILENCE_DAYS = 7;

/** From this many days without a movement the day counts as a SLOW one — past
 *  the three-a-week floor of the usual 3-a-day to 3-a-week range. */
export const SLOW_GAP_DAYS = 3;

const movementsOf = (d: DayRecord | undefined): Movement[] => (d && d.digestion && d.digestion.movements) || [];

/** Day keys are ISO dates, so a UTC day number is exact and DST-proof. */
const dayNum = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86400000;

interface Tracking {
  /** Days with no movement that nonetheless count as a known zero, each with
   *  the calendar days since the movement before it. */
  zeros: Map<string, number>;
  /** Every day holding a movement, sorted. */
  movementDays: string[];
}

/**
 * Memoized on the `days` identity, which `save()` replaces whenever a day is
 * touched — so a metric extractor asking about 180 days pays for one pass, and a
 * new entry can never read a stale answer.
 */
const memo = new WeakMap<DaysMap, Tracking>();

function tracking(days: DaysMap): Tracking {
  const hit = memo.get(days);
  if (hit) return hit;
  const keys = Object.keys(days).sort();
  const movementDays = keys.filter((k) => movementsOf(days[k]).length > 0);
  const zeros = new Map<string, number>();
  const markBetween = (from: string, to: string) => {
    // Engaged days strictly after `from`, up to and including `to`.
    for (const k of keys) {
      if (k <= from) continue;
      if (k > to) break;
      if (!movementsOf(days[k]).length && isEngagedDay(days[k])) zeros.set(k, dayNum(k) - dayNum(from));
    }
  };
  for (let i = 1; i < movementDays.length; i++) {
    const a = movementDays[i - 1], b = movementDays[i];
    if (dayNum(b) - dayNum(a) - 1 <= MAX_SILENCE_DAYS) markBetween(a, b);
  }
  // The trailing silence, measured to the last day the journal was kept.
  const last = movementDays[movementDays.length - 1];
  if (last) {
    let lastEngaged = '';
    for (let i = keys.length - 1; i >= 0; i--) if (isEngagedDay(days[keys[i]])) { lastEngaged = keys[i]; break; }
    if (lastEngaged > last && dayNum(lastEngaged) - dayNum(last) <= MAX_SILENCE_DAYS) markBetween(last, lastEngaged);
  }
  const out = { zeros, movementDays };
  memo.set(days, out);
  return out;
}

/** Does this day say anything about bowel movements — a movement, or a zero the
 *  journal has earned (see the module header)? */
export function isTrackedDay(days: DaysMap, dk: string): boolean {
  return movementsOf(days[dk]).length > 0 || tracking(days).zeros.has(dk);
}

/** Has this person ever logged a bowel movement? */
export function tracksDigestion(days: DaysMap): boolean {
  return tracking(days).movementDays.length > 0;
}

/* ---------- one day ---------- */

/**
 * What the day was, most telling first: `loose` when anything was loose or
 * diarrhea (fluid and salt loss is what the rest of the app feels), `hard` when
 * anything was hard or severely strained, `normal` for the rest, and `none` for
 * a known day without one. A day holding both ends reads as loose, because that
 * is the half with a next-day cost.
 */
export type GutGrade = 'loose' | 'hard' | 'normal' | 'none';

export interface GutDay {
  grade: GutGrade;
  count: number;
  /** Calendar days since the last logged movement; 0 on a day with one. */
  gapDays: number;
  /** Most effort any movement took: 0 none, 1 mild, 2 severe. */
  strain: 0 | 1 | 2;
}

/** The day, or null when it says nothing (see `isTrackedDay`). */
export function gutDay(days: DaysMap, dk: string): GutDay | null {
  const ms = movementsOf(days[dk]);
  if (!ms.length) {
    const gap = tracking(days).zeros.get(dk);
    return gap == null ? null : { grade: 'none', count: 0, gapDays: gap, strain: 0 };
  }
  const forms = ms.map(stoolForm);
  const strain = ms.reduce<0 | 1 | 2>((s, m) => Math.max(s, strainLevel(m)) as 0 | 1 | 2, 0);
  const grade: GutGrade = forms.some((f) => f === 'loose' || f === 'diarrhea') ? 'loose'
    : forms.some((f) => f === 'hard') || strain === 2 ? 'hard'
    : 'normal';
  return { grade, count: ms.length, gapDays: 0, strain };
}

/** A day the gut was OFF its normal: loose, hard or strained, or the third day
 *  running without going. What ../scoring/strain counts. */
export const isOffDay = (g: GutDay): boolean =>
  g.grade === 'loose' || g.grade === 'hard' || (g.grade === 'none' && g.gapDays >= SLOW_GAP_DAYS);

/** Movements that day, or null when the day is not a known one. */
export function movementCount(days: DaysMap, dk: string): number | null {
  const g = gutDay(days, dk);
  return g ? g.count : null;
}

/** The day's movements averaged on the Bristol scale; null when none carried a form. */
export function dayBristol(d: DayRecord | undefined): number | null {
  const vs = movementsOf(d).map(bristolOf).filter((v): v is number => v != null);
  return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
}

/* ---------- a range ---------- */

export interface GutSummary {
  /** Known days in the range (a movement, or an earned zero). */
  trackedDays: number;
  /** Of those, days with at least one movement. */
  daysWithMovement: number;
  movements: number;
  forms: Record<StoolForm, number>;
  /** Movements logged with no form. */
  untyped: number;
  strainedMild: number;
  strainedSevere: number;
  /** Longest known run without a movement, in days. 0 when there was none. */
  longestGap: number;
}

/** The range as totals, or null when not one day in it is known. */
export function summarizeGut(days: DaysMap, keys: string[]): GutSummary | null {
  const s: GutSummary = {
    trackedDays: 0, daysWithMovement: 0, movements: 0,
    forms: { hard: 0, formed: 0, loose: 0, diarrhea: 0 },
    untyped: 0, strainedMild: 0, strainedSevere: 0, longestGap: 0,
  };
  keys.forEach((k) => {
    const g = gutDay(days, k);
    if (!g) return;
    s.trackedDays++;
    if (g.grade === 'none') { s.longestGap = Math.max(s.longestGap, g.gapDays); return; }
    s.daysWithMovement++;
    movementsOf(days[k]).forEach((m) => {
      s.movements++;
      const f = stoolForm(m);
      if (f) s.forms[f]++; else s.untyped++;
      const st = strainLevel(m);
      if (st === 1) s.strainedMild++;
      else if (st === 2) s.strainedSevere++;
    });
  });
  return s.trackedDays ? s : null;
}

/** One line of plain text for the reports and the AI prompts. */
export function gutSummaryLine(s: GutSummary): string {
  const forms = STOOL_FORMS.filter((f) => s.forms[f]).map((f) => `${FORM_LABEL[f]} ${s.forms[f]}`);
  if (s.untyped) forms.push(`Not recorded ${s.untyped}`);
  const parts = [
    `${s.movements} movement${s.movements === 1 ? '' : 's'}`,
    `a movement on ${s.daysWithMovement} of ${s.trackedDays} tracked days`,
    forms.length ? `form: ${forms.join(', ')}` : '',
    s.strainedMild || s.strainedSevere ? `straining: mild ${s.strainedMild}, severe ${s.strainedSevere}` : '',
    s.longestGap ? `longest run without one: ${s.longestGap} day${s.longestGap === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return `SUMMARY: ${parts.join(' | ')}. A tracked day is one with a movement logged, or a day other entries were logged while bowel movements were being recorded.`;
}
