/**
 * The rules of the floating pill stack: who sits in front, and how far back the rest
 * recede.
 *
 * Five overlays render into the same spot above the tab bar (`bottom: insets.bottom +
 * 88`): a minimized HRV reading, the watch-sync pill, the health-import pill, the
 * "What's new" pill, and the Insights "Get AI Insights & Reports" button. The reading
 * outranks all of them because it is a measurement in progress that the user set aside
 * on purpose — losing it behind a "What's new" prompt costs them five minutes. They are not equally urgent, so they
 * STACK rather than compete: the highest-ranked visible one sits at full size and
 * everything below it recedes into the sheet stack's stacked-card look, scaled down,
 * lifted and dimmed by one step per pill above it.
 *
 * Pure, and separate from ../store/pillSlot for the reason the whole `src/lib`
 * boundary exists: the ordering is the part worth testing, and a mistake in it shows
 * up as an urgent pill hidden behind a permanent button. The store keeps the live
 * claims and the subscription.
 */

/** Most urgent first. A key not in here ranks below everything that is. */
export const PILL_RANK = ['hrv', 'watchSync', 'health', 'whatsNew', 'ai'] as const;
export type PillKey = (typeof PILL_RANK)[number];

/**
 * How many of `claimed` outrank `key`, and so how many steps it should recede.
 *
 * 0 means it is the visible one. A key IS NOT counted against itself: the binary
 * "is anything claimed" this replaced was true of the claimant, so a pill receded
 * behind itself the moment it started claiming — which is exactly the bug that turned
 * up when a third layer was added.
 *
 * An unranked key is treated as the bottom of the stack, which is the safe default: a
 * new pill that forgets to register recedes politely rather than covering something
 * urgent.
 */
export function depthOf(key: string, claimed: Iterable<string>): number {
  const order = PILL_RANK as readonly string[];
  const mine = order.indexOf(key);
  const rank = mine < 0 ? order.length : mine;
  let above = 0;
  for (const k of claimed) {
    const i = order.indexOf(k);
    if (i >= 0 && i < rank) above++;
  }
  return above;
}

/* ---------- the shared recede treatment ---------- */

/** One step back in the stack, matching the sheet stack's stacked-card look. */
export const RECEDE_SCALE_STEP = 0.06;
export const RECEDE_LIFT_STEP = 11;
export const RECEDE_FADE_STEP = 0.22;
/** Beyond this many steps the pill is a sliver and further steps only hide it. */
export const RECEDE_MAX_DEPTH = 2;
export const RECEDE_SPRING = { damping: 21, stiffness: 210, mass: 0.9 } as const;

/**
 * The transform for a pill `depth` steps back.
 *
 * Shared so all four pills recede identically: a stack whose members shrink by
 * different amounts reads as broken rather than as depth.
 */
export function recedeStyle(depth: number): { opacity: number; scale: number; translateY: number } {
  const d = Math.min(RECEDE_MAX_DEPTH, Math.max(0, depth));
  return {
    opacity: 1 - RECEDE_FADE_STEP * d,
    scale: 1 - RECEDE_SCALE_STEP * d,
    // `d ? ... : 0` rather than the bare product: -11 * 0 is -0, which is not 0 to
    // Object.is and so not 0 to a strict equality test.
    translateY: d ? -RECEDE_LIFT_STEP * d : 0,
  };
}
