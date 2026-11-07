/**
 * The last thing the Health app's medication picker answered.
 *
 * One row, for the support dump. Every gate between "I log medications in
 * Health" and a dose in the journal fails silently — the switch, the OS
 * version, the per-object grant, and now the picker's own answer — and
 * `healthRows` in lib/diagnostics/collectApp already exists because of that.
 * The picker's answer was the one gate with no trace at all: it is deliberately
 * not persisted as a GRANT (Apple's `success` does not report what was shared,
 * so nothing may be concluded from it), which left "I tapped the button and
 * nothing happened" with nothing to read afterwards.
 *
 * So what is kept is the OUTCOME and nothing else: a stable code, the OS's own
 * message, and when. No medication name ever reaches this file — the names are
 * health data and the support dump carries none.
 *
 * Plaintext flags MMKV, the askedAuth instance: device bookkeeping that must
 * not ride export/import and has no business in the journal.
 */
import { MMKV } from 'react-native-mmkv';
import type { MedPickerOutcome } from './medPicker';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'healthMedPickerLast';
/** The OS message is for a human reading a dump, not a log: keep it short. */
const MAX_MESSAGE = 140;

export interface MedPickerRecord {
  code: string;
  at: number;
  message?: string;
}

let kv: MMKV | null | undefined;
let mem: MedPickerRecord | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** What the picker last answered, or null if it has never been opened here. */
export function lastMedPicker(): MedPickerRecord | null {
  if (mem !== undefined) return mem;
  mem = null;
  try {
    const raw = store()?.getString(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<MedPickerRecord>;
      if (v && typeof v.code === 'string' && typeof v.at === 'number') {
        mem = { code: v.code, at: v.at, ...(v.message ? { message: String(v.message) } : null) };
      }
    }
  } catch { /* corrupt/missing — never opened, as far as the dump is concerned */ }
  return mem;
}

/** Record one answer. Called for every outcome, success included. */
export function noteMedPicker(o: MedPickerOutcome, at = Date.now()): void {
  const rec: MedPickerRecord = {
    code: o.code,
    at,
    ...(o.message ? { message: o.message.slice(0, MAX_MESSAGE) } : null),
  };
  mem = rec;
  try { store()?.set(KEY, JSON.stringify(rec)); } catch { /* in-memory only */ }
}
