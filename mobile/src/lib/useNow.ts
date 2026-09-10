/**
 * A clock that ticks slowly, for the one thing in the app that moves with the
 * hour rather than with the data.
 *
 * The pacing strip's marker sits where an even day would have you by NOW, and
 * its projection is a clock time. Both go stale on a screen left open, and the
 * Journal otherwise only re-renders when the journal changes — so a phone left
 * on the Journal all afternoon would show a marker frozen at breakfast.
 *
 * Deliberately coarse. A minute-by-minute tick would re-render the Outlook
 * card 1,400 times a day to move a marker by a pixel.
 */
import { useEffect, useState } from 'react';

export function useNow(intervalMs: number, enabled = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}
