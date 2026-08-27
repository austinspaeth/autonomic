/**
 * Auto-open the results card for readings that arrive from a watch while the
 * app is in the foreground — Apple Watch POTS results, and Garmin readings of
 * every kind. Renders nothing: it just bridges the receivers' arrival events
 * onto the sheet stack, so it must be mounted inside SheetProvider.
 */
import React, { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useSheets } from '../components/Sheet';
import { subscribeGarminArrivals } from '../lib/garmin/receiver';
import { subscribeWatchArrivals } from '../lib/watch/receiver';
import { ReadingSummarySheet } from './forms';

export function WatchArrivalCards() {
  const { openSheet } = useSheets();
  const show = useCallback((dk: string, entry: Parameters<Parameters<typeof subscribeWatchArrivals>[0]>[1]) => {
    // "If open" means foregrounded: a background delivery still lands in the
    // journal, it just doesn't pop a card at the user hours later.
    if (AppState.currentState !== 'active') return;
    openSheet(() => <ReadingSummarySheet r={entry} dk={dk} />);
  }, [openSheet]);
  useEffect(() => subscribeWatchArrivals(show), [show]);
  // Garmin readings arrive the same way and deserve the same card: the user
  // took the reading on their wrist and the phone is where the result lives.
  useEffect(() => subscribeGarminArrivals(show), [show]);
  return null;
}
