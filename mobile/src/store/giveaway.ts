/**
 * The giveaway sign-up's memory and its two sends. Pure rules are in
 * ../lib/giveaway; the wire is `postGiveaway` in ./ping.
 *
 * Kept in the plaintext flags MMKV, outside the journal: signing up is about the
 * person, so it never rides an export and survives "Clear all data".
 *
 *   giveawayEmail      the address the user signed up with
 *   giveawaySentAt     ISO time the server last confirmed a write
 *   giveawaySentCount  how many entries that write carried
 *
 * An address is stored only once the server has confirmed it — the card's
 * "You're signed up" is read off it, so it must not be true before the sign-up
 * is. After that, `syncGiveaway` sends again only when the ENTRY COUNT has gone
 * past what the server last saw: a day's first counting reading (baseline or
 * training) adds one entry and so one send, a second reading that day adds
 * nothing, and at the cap nothing ever sends again. The row is an upsert keyed
 * by the address; a failed send is retried on the next journal change or
 * foreground. `initGiveawaySync` (root layout) is what makes that independent
 * of which screen is open.
 */
import { AppState as RNAppState } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { getState, subscribeStore } from './store';
import { postGiveaway } from './ping';
import { todayKey } from '../lib/dates';
import { giveawayBody, giveawayEntryList } from '../lib/giveaway';

const FLAGS_ID = 'autonomic.flags';
const KEY_EMAIL = 'giveawayEmail';
const KEY_SENT_AT = 'giveawaySentAt';
const KEY_SENT = 'giveawaySentCount';

let kv: MMKV | null | undefined;
function flags(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}
const read = (k: string): string | undefined => { try { return flags()?.getString(k); } catch { return undefined; } };
const write = (k: string, v: string) => { try { flags()?.set(k, v); } catch { /* retried on the next sync */ } };

export const isGiveawaySignedUp = (): boolean => !!read(KEY_EMAIL);

let inFlight = false;

async function send(email: string): Promise<boolean> {
  const entries = giveawayEntryList(getState().days, todayKey());
  const ok = await postGiveaway(giveawayBody(email, entries, __DEV__));
  if (ok) {
    write(KEY_EMAIL, email.trim().toLowerCase());
    write(KEY_SENT, String(entries.length));
    write(KEY_SENT_AT, new Date().toISOString());
  }
  return ok;
}

/** The sheet's submit. True once the server has saved the sign-up. */
export async function submitGiveaway(email: string): Promise<boolean> {
  if (inFlight) return false;
  inFlight = true;
  try { return await send(email); } catch { return false; } finally { inFlight = false; }
}

/** After sign-up, bring the server's entry list up to date. Cheap and silent
 *  when nothing moved; a failed send is simply tried again on the next call. */
export async function syncGiveaway(): Promise<void> {
  const email = read(KEY_EMAIL);
  if (!email || inFlight) return;
  const count = giveawayEntryList(getState().days, todayKey()).length;
  if (count <= (Number(read(KEY_SENT)) || 0)) return;
  inFlight = true;
  try { await send(email); } catch { /* next call */ } finally { inFlight = false; }
}

let armed = false;

/** Root layout, once: re-check after journal changes (debounced, like the crash
 *  watcher) and on every foreground, which is where an offline retry lands. */
export function initGiveawaySync(): void {
  if (armed) return;
  armed = true;
  void syncGiveaway();
  let t: ReturnType<typeof setTimeout> | null = null;
  subscribeStore(() => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; void syncGiveaway(); }, 2000);
  });
  try {
    RNAppState.addEventListener('change', (st) => { if (st === 'active') void syncGiveaway(); });
  } catch { /* no AppState here (jest) */ }
}
