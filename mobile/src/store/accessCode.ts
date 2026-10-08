/**
 * Redeeming an access code. Pure rules are in ../lib/accessCode, the wire is
 * `postAccessCode` in ./ping, and the window it extends is ./tier.
 *
 * A code works ONCE, and that is the server's rule: the first redemption
 * spends it and every later one, from any phone, is answered "used".
 * `accessCodesUsed` (flags MMKV, outside the journal, so it survives "Clear
 * all data" and never rides an export) is only this phone's memory of the
 * codes it has spent, so re-typing one is answered here without a request.
 */
import { MMKV } from 'react-native-mmkv';
import { postAccessCode } from './ping';
import { grantAccessDays } from './tier';
import { normalizeCode } from '../lib/accessCode';

const FLAGS_ID = 'autonomic.flags';
const KEY_USED = 'accessCodesUsed';

let kv: MMKV | null | undefined;
const mem = new Map<string, string>();
function flags(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

function usedCodes(): string[] {
  let raw: string | undefined;
  try { raw = flags()?.getString(KEY_USED) ?? mem.get(KEY_USED); } catch { raw = mem.get(KEY_USED); }
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : [];
  } catch { return []; }
}

function rememberCode(code: string) {
  const next = JSON.stringify([...usedCodes(), code]);
  mem.set(KEY_USED, next);
  try { flags()?.set(KEY_USED, next); } catch { /* in-memory only this session */ }
}

export type RedeemResult =
  | { status: 'ok'; days: number }
  | { status: 'used' }          // already redeemed, here or anywhere
  | { status: 'invalid' }       // the server knows no such code
  | { status: 'unreachable' };  // no answer; nothing was spent

let inFlight = false;

/** The card's submit. Extends the full-access window only on the server's yes. */
export async function redeemAccessCode(raw: string): Promise<RedeemResult> {
  const code = normalizeCode(raw);
  if (usedCodes().includes(code)) return { status: 'used' };
  if (inFlight) return { status: 'unreachable' };
  inFlight = true;
  try {
    const answer = await postAccessCode(code);
    if (answer.status !== 'ok') return answer;
    rememberCode(code);
    grantAccessDays(answer.days);
    return answer;
  } finally {
    inFlight = false;
  }
}
