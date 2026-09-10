/**
 * The one choke point for opening the pacing budget.
 *
 * `isBudgetLocked` reads the answer at TAP TIME rather than from a hook, the
 * same rule `isPotsResultLocked` follows: a user who upgrades from the card
 * this opens must not have to close the Journal for the answer to change. It
 * asks src/store/pacingTrial, not the tier, because a free install also sees
 * the budget during its seven-day pacing window.
 */
import React from 'react';
import { isPacingUnlocked } from '../../store/pacingTrial';
import type { BudgetView } from '../../lib/budget';
import type { OpenSheet } from '../forms';
import { BudgetSheet } from './BudgetSheet';
import { BudgetPitchCard } from './PitchCard';

export function isBudgetLocked(): boolean {
  return !isPacingUnlocked();
}

export function openBudgetSheet(openSheet: OpenSheet, dk: string, budget: BudgetView): void {
  if (isBudgetLocked()) {
    // A card, not a mask. The locked thing is one number the user has not
    // seen, so there is no shape behind a blur worth preserving — the tap
    // opens the pitch and nothing else.
    openSheet((c) => <BudgetPitchCard controls={c} />, { fitContent: true });
    return;
  }
  openSheet(() => <BudgetSheet dk={dk} budget={budget} />);
}
