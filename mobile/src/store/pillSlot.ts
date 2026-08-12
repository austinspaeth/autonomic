/**
 * Who currently owns the floating pill slot above the tab bar.
 *
 * The live half of the pill stack: a set of claims plus a subscription, so each pill
 * can ask how far back it sits and re-render when that changes. The ORDERING and the
 * recede geometry are pure and live in ../lib/pillStack, where they are tested.
 *
 * Every pill CLAIMS while it is mounted and visible, and releases on unmount only.
 * Keys rather than a counter, so an unmount mid-animation cannot leave the slot
 * permanently claimed — and a cleanup keyed on a phase would drop and retake the claim
 * on every transition, bouncing the pills behind it.
 */
import { depthOf } from '../lib/pillStack';

export {
  PILL_RANK, RECEDE_FADE_STEP, RECEDE_LIFT_STEP, RECEDE_MAX_DEPTH, RECEDE_SCALE_STEP,
  RECEDE_SPRING, recedeStyle,
} from '../lib/pillStack';
export type { PillKey } from '../lib/pillStack';

const claims = new Set<string>();
const subs = new Set<() => void>();

/** Claim or release the slot. Idempotent. */
export function setPillSlotClaim(key: string, claimed: boolean): void {
  const had = claims.has(key);
  if (claimed === had) return;
  if (claimed) claims.add(key); else claims.delete(key);
  subs.forEach((f) => f());
}

/** How many steps back `key` should sit. 0 means it is the visible one. */
export function pillDepth(key: string): number { return depthOf(key, claims); }

export function subscribePillSlot(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
