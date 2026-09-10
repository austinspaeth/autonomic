/**
 * Persistence for the shared offer cool-down (./pacing).
 *
 * Same storage rules as the rest of src/lib/upsell: the plaintext
 * `autonomic.flags` MMKV, alongside the trial stamp and the review stamps. It
 * isn't health data, it must never ride export/import, and it has to survive
 * "Clear all data" — erasing the journal is not a request to be sold to again.
 *
 * One wrinkle: builds before this module existed raised offers without stamping
 * anything, so a phone that saw the annual card yesterday would have an empty
 * clock and could be handed the founder card today — precisely the pairing this
 * exists to prevent. So an empty clock is BACKFILLED once, from the two offer
 * memories that already record when they fired. That's a shell-layer job (the
 * pure ./pacing knows nothing about the other offers) and it happens exactly
 * once, because the backfill is written.
 */
import { MMKV } from 'react-native-mmkv';
import { emptyOfferPacing, noteOffer, offerAllowed, type OfferPacing, type OfferSurface } from './pacing';
import { annualMemory } from './annualMemory';
import { founderMemory } from './founderMemory';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'offerPacing';

/* MMKV can be unavailable (jest, web); degrade to an in-memory value so the
 * module still works for one session rather than throwing at import. */
let kv: MMKV | null | undefined;
let memValue: string | undefined;
function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

function read(): OfferPacing {
  let raw = memValue;
  try { raw = store()?.getString(KEY) ?? memValue; } catch { /* in-memory */ }
  if (!raw) return emptyOfferPacing();
  try {
    const parsed = JSON.parse(raw) as OfferPacing;
    return {
      lastSurface: parsed.lastSurface === 'annual' || parsed.lastSurface === 'founder' ? parsed.lastSurface : undefined,
      lastShownAtMs: Number.isFinite(parsed.lastShownAtMs) ? parsed.lastShownAtMs : undefined,
    };
  } catch {
    return emptyOfferPacing();
  }
}

function write(m: OfferPacing): void {
  const raw = JSON.stringify(m);
  memValue = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only this session */ }
}

/**
 * What an offer already recorded about itself, as an epoch ms — the annual
 * window's own start, and the founder card's claimed day read as local
 * midnight (it stores a day key, which is all the resolution it ever had).
 * The later of the two is the honest answer to "when did we last speak".
 */
function backfilledAtMs(): number | null {
  const times: number[] = [];
  const started = annualMemory().startedAtMs;
  if (started != null && Number.isFinite(started)) times.push(started);
  const dk = founderMemory().shownDk;
  if (dk) {
    const t = Date.parse(`${dk}T00:00:00`);
    if (Number.isFinite(t)) times.push(t);
  }
  return times.length ? Math.max(...times) : null;
}

/** The shared clock. Backfills itself once on a phone that pre-dates it. */
export function offerPacing(): OfferPacing {
  const m = read();
  if (m.lastShownAtMs != null) return m;
  const at = backfilledAtMs();
  if (at == null) return m;
  const next: OfferPacing = {
    lastSurface: annualMemory().startedAtMs === at ? 'annual' : 'founder',
    lastShownAtMs: at,
  };
  write(next);
  return next;
}

/** May an offer be OPENED right now? Asked only on a start path. */
export function offerPacingClear(nowMs = Date.now()): boolean {
  return offerAllowed(nowMs, offerPacing());
}

/** Stamp the clock — called the moment an offer's window opens. */
export function noteOfferShown(surface: OfferSurface, nowMs = Date.now()): void {
  write(noteOffer(offerPacing(), surface, nowMs));
}
