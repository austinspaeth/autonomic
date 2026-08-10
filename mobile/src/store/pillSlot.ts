/**
 * Who owns the floating pill slot above the tab bar.
 *
 * Several overlays render into the same spot (`bottom: insets.bottom + 88`):
 * the watch sync pill, the health-import pill, and the "What's new" pill. The
 * first two are transient and time-sensitive, so they always take the slot. The
 * What's new pill is not: it waits indefinitely, so it yields, receding into the
 * stacked-card look behind whichever pill is up and sliding back into place when
 * that pill leaves.
 *
 * Priority pills claim the slot while mounted and visible; the yielding pill
 * subscribes. Keys (rather than a counter) so an unmount mid-animation can't
 * leave the slot permanently claimed.
 */

const claims = new Set<string>();
const subs = new Set<() => void>();

/** Claim or release the slot for a priority pill. Idempotent. */
export function setPillSlotClaim(key: string, claimed: boolean): void {
  const had = claims.has(key);
  if (claimed === had) return;
  if (claimed) claims.add(key); else claims.delete(key);
  subs.forEach((f) => f());
}

/** True while a priority pill is occupying the slot. */
export function pillSlotTaken(): boolean { return claims.size > 0; }

export function subscribePillSlot(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
