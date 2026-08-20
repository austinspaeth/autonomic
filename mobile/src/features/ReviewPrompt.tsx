/**
 * Mount point for the store review ask (src/lib/review). Renders nothing — it
 * exists to answer "is right now a calm moment?", which the pure eligibility
 * rules can't know: the OS prompt appears over whatever is on screen, so it
 * must never land on top of a sheet, mid-capture, during launch, or while the
 * app is heading into the background.
 *
 * Timing, in order: something good happens in the journal (or the app has been
 * open a while), the sheet stack is empty, the app is foreground. Whether the
 * day itself is worth asking on is entirely src/lib/review/eligibility.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSheets } from '../components/Sheet';
import { maybeAskForReview } from '../lib/review';
import { subscribeStore } from '../store/store';

/** Quiet period after launch — never prompt into a still-settling first screen. */
const LAUNCH_QUIET_MS = 25000;
/** Trailing debounce after a journal change: let the save settle, and let the
 *  user see whatever they just logged land before anything pops over it. */
const CHANGE_DEBOUNCE_MS = 4000;

export function ReviewPrompt() {
  // A sheet open means the user is mid-task (capture, an entry form, the import
  // card). The prompt waits for the stack to clear rather than talking over it.
  const { depth } = useSheets();
  const depthRef = useRef(depth);
  depthRef.current = depth;

  const pending = useRef(false);
  const asked = useRef(false);

  const attempt = useRef<() => void>(() => {});
  attempt.current = () => {
    if (asked.current || !pending.current) return;
    if (depthRef.current > 0) return;              // stays pending; retried when the stack clears
    if (AppState.currentState !== 'active') return;
    pending.current = false;
    void maybeAskForReview().then((did) => { asked.current = asked.current || did; });
  };

  useEffect(() => {
    // Opening the app on a good day counts too, once it's clearly settled.
    const launch = setTimeout(() => { pending.current = true; attempt.current(); }, LAUNCH_QUIET_MS);
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeStore(() => {
      if (asked.current) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; pending.current = true; attempt.current(); }, CHANGE_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(launch);
      if (t) clearTimeout(t);
      unsub?.();
    };
  }, []);

  // Retry the moment the sheet stack empties out (the common case: the ask came
  // due while an entry form was still open).
  useEffect(() => { if (depth === 0) attempt.current(); }, [depth]);

  return null;
}
