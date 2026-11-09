/**
 * Persistence for the Black Friday offer (./holiday).
 *
 * Same storage rules as the rest of src/lib/upsell: the plaintext
 * `autonomic.flags` MMKV, alongside the trial stamp and the review stamps. It
 * isn't health data, it must never ride export/import, and it has to survive
 * "Clear all data" — a promotion somebody dismissed must not come back by
 * erasing the journal. What's written is one timestamp and one boolean.
 */
import { MMKV } from 'react-native-mmkv';
import { emptyHolidayMemory, holidayWindowOpen, HOLIDAY_OFFER_ENABLED, type HolidayMemory } from './holiday';

/** TEMP (dev only): pretend the window is open and the offer due on the next
 *  render, whatever the date says. Mirrors FORCE_FOUNDER_OFFER
 *  (./founderMemory). Leave false in committed code. It does NOT bypass the
 *  memory — a dismissed card stays dismissed, since a card that reappeared
 *  after a ✕ would be testing something the shipping app cannot do. Use
 *  FORCE_HOLIDAY_RESET to see it again. */
export const FORCE_HOLIDAY_OFFER = false;
/** TEMP (dev only): wipe the stored memory once at import. Leave false. */
const FORCE_HOLIDAY_RESET = false;

const FLAGS_ID = 'autonomic.flags';
const KEY = 'holidayOffer';

/* MMKV can be unavailable (jest, web); degrade to an in-memory value so the
 * module still works for one session rather than throwing at import. */
let kv: MMKV | null | undefined;
let memValue: string | undefined;
function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

export function holidayMemory(): HolidayMemory {
  let raw = memValue;
  try { raw = store()?.getString(KEY) ?? memValue; } catch { /* in-memory */ }
  if (!raw) return emptyHolidayMemory();
  try {
    const parsed = JSON.parse(raw) as HolidayMemory;
    return {
      shownAtMs: Number.isFinite(parsed.shownAtMs) ? parsed.shownAtMs : undefined,
      dismissed: !!parsed.dismissed,
    };
  } catch {
    return emptyHolidayMemory();
  }
}

function write(m: HolidayMemory): void {
  const raw = JSON.stringify(m);
  memValue = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only this session */ }
}

/** Raise the card. Stamped once; its presence is what makes the card stand for
 *  the rest of the window. */
export function noteHolidayShown(nowMs = Date.now()): void {
  write({ ...holidayMemory(), shownAtMs: nowMs });
}

/** The ✕ — permanent. */
export function noteHolidayDismissed(): void {
  write({ ...holidayMemory(), dismissed: true });
}

if (__DEV__ && FORCE_HOLIDAY_RESET) write(emptyHolidayMemory());

/**
 * Does the Black Friday window own the Journal's offer slot?
 *
 * The question the other two offer cards ask before drawing anything, and the
 * one ../review/card asks before offering its star. This offer takes
 * PRECEDENCE (./holiday), so a `true` here takes down a card that is already
 * standing — it does not merely stop a new one being raised.
 *
 * It answers from the WINDOW, not from whether this card has been raised yet.
 * The raise happens in an effect, so a liveness read that waited for it would
 * let AnnualOffer paint a frame of a standing card on the launch that opens the
 * window, and the two would be on screen together exactly once per install —
 * which is the one thing this is here to prevent. Answering from the window is
 * synchronous and order-independent.
 *
 * The one case it covers more widely than "this card is on screen" is a day
 * this card DEFERS (a crash alert, a downturn): the slot stays empty, which is
 * right — the app raises no offer at all on a day the Journal just told
 * somebody to rest. A ✕ releases the slot, but the shared clock
 * (./pacingMemory), stamped when this card opened, keeps the other two quiet
 * for a week after it.
 */
export function holidayOwnsSlot(nowMs = Date.now()): boolean {
  if (!HOLIDAY_OFFER_ENABLED) return false;
  if (holidayMemory().dismissed) return false;
  // The dev force opens the window too, or the other cards would go on drawing
  // themselves beside a forced card and the arrangement being tested would not
  // be the shipping one.
  return holidayWindowOpen(nowMs) || (__DEV__ && FORCE_HOLIDAY_OFFER);
}
