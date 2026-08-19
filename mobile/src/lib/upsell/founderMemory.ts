/**
 * Persistence for the founding-member offer (./founder).
 *
 * Same storage rules as the rest of src/lib/upsell: the plaintext
 * `autonomic.flags` MMKV, alongside the trial stamp and the review stamps. It
 * isn't health data, it must never ride export/import, and it has to survive
 * "Clear all data" — an offer already shown (or dismissed) must not come back
 * by erasing the journal. What's written is one day key and one boolean.
 */
import { MMKV } from 'react-native-mmkv';
import { emptyFounderMemory, type FounderMemory } from './founder';

/** TEMP (dev only): pretend the offer is due on the next render, whatever the
 *  journal says. Mirrors FORCE_ANNUAL_OFFER (./annualMemory). Leave false in
 *  committed code. Note it does NOT bypass the memory — clear the app's flags
 *  (or set FORCE_FOUNDER_RESET) to see the card again once it has claimed a day. */
export const FORCE_FOUNDER_OFFER = false;
/** TEMP (dev only): wipe the stored memory once at import, so the card can be
 *  seen again. Leave false in committed code. */
const FORCE_FOUNDER_RESET = false;

const FLAGS_ID = 'autonomic.flags';
const KEY = 'founderOffer';

/* MMKV can be unavailable (jest, web); degrade to an in-memory value so the
 * module still works for one session rather than throwing at import. */
let kv: MMKV | null | undefined;
let memValue: string | undefined;
function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

export function founderMemory(): FounderMemory {
  let raw = memValue;
  try { raw = store()?.getString(KEY) ?? memValue; } catch { /* in-memory */ }
  if (!raw) return emptyFounderMemory();
  try {
    const parsed = JSON.parse(raw) as FounderMemory;
    return {
      shownDk: typeof parsed.shownDk === 'string' ? parsed.shownDk : undefined,
      dismissed: !!parsed.dismissed,
    };
  } catch {
    return emptyFounderMemory();
  }
}

function write(m: FounderMemory): void {
  const raw = JSON.stringify(m);
  memValue = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only this session */ }
}

/** Claim `dk` as the offer's one day. Returns the memory it wrote so the caller
 *  can render from the same value rather than reading back. */
export function noteFounderShown(dk: string): FounderMemory {
  const next = { ...founderMemory(), shownDk: dk };
  write(next);
  return next;
}

/** ✕ or "No thanks" — permanent. */
export function noteFounderDismissed(): void {
  write({ ...founderMemory(), dismissed: true });
}

if (__DEV__ && FORCE_FOUNDER_RESET) write(emptyFounderMemory());
