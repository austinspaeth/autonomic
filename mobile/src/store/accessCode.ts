/**
 * Redeeming an access code. Pure rules are in ../lib/accessCode, the wire is
 * `postAccessCode` in ./ping, and the window it extends is ./tier.
 *
 * A code works ONCE, and that is the server's rule: the first redemption
 * spends it and every later one, from any phone, is answered "used".
 * `accessCodesUsed` (flags MMKV, outside the journal, so it survives "Clear
 * all data" and never rides an export) is only this phone's memory of the
 * codes it has spent, so re-typing one is answered here without a request.
 *
 * A PROMO code is the other kind: it unlocks the $24.99 year
 * (`PROMO_YEARLY_SKU`), which nothing else in the app sells. Entering one
 * spends nothing. The code is HELD (`promoCodeHeld`) while the store sheet is
 * up, and only a purchase of that product moves it to `promoCodeSpend`, which
 * is sent until the server has it. A cancelled sheet or a declined payment
 * leaves the code good to try again, and a confirmation lost to a dead network
 * goes out on the next launch or foreground.
 */
import { AppState as RNAppState } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { postAccessCode } from './ping';
import { grantAccessDays } from './tier';
import { PROMO_YEARLY_SKU, onNewPurchase } from './iap';
import { normalizeCode } from '../lib/accessCode';

const FLAGS_ID = 'autonomic.flags';
const KEY_USED = 'accessCodesUsed';
const KEY_PROMO_HELD = 'promoCodeHeld';
const KEY_PROMO_SPEND = 'promoCodeSpend';

let kv: MMKV | null | undefined;
const mem = new Map<string, string>();
function flags(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

function read(key: string): string | undefined {
  try { return flags()?.getString(key) ?? mem.get(key); } catch { return mem.get(key); }
}
function write(key: string, value: string | undefined) {
  if (value === undefined) mem.delete(key); else mem.set(key, value);
  try {
    if (value === undefined) flags()?.delete(key); else flags()?.set(key, value);
  } catch { /* in-memory only this session */ }
}

function usedCodes(): string[] {
  const raw = read(KEY_USED);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : [];
  } catch { return []; }
}

function rememberCode(code: string) {
  write(KEY_USED, JSON.stringify([...usedCodes(), code]));
}

export type RedeemResult =
  | { status: 'ok'; days: number }
  | { status: 'offer' }         // a promo code: buy the $24.99 year to use it
  | { status: 'used' }          // already redeemed, here or anywhere
  | { status: 'invalid' }       // the server knows no such code
  | { status: 'unreachable' };  // no answer; nothing was spent

let inFlight = false;

/** The card's submit. Extends the full-access window only on the server's yes;
 *  a promo code is held for the purchase instead. */
export async function redeemAccessCode(raw: string): Promise<RedeemResult> {
  const code = normalizeCode(raw);
  if (usedCodes().includes(code)) return { status: 'used' };
  if (inFlight) return { status: 'unreachable' };
  inFlight = true;
  try {
    const answer = await postAccessCode(code);
    if (answer.status === 'offer') {
      write(KEY_PROMO_HELD, code);
      return answer;
    }
    if (answer.status !== 'ok') return answer;
    rememberCode(code);
    grantAccessDays(answer.days);
    return answer;
  } finally {
    inFlight = false;
  }
}

let spending = false;

/** Tell the server the held promo code was bought with, until it has heard. */
async function flushPromoSpend(): Promise<void> {
  const code = read(KEY_PROMO_SPEND);
  if (!code || spending) return;
  spending = true;
  try {
    const answer = await postAccessCode(code, true);
    // Spent now, or already spent, or gone: nothing left to tell it.
    if (answer.status !== 'unreachable') {
      write(KEY_PROMO_SPEND, undefined);
      rememberCode(code);
    }
  } finally {
    spending = false;
  }
}

let armed = false;

/** Root layout, after `initIap()`: spend a held promo code when its purchase
 *  lands, and retry a confirmation that never got through. */
export function initAccessCodes(): void {
  if (armed) return;
  armed = true;
  onNewPurchase((e) => {
    if (e.sku !== PROMO_YEARLY_SKU) return;
    const held = read(KEY_PROMO_HELD);
    if (!held) return;
    write(KEY_PROMO_SPEND, held);
    write(KEY_PROMO_HELD, undefined);
    void flushPromoSpend();
  });
  void flushPromoSpend();
  try {
    RNAppState.addEventListener('change', (st) => { if (st === 'active') void flushPromoSpend(); });
  } catch { /* no AppState here (jest) */ }
}
