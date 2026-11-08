/**
 * What the Health app's medication picker answered, and what to say about it.
 *
 * Pure, because the picker's answer is the one gate between "I log my doses in
 * Health" and an import that leaves no trace at all, and the sentence on screen
 * has to be the right one. `requestPerObjectReadAuthorization` reports almost
 * everything that is not a success as a HealthKit ERROR: Apple's own example
 * catches `errorUserCanceled` for a picker the person closed, and a Health app
 * with no medications in it answers `errorNoData`. The native side used to
 * resolve a bare `false` for all of that, so one sentence — "Could not open the
 * medication list" — stood for four different outcomes, and was simply wrong
 * about the two commonest:
 *
 *   - the picker opened and the person closed it (nothing to report at all);
 *   - the Health app holds no medications to pick, where the fix is in the
 *     Health app and this button can never do anything about it;
 *   - medication access is off for the app;
 *   - the request genuinely failed.
 *
 * Two rules the rest of the module follows from. `ok` is Apple's `success`,
 * which "doesn't indicate whether the user actually granted" — so it is never a
 * grant, nothing may be persisted on it and nothing may report "shared". And
 * the default branch puts the raw CODE in the sentence: that branch exists
 * because nobody knew what would land in it, so the word a support dump and a
 * `/fault` row carry has to be the word on screen too.
 */

/** One answer from the picker. `code` is a stable word, never a raw error. */
export interface MedPickerOutcome {
  ok: boolean;
  code: string;
  message?: string;
}

/** The recorded form (./medPickerMemory): the last answer and when. */
export interface MedPickerRecord {
  code: string;
  at: number;
  message?: string;
}

/** Longest OS message we keep. Enough to identify one, short enough that it
 *  cannot turn a support dump or a `/fault` row into a wall of text. */
export const MED_PICKER_MSG_MAX = 140;

const trim = (v: unknown): string | undefined => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, MED_PICKER_MSG_MAX) : undefined;
};

/**
 * Read whatever the native side resolved.
 *
 * Three shapes, because the JS can reach a phone the Swift has not: the
 * structured answer, a bare boolean from a binary built before it shipped
 * (read as ok/failed, which is exactly what that binary knew), and
 * undefined/null for the function being absent entirely — `missing`, which is
 * its own finding and not a failure of the request. It must not throw.
 */
export function normalizeMedPicker(v: unknown): MedPickerOutcome {
  if (v === undefined || v === null) return { ok: false, code: 'missing' };
  if (typeof v === 'boolean') return { ok: v, code: v ? 'ok' : 'failed' };
  if (typeof v === 'object') {
    const r = v as { ok?: unknown; code?: unknown; message?: unknown };
    const code = String(r.code ?? '').trim() || (r.ok === true ? 'ok' : 'failed');
    const msg = trim(r.message);
    return { ok: code === 'ok', code, ...(msg ? { message: msg } : null) };
  }
  return { ok: false, code: 'failed' };
}

/** A recorded answer read back. `ok` is DERIVED rather than stored, so a
 *  record can never claim a success its own code contradicts. */
export function outcomeOf(rec: MedPickerRecord | null | undefined): MedPickerOutcome | null {
  if (!rec?.code) return null;
  return { ok: rec.code === 'ok', code: rec.code, ...(rec.message ? { message: rec.message } : null) };
}

/**
 * Is this worth a `/fault` row?
 *
 * Not for `ok`, and deliberately not for `canceled` or `nodata`. A cancel is
 * the commonest outcome there is — the picker presenting and being answered is
 * the feature working — and an empty medication list is the person's own data.
 * A fault row for either would count people USING the feature as people
 * hitting a bug, and the Failures tab ranks by breadth.
 */
export function isMedPickerFault(code: string): boolean {
  return code !== 'ok' && code !== 'canceled' && code !== 'nodata';
}

/** A line to render under the button, or null when there is nothing to say. */
export interface MedPickerNote {
  kind: 'error' | 'info';
  text: string;
}

/**
 * What to put on screen.
 *
 * Null for `ok` and for `canceled`: the Health sheet the person just answered
 * IS the receipt, and `success` is not a grant, so there is nothing to claim
 * either way. Everything else gets words — `permissionPath` is passed in
 * (`healthPermissionPath()`) so this file stays pure.
 */
export function medPickerNote(
  outcome: MedPickerOutcome | null | undefined,
  permissionPath: string,
): MedPickerNote | null {
  if (!outcome) return null;
  const { code } = outcome;
  if (code === 'ok' || code === 'canceled') return null;
  switch (code) {
    case 'nodata':
      // Not an error: there is nothing wrong here and nothing this button can
      // do. The medication list is the Health app's, and it is empty.
      return {
        kind: 'info',
        text: 'Apple Health has no medications in its list yet. Add them in Health → Browse → Medications, then come back here to share them.',
      };
    case 'denied':
      return {
        kind: 'error',
        text: `Apple Health is not letting Autonomic ask about medications. Turn its access back on in ${permissionPath}, then try again.`,
      };
    case 'notdetermined':
      return {
        kind: 'error',
        text: `Apple Health did not record an answer. Check Autonomic's access in ${permissionPath}, then try again.`,
      };
    case 'restricted':
      return {
        kind: 'error',
        text: 'Health data is restricted on this device, so the medication list cannot be shared. That is set in Screen Time, or by whoever manages the device.',
      };
    case 'locked':
      return {
        kind: 'error',
        text: 'Apple Health could not be read while the phone is locked. Unlock it and try again.',
      };
    case 'unsupported':
      return {
        kind: 'info',
        text: 'Medication doses need iOS 26, which added the Health app’s medication log.',
      };
    case 'unavailable':
      return {
        kind: 'error',
        text: 'Apple Health is not available on this device, so there is no medication list to pick from.',
      };
    case 'missing':
      return {
        kind: 'error',
        text: 'This build cannot open the medication list. Update Autonomic and try again.',
      };
    default:
      // The branch that exists because nobody knew what would land in it. The
      // code is in the sentence on purpose: it is the same word the support
      // dump and the `/fault` row carry, so the two can be read together.
      return {
        kind: 'error',
        text: `Could not open the medication list (${code}). Try again, or share the medication from the Health app itself.`,
      };
  }
}
