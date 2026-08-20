/**
 * Auto-open the results card for readings that arrive from the watch while
 * the app is in the foreground (POTS test results). Renders nothing — it just
 * bridges the watch receiver's arrival events onto the sheet stack, so it
 * must be mounted inside SheetProvider.
 */
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSheets } from '../components/Sheet';
import { subscribeWatchArrivals } from '../lib/watch/receiver';
import { ReadingSummarySheet } from './forms';

export function WatchArrivalCards() {
  const { openSheet } = useSheets();
  useEffect(() => subscribeWatchArrivals((dk, entry) => {
    // "If open" means foregrounded: a background delivery still lands in the
    // journal, it just doesn't pop a card at the user hours later.
    if (AppState.currentState !== 'active') return;
    openSheet(() => <ReadingSummarySheet r={entry} dk={dk} />);
  }), [openSheet]);
  return null;
}
