/**
 * When a paused budget starts publishing again anyway.
 *
 * Two escapes, and they answer different questions.
 *
 * THE RUN VALVE is the app's own. A pause is meant to be an event, and every
 * suppressor is now shaped like one — a downturn is a slide, a crash is a
 * fall (./envelope), a strain alert is this user's medians moving away from
 * themselves. But a strain alert reads a 7-day window against the previous
 * 42, so it can hold for a week or more while that window rolls off, and a
 * feature that has shown nothing for three days is not paused, it is gone.
 * The user cannot tell the difference between "withheld for your safety" and
 * "broken", and the second reading is the one people act on. So after
 * `PAUSE_RUN_MAX` consecutive paused days the number comes back, with the
 * warning still on it.
 *
 * THE OVERRIDE is the reader's. It is PER DAY AND HAS NO MEMORY BEYOND THE
 * DAY, which is the rule `features/hrv/Results.tsx` already follows for a
 * salvageable reading: a "stop warning me" setting gets flipped once on a bad
 * morning and then quietly removes the rail for every real crash afterwards,
 * with nobody remembering it is on. Per day, or not at all. What it buys is
 * not permission to spend — the warning stays, the day is still the day — it
 * is the right to see a number about your own body after being told why the
 * app would rather you did not.
 *
 * Pure: no store, no native, no React. The shell is ./pauseMemory.
 */

/** Consecutive paused days after which the budget publishes regardless. */
export const PAUSE_RUN_MAX = 3;

/** How many day keys the memory keeps. Enough to measure the run above with
 *  room to spare, and short enough that it never becomes a history. */
export const PAUSE_MEMORY_DAYS = 8;

/** Why a suppressed day is showing its number after all. */
export type Unpaused = 'user' | 'run' | null;

/**
 * How many days immediately BEFORE `dk` were paused, counting back without a
 * gap. A gap ends the run: two paused days last week and one today is not a
 * feature that has gone quiet, it is one that fired three times.
 */
export function pauseRunBefore(
  dk: string,
  paused: string[],
  addDays: (k: string, n: number) => string,
): number {
  const set = new Set(paused);
  let n = 0;
  for (let i = 1; i <= PAUSE_MEMORY_DAYS; i++) {
    if (!set.has(addDays(dk, -i))) break;
    n++;
  }
  return n;
}

/**
 * The verdict, for a day the envelope wants to suppress.
 *
 * The user's own choice outranks the valve, so the sheet can say "you asked
 * for this" rather than "the app gave up on warning you", which are different
 * sentences about the same number.
 */
export function unpausedBy(opts: {
  /** This day is in the reader's own override list. */
  userAsked: boolean;
  /** Paused days immediately before this one (`pauseRunBefore`). */
  run: number;
}): Unpaused {
  if (opts.userAsked) return 'user';
  if (opts.run >= PAUSE_RUN_MAX) return 'run';
  return null;
}

/** Add a day to the remembered paused run, newest last, capped. Idempotent,
 *  so a Journal that rebuilds twenty times a day records one day. */
export function notePaused(paused: string[], dk: string): string[] {
  if (paused.includes(dk)) return paused;
  return [...paused, dk].slice(-PAUSE_MEMORY_DAYS);
}

/**
 * The advice that rides EVERY paused budget.
 *
 * It lives here, and the paused card renders it itself, because the rule is
 * that the two are one notice: a pause IS the app recommending a recovery
 * day, so a card that paused without saying so left the reader to infer the
 * advice from the absence of a number. Keeping it a caller's prop meant three
 * heroes each had to remember to pass it, and one of them (the unscored card)
 * would not have.
 *
 * It does NOT track the crash grade any more. It used to be `DaySummary`'s
 * crash flag, fired on `score < 25` independently, which produced both halves
 * alone: a crash-grade day at the reader's own floor is no longer paused and
 * showed advice over a live budget, and a downturn or strain alert pauses days
 * scoring anywhere up to 74 and showed a pause with nothing explaining it.
 */
export const PAUSE_ADVICE = 'We recommend a recovery day. Focus on rest and hydration. Feel better soon!';

export type PauseReason = 'downturn' | 'crash' | 'strain-alert';

/**
 * Why a day is paused, in the user's own terms.
 *
 * NOTHING HERE PROMISES TOMORROW. The line used to read "Take it easy, resume
 * tomorrow" whatever the reason, which is a forecast the app cannot make and
 * was false every morning for anyone the pause latched on — and a promise
 * broken daily is worse than no promise, because it teaches the reader the
 * card is not about them.
 *
 * Each reason NAMES ITSELF too, rather than all three saying "downturn". The
 * strip had one hardcoded sentence for three different findings, so a strain
 * alert reported a downturn the app had not detected.
 */
export function pauseReasonText(reason: PauseReason, past = false): string {
  if (reason === 'strain-alert') {
    return past ? 'Early warning signs that day' : 'Early warning signs in your readings';
  }
  if (reason === 'crash') {
    return past ? 'That day was well below your usual' : 'Well below your usual today';
  }
  return past ? 'The app saw a downturn that day' : 'The app is seeing a downturn';
}

/**
 * The ONE line under a paused budget on today.
 *
 * Its whole job is the way out. The advice itself is said by the card this
 * line sits in — the crash flag folded in beneath the divider, or the red of
 * the container on a downturn or strain day — so repeating "rest is best"
 * here spent the line saying twice what is already on screen once. Naming the
 * finding instead (`pauseReasonText`) was worse: it spent the line on a word
 * the sheet explains properly anyway and left the play button beside it
 * looking decorative. A finished day keeps the reason, because there is no
 * way out of last Tuesday and nothing to offer.
 *
 * It is the ONE line in the module exempt from the honesty test's ban on
 * "you can", and the exemption is narrow on purpose: that rule exists so no
 * copy ever grants permission to SPEND effort, and this grants permission to
 * LOOK at a number. Saying it plainly is the whole job of the line — a
 * reader who does not realise the pause is theirs to lift is a reader who
 * thinks the feature is broken. The test names this constant, so any OTHER
 * line that reaches for the phrasing still fails.
 */
export const PAUSED_TODAY_SUB = 'You can unpause, but be careful.';

/**
 * The one line under a budget that is showing its number anyway.
 *
 * SHORT, because this line shares its row with the confidence label and is
 * clamped to one line: "Shown at your request. The app is seeing a downturn."
 * rendered as "Shown at your request. The ap…", which spends the row on a
 * sentence nobody can finish reading.
 *
 * So it keeps the half that matters. Of the two things it could say — WHY the
 * number is on screen, and what the app still advises — only the second is
 * about the reader's next hour, and the first is a tap away in the sheet
 * (which does distinguish the reader's own choice from the run valve, since
 * it has the room). It states the advice and never the permission, honesty
 * rule 3.
 */
export function unpausedText(_reason: PauseReason, _why: Unpaused): string {
  return 'Rest still advised.';
}
