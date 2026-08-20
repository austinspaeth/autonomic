/** Journal current-day state, shared across the header + Journal screen. */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { addDays, todayKey } from '../lib/dates';

let today = todayKey();
let current = today;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Re-read the local calendar date. If midnight passed (or the device timezone
 *  shifted) while the app was open or suspended, a journal left on "today"
 *  advances to the new today; a deliberately back-dated view stays put. A view
 *  that would now sit in the future (timezone moved backward) clamps to today. */
export function refreshToday() {
  const t = todayKey();
  if (t === today) return;
  if (current === today || current > t) current = t;
  today = t;
  emit();
}

// iOS freezes JS timers while the app is suspended, so the timer alone can't be
// trusted: refresh on every return to foreground too, and re-arm the timer for
// the (possibly new) next local midnight.
let midnightTimer: ReturnType<typeof setTimeout> | undefined;
function armMidnightTimer() {
  if (midnightTimer) clearTimeout(midnightTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  midnightTimer = setTimeout(() => {
    refreshToday();
    armMidnightTimer();
  }, nextMidnight.getTime() - now.getTime() + 1000);
}
AppState.addEventListener('change', (s) => {
  if (s === 'active') {
    refreshToday();
    armMidnightTimer();
  }
});
armMidnightTimer();

export function setCurrentKey(k: string) {
  if (k > todayKey()) return; // never navigate into the future
  current = k;
  emit();
}
export function shiftCurrent(delta: number) { setCurrentKey(addDays(current, delta)); }
export function getCurrentKey() { return current; }

/* Journal scroll-to-section: sections report their content y as they lay out
 * (setJournalSectionY), the Journal screen registers its scroller, and anything
 * rendered inside the journal (e.g. the milestone "Up first" checklist) can jump
 * the view to a section. */
const sectionYs: Record<string, number> = {};
let journalScroller: ((y: number) => void) | null = null;
export function setJournalSectionY(section: string, y: number) { sectionYs[section] = y; }
export function registerJournalScroller(fn: ((y: number) => void) | null) { journalScroller = fn; }
export function scrollJournalToSection(section: string) {
  const y = sectionYs[section];
  if (journalScroller && y != null) journalScroller(y);
}

/* Progress streak (clean-day protocol) card: the home-screen Protocol widget
 * deep-links (autonomic://?open=protocol) asking the app to open the card
 * expanded. The deep-link handler bumps this signal; the StreakCard subscribes
 * and opens itself, while the handler also scrollJournalToSection('protocol'). */
let expandProtocolSeq = 0;
const expandProtocolListeners = new Set<() => void>();
export function requestExpandProtocol() {
  expandProtocolSeq++;
  expandProtocolListeners.forEach((l) => l());
}
export function useExpandProtocolSignal(): number {
  return useSyncExternalStore(
    (cb) => { expandProtocolListeners.add(cb); return () => expandProtocolListeners.delete(cb); },
    () => expandProtocolSeq,
    () => expandProtocolSeq,
  );
}

/* Progress range request: the Journal's Trend card ("your resting HR is down 6
 * bpm since last month") navigates to Progress and asks it to open on Month, so
 * the user lands on the view the claim was computed from. A free user lands on
 * the same view with its Pro mask over it — meeting their own faded data sells
 * far better than jumping them to a price list, which is why this carries a
 * range and not a paywall call. */
export interface ProgressRequest { mode: string; section?: string; card?: string }
let requestedRange: ProgressRequest | null = null;
let rangeSeq = 0;
const rangeListeners = new Set<() => void>();
/**
 * `section` is an analysis category id ('hrv', 'vitals', 'sleep', …) and `card`
 * the title of one card inside it ('Clean Days', 'RMSSD') — the screen scrolls
 * there once the range has committed, so the user arrives at the chart the claim
 * was made about rather than the top of the page.
 *
 * The card matters more than it sounds: a section is several charts long, so
 * "RMSSD" landed the reader on Power distribution and "Clean days" on the
 * Outlook gauge, both of which are a different metric from the one they tapped.
 * An unknown card falls back to the section, never to the top of the page.
 */
export function requestProgressRange(mode: string, section?: string, card?: string) {
  requestedRange = { mode, section, card };
  rangeSeq++;
  rangeListeners.forEach((l) => l());
}
/** Consume the pending request (returns null when there isn't one). */
export function takeProgressRange(): ProgressRequest | null {
  const r = requestedRange;
  requestedRange = null;
  return r;
}
export function useProgressRangeSignal(): number {
  return useSyncExternalStore(
    (cb) => { rangeListeners.add(cb); return () => rangeListeners.delete(cb); },
    () => rangeSeq,
    () => rangeSeq,
  );
}

export function useCurrentKey(): string {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
    () => current,
  );
}
