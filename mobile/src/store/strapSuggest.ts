/**
 * The shell over `lib/strapSuggest.ts`: its memory in the plaintext flags MMKV,
 * and the one question callers ask after a failed reading.
 *
 * Flags MMKV, not the journal: it is about the person, so it does not ride
 * export/import and survives "Clear all data" (erasing a journal is not a
 * request to be shown the suggestion again). Silent on failure (in-memory only).
 */
import { MMKV } from 'react-native-mmkv';
import {
  EMPTY_MEMORY, noteFailure, noteShown, parseMemory, suggestionDue,
  type StrapSuggestMemory, type WeakSensor,
} from '../lib/strapSuggest';
import { getState } from './store';
import { pingStrapCard } from './ping';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'strapSuggest';

let kv: MMKV | null | undefined;
let mem: StrapSuggestMemory | null = null;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

function read(): StrapSuggestMemory {
  if (mem) return mem;
  try { mem = parseMemory(store()?.getString(KEY)); } catch { mem = EMPTY_MEMORY; }
  return mem;
}

function write(next: StrapSuggestMemory) {
  mem = next;
  try { store()?.set(KEY, JSON.stringify(next)); } catch { /* in-memory only */ }
}

/** A saved strap means the user already owns the answer. */
const ownsStrap = () => !!getState().settings.lastBleDeviceId;

/**
 * Count a failed reading with a weak sensor and say whether the strap card
 * should open NOW. A yes is spent on the spot (stamped before the card opens,
 * the review ask's rule, since nothing reports back whether it was seen).
 *
 * `canShow: false` counts the failure without spending anything: a Garmin
 * diagnostic delivered while the app is in the background is still a failure,
 * and the card can wait for the next one.
 */
export function strapSuggestionDue(sensor: WeakSensor, canShow = true): boolean {
  const counted = noteFailure(read());
  const now = Date.now();
  if (!canShow || !suggestionDue(counted, now, ownsStrap())) {
    write(counted);
    return false;
  }
  write(noteShown(counted, now));
  // `stp` C / G: the anonymous ping, carrying tier, version and platform like
  // every other one.
  pingStrapCard(sensor);
  return true;
}

/** The Amazon button was tapped (`stp` T). */
export function noteStrapTapped(): void {
  pingStrapCard('tapped');
}
