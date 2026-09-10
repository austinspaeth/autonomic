/**
 * The bar moved, and this is the moment it says so.
 *
 * `buildBudget` is rebuilt whenever the journal changes or the shell finishes a
 * health read, so the strip's figure can change under a reader who is looking
 * straight at it with nothing to explain the jump. The pulse is the one place
 * the app narrates its own arithmetic: it holds the previous build's spend
 * rows, diffs them against the new ones, and publishes a short-lived object the
 * bar animates from and the subtext borrows for a couple of seconds.
 *
 * It is deliberately a UI-only memory. Nothing is persisted: a movement that
 * happened while the app was closed is not news the user needs on launch, and
 * the first build after a cold start therefore never pulses.
 */
import React from 'react';
import { budgetDelta } from '../../lib/budget/delta';
import { PULSE_TOTAL_MS } from './style';
import type { BudgetView, SpendRow } from '../../lib/budget';

export interface BudgetPulse {
  id: number;
  /** Displayed fill (0..1, already clamped) before and after. */
  from: number;
  to: number;
  dir: 'up' | 'down';
  /** "+14m · HR above 95 bpm" */
  text: string;
}

/** What the bar actually draws, which is not `fill` once the day is over the
 *  ceiling. Exported so the pulse and the bar cannot disagree about where the
 *  slice starts. */
export function displayFill(budget: BudgetView): number {
  if (budget.state === 'over' || budget.state === 'final-over') return 1;
  return Math.max(0, Math.min(1, budget.fill));
}

/** States with no bar to move, or no live day behind it. */
const inert = (b: BudgetView) => b.past || b.skeleton || b.state === 'suppressed' || b.state === 'unknown';

export function useBudgetPulse(dk: string, budget: BudgetView, enabled: boolean): BudgetPulse | null {
  const [pulse, setPulse] = React.useState<BudgetPulse | null>(null);
  const prev = React.useRef<{ dk: string; spent: number; rows: SpendRow[]; fill: number; inert: boolean } | null>(null);
  const seq = React.useRef(0);

  React.useEffect(() => {
    const cur = {
      dk,
      spent: budget.burn.effortMin,
      rows: budget.burn.rows,
      fill: displayFill(budget),
      inert: inert(budget),
    };
    const before = prev.current;
    prev.current = cur;
    // A different day is a different object, not a movement; and a build on
    // either side of a suppressed or unwatched day has no comparable spend.
    if (!enabled || !before || before.dk !== dk || before.inert || cur.inert) return;
    const d = budgetDelta(before.rows, cur.rows, cur.spent - before.spent);
    if (!d) return;
    seq.current += 1;
    setPulse({ id: seq.current, from: before.fill, to: cur.fill, dir: d.dir, text: d.text });
  }, [dk, budget, enabled]);

  React.useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse((p) => (p && p.id === pulse.id ? null : p)), PULSE_TOTAL_MS);
    return () => clearTimeout(t);
  }, [pulse]);

  return pulse;
}
