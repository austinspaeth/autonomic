/**
 * The last answer the medication picker gave (./medPicker).
 *
 * Its own file beside the pure module, the `upsell/annual.ts` +
 * `annualMemory.ts` arrangement. It exists for the support dump: the picker's
 * answer is the one gate between "I log my doses in Health" and an import that
 * leaves no trace at all, and "nothing imports" is otherwise unanswerable —
 * `nodata` says the Health app's own list is empty, `canceled` says the picker
 * really did present.
 *
 * Plaintext `autonomic.flags` MMKV, the same instance as ./askedAuth: device
 * bookkeeping that must not ride export/import and should survive "Clear all
 * data". The LAST answer only — this is a diagnostic, not a series.
 *
 * NO MEDICATION NAME EVER REACHES HERE. Names are health data and the support
 * dump carries none; what is stored is a code, a timestamp, and the OS's own
 * words about the request (capped), which never name a medication.
 */
import { MMKV } from 'react-native-mmkv';
import { MED_PICKER_MSG_MAX, type MedPickerOutcome, type MedPickerRecord } from './medPicker';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'medPickerLast';

let kv: MMKV | null | undefined;
let mem: string | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** The last recorded answer, or null if the picker has never been opened. */
export function medPickerLast(): MedPickerRecord | null {
  let raw = mem;
  try { raw = store()?.getString(KEY) ?? mem; } catch { /* in-memory only */ }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as MedPickerRecord;
    if (!p?.code || typeof p.code !== 'string') return null;
    const at = Number(p.at);
    return {
      code: p.code,
      at: Number.isFinite(at) ? at : 0,
      ...(p.message ? { message: String(p.message).slice(0, MED_PICKER_MSG_MAX) } : null),
    };
  } catch { return null; }
}

/** Record what the picker just answered, replacing anything older. */
export function noteMedPicker(outcome: MedPickerOutcome, atMs = Date.now()): void {
  const rec: MedPickerRecord = {
    code: outcome.code,
    at: atMs,
    ...(outcome.message ? { message: outcome.message.slice(0, MED_PICKER_MSG_MAX) } : null),
  };
  const raw = JSON.stringify(rec);
  mem = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only */ }
}
