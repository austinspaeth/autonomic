/**
 * What the one Todo actually does.
 *
 * The strip shows a single recommendation and the sheet repeats it as a row;
 * both route here rather than each holding their own copy of "how do you open
 * the HRV capture". Everything goes through the Journal's existing entry
 * points, so a Todo can never open a card the rest of the app does not.
 */
import React from 'react';
import type { OpenSheet } from '../forms';
import type { RecommendationId } from '../../lib/budget';
import { connectPacingHealth } from '../../store/budget';

export function runBudgetAction(id: RecommendationId | undefined, openSheet: OpenSheet, dk: string): void {
  if (!id) return;
  if (id === 'steps') { void connectPacingHealth(); return; }

  // Required lazily: features/forms and features/hrv/Setup both reach back
  // into the sheet stack and the store, and importing them at module scope
  // from a file the pure-ish sheet imports creates a cycle through
  // DaySummary -> Strip -> here -> forms -> DaySummary.
  /* eslint-disable @typescript-eslint/no-require-imports */
  if (id === 'hrv' || id === 'orthostatic') {
    const { HrvSetup } = require('../hrv/Setup') as typeof import('../hrv/Setup');
    openSheet((c) => React.createElement(HrvSetup, { controls: c }));
    return;
  }
  if (id === 'sleep') {
    const { openSleepAdd } = require('../JournalSections') as typeof import('../JournalSections');
    openSleepAdd(openSheet, dk);
    return;
  }
  if (id === 'activity') {
    // Scrolls to the section rather than opening a picker: "+ Add activity"
    // lives there and is the app's one way in, and the deep links already
    // treat scroll-to-section as the honest half of an action.
    const { scrollJournalToSection } = require('../../store/nav') as typeof import('../../store/nav');
    scrollJournalToSection('activities');
    return;
  }
  /* eslint-enable @typescript-eslint/no-require-imports */
  // 'learning' and 'posture' are answered in the sheet itself.
}
