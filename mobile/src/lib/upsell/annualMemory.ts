/**
 * Persistence for the half-off annual offer (./annual).
 *
 * Its own file rather than part of the card on purpose: ./pacingMemory reads
 * this stamp to backfill the shared offer clock, and the card itself imports
 * src/store/tier. Keeping the persistence in a leaf that depends only on MMKV
 * and the pure ./annual is what stops those references closing into a cycle.
 *
 * Same storage rules as the rest of src/lib/upsell: the plaintext
 * `autonomic.flags` MMKV, alongside the trial stamp and the review stamps. It
 * isn't health data, it must never ride export/import, and it has to survive
 * "Clear all data" — an offer already spent must not come back by erasing the
 * journal. What's written is a list of spent milestones, the standing one, and
 * when it was raised.
 */
import { MMKV } from 'react-native-mmkv';
import { dismissOffer, emptyAnnualMemory, startOffer, type AnnualOfferMemory } from './annual';

/** TEMP (dev only): pin the due milestone so the card is raised on the next
 *  render, whatever the install date says. Leave null in committed code.
 *  Mirrors FORCE_TIER (src/store/tier.ts). */
export const FORCE_ANNUAL_OFFER: number | null = null;

/**
 * TEMP (dev only): on the next launch, rewind the stored stamp by N days, as if
 * the card had been raised that long ago. The card itself no longer expires, so
 * this only ages the shared offer clock — use it to reach the state where the
 * next milestone is free to fire. It rewrites storage ONCE and then persists,
 * so put it back to null after one launch. Leave null in committed code.
 */
const FORCE_OFFER_AGE_DAYS: number | null = null;


const FLAGS_ID = 'autonomic.flags';
const KEY = 'annualOffer';
/** ./index's memory key. Reached directly, and ONLY from the dev rewind below,
 *  because importing ./index here would close an import cycle through
 *  src/store/tier. Nothing in the shipping path touches it. */
const KEY_UPSELL = 'upsellMemory';

/* MMKV can be unavailable (jest, web); degrade to an in-memory value so the
 * module still works for one session rather than throwing at import. */
let kv: MMKV | null | undefined;
let memValue: string | undefined;
function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

export function annualMemory(): AnnualOfferMemory {
  let raw = memValue;
  try { raw = store()?.getString(KEY) ?? memValue; } catch { /* in-memory */ }
  if (!raw) return emptyAnnualMemory();
  try {
    const parsed = JSON.parse(raw) as AnnualOfferMemory;
    return {
      consumed: Array.isArray(parsed.consumed) ? parsed.consumed.filter((n) => Number.isFinite(n)) : [],
      startedAtMs: parsed.startedAtMs,
      milestone: parsed.milestone,
    };
  } catch {
    return emptyAnnualMemory();
  }
}

function write(m: AnnualOfferMemory): void {
  const raw = JSON.stringify(m);
  memValue = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only this session */ }
}

/** Raise the card. Returns the memory it wrote, so the caller can render from
 *  the same value it just persisted rather than reading back. */
export function noteAnnualOfferStarted(milestone: number, nowMs = Date.now()): AnnualOfferMemory {
  const next = startOffer(annualMemory(), milestone, nowMs);
  write(next);
  return next;
}

/** The ✕. Permanent for this milestone: the card comes back at the next one. */
export function noteAnnualOfferDismissed(): void {
  write(dismissOffer(annualMemory()));
}

/* Dev time machine — see FORCE_OFFER_AGE_DAYS. Runs once at import, moving both
 * the offer window and the shared upsell pacing clock back by the same number
 * of days, so the resulting state is coherent rather than an offer that expired
 * while the pacing clock still says "we spoke to this user a minute ago". */
if (__DEV__ && FORCE_OFFER_AGE_DAYS) {
  const shift = FORCE_OFFER_AGE_DAYS * 86_400_000;
  const m = annualMemory();
  if (m.startedAtMs) write({ ...m, startedAtMs: m.startedAtMs - shift });
  try {
    const raw = store()?.getString(KEY_UPSELL);
    if (raw) {
      const parsed = JSON.parse(raw) as { lastPromptAtMs?: number | null };
      if (parsed.lastPromptAtMs) {
        store()?.set(KEY_UPSELL, JSON.stringify({ ...parsed, lastPromptAtMs: parsed.lastPromptAtMs - shift }));
      }
    }
  } catch { /* dev-only best effort */ }
}
