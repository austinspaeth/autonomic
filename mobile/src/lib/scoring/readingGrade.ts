/**
 * The grade an HRV reading's own card wears.
 *
 * IT IS THE DAY SCORE'S INPUT, NOT A SECOND SCORE. The card used to lead with
 * its own 0-100 composite and a line of advice taken from the WORST of RMSSD,
 * pNN50 and total power, the last two on bands built for paced breathing. An
 * unpaced reading rarely meets those, so the same five minutes read
 * "Excellent" on the Outlook and "Low reserves. Favor rest" on its own card,
 * and the "/100" beside the Outlook's "/100" read as one scale. Now the card
 * shows exactly what `scoreSet` takes from the reading: RMSSD, graded on the
 * baseline or training bands, with a baseline pulled down (never up) toward
 * the user's own usual. The card shows it as one row, the grade alone: no
 * number, no sentence. Advice belongs to the Outlook.
 */
import { isTrustedReading } from '../hrvQuality';
import { GRADE_PTS, sRMSSDs, sRMSSDu } from './index';
import { personalBaselineCat, usualBaseline } from './baseline';
import type { DaysMap } from './day';
import type { Entry, ScoreCat } from '../types';

/** Points back to a grade: the explain sheet's own thresholds, shared. */
export const catFromPts = (pt: number): ScoreCat =>
  (pt >= 88 ? 'great' : pt >= 70 ? 'good' : pt >= 48 ? 'ok' : pt >= 23 ? 'bad' : 'crash');

const num = (v: unknown): number | null => {
  const n = parseFloat(v as string);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The day key holding entry `id`, or null. */
export function entryDayKey(days: DaysMap, id: string): string | null {
  for (const k of Object.keys(days)) {
    if ((days[k].readings || []).some((r) => String(r.id) === id)) return k;
  }
  return null;
}

export interface ReadingGrade {
  kind: 'baseline' | 'training';
  cat: ScoreCat | null;
  /** False for an imported reading too short to count (`isTrustedReading`). */
  counts: boolean;
}

export function readingGrade(r: Entry, days: DaysMap, dk: string | null): ReadingGrade {
  const kind = r.type === 'breathHrv' ? 'training' : 'baseline';
  const rmssd = num(r.rmssd);
  const counts = isTrustedReading(r);
  if (kind === 'training') return { kind, counts, cat: sRMSSDs(rmssd) };
  const abs = sRMSSDu(rmssd);
  const usual = dk ? usualBaseline(days, dk) : null;
  let cat = abs;
  // scoreSet's baselinePts, verbatim: the personal half may only LOWER.
  if (abs && usual && rmssd != null) {
    const a = GRADE_PTS[abs];
    cat = catFromPts(Math.min(a, 0.5 * a + 0.5 * GRADE_PTS[personalBaselineCat(rmssd, usual.median)]));
  }
  return { kind, counts, cat };
}
