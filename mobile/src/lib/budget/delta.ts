/**
 * What changed since the last time the strip was drawn, in one short phrase.
 *
 * The bar moves on its own — a health read lands, the heart rate curve grows a
 * stretch above the line, a walk is logged — and until now it moved silently.
 * A figure that has quietly gone from "3h 20m left" to "3h 06m left" between
 * two glances is the one thing in this card a reader cannot check, so the
 * movement now says WHY it moved, once, for a couple of seconds.
 *
 * Two rules:
 *
 *   IT NAMES THE BIGGEST ROW, NOT THE NET. A day can gain twelve minutes above
 *   the line and give back four to recovery in the same read; "+8m" over no
 *   reason at all is the arithmetic and none of the answer. The phrase names
 *   the row that moved most in the direction the bar actually went, which is
 *   the one the reader would have opened the sheet to find.
 *
 *   IT NEVER INVENTS A CAUSE. The label comes from the spend row itself, which
 *   is the same sentence the sheet lists, so the flash and the drill-in cannot
 *   disagree. A movement it cannot attribute to a row gets no phrase and the
 *   bar simply animates.
 *
 * Pure.
 */
import { hm } from './format';
import type { SpendRow, SpendSource } from './burn';

/** Below this a move is rounding, not news. */
export const MIN_DELTA_MIN = 1;

export interface BudgetDelta {
  /** Effort minutes the day gained (up) or gave back (down). Always positive. */
  min: number;
  dir: 'up' | 'down';
  /** "+14m · HR above 95 bpm" */
  text: string;
}

/** The row's own words, trimmed to something that fits under a bar. */
function reasonFor(row: SpendRow): string | null {
  const src: SpendSource = row.source;
  if (src === 'hr') {
    const m = /above\s+(\d+)\s*bpm/i.exec(row.label);
    return m ? `HR above ${m[1]} bpm` : 'HR above your line';
  }
  if (src === 'upright') return 'upright time';
  if (src === 'steps') return 'steps';
  if (src === 'credits') return 'recovery time';
  if (src === 'activities') {
    // The newest member names itself; the row's own label is a category and
    // "logged activities" under a bar that just jumped 40 minutes says less
    // than "Bike ride" does.
    const last = row.members && row.members.length ? row.members[row.members.length - 1] : null;
    return last ? last.label : 'logged activity';
  }
  if (src === 'multiplier') return row.label.toLowerCase();
  return null;
}

const bySource = (rows: SpendRow[]): Map<SpendSource, SpendRow> => {
  const m = new Map<SpendSource, SpendRow>();
  rows.forEach((r) => m.set(r.source, r));
  return m;
};

/**
 * `prev` and `next` are the two builds' spend rows; `netMin` is the change in
 * what the day has cost after credits, which is what the bar actually draws.
 */
export function budgetDelta(prev: SpendRow[], next: SpendRow[], netMin: number): BudgetDelta | null {
  const min = Math.round(Math.abs(netMin));
  if (min < MIN_DELTA_MIN) return null;
  const dir: 'up' | 'down' = netMin > 0 ? 'up' : 'down';

  const before = bySource(prev);
  const sources = new Set<SpendSource>([...prev.map((r) => r.source), ...next.map((r) => r.source)]);

  let best: { row: SpendRow; move: number } | null = null;
  sources.forEach((s) => {
    const b = before.get(s);
    const a = next.find((r) => r.source === s);
    // A row's effort is signed (credits are negative), so its own contribution
    // to the day's cost moves the same way the net does without a special case
    // for the credit row: more credit is a more negative number.
    const move = (a ? a.effortMin : 0) - (b ? b.effortMin : 0);
    if (dir === 'up' ? move < MIN_DELTA_MIN : move > -MIN_DELTA_MIN) return;
    if (!best || Math.abs(move) > Math.abs(best.move)) best = { row: (a || b)!, move };
  });

  if (!best) return null;
  const { row } = best as { row: SpendRow; move: number };
  const reason = reasonFor(row);
  if (!reason) return null;
  return { min, dir, text: `${dir === 'up' ? '+' : '-'}${hm(min)} · ${reason}` };
}
