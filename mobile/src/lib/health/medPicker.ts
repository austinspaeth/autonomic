/**
 * What the Health app's medication picker answered, and what to say about it.
 *
 * Pure, so it can be tested: nothing here touches the native module or the
 * store. The shell is `openMedicationPicker` in ./index and the one row in
 * features/Health.tsx that renders the note.
 *
 * WHY THIS EXISTS. `requestPerObjectReadAuthorization` reports almost
 * everything that is not a success as an ERROR, Apple's own documented
 * examples included: closing the picker is `HKError.errorUserCanceled`, and a
 * medication list with nothing in it is `errorNoData`. The native side used to
 * collapse all of that into `false`, so the one sentence the sheet could say
 * was "Could not open the medication list" — which is a lie about the two
 * commonest answers and useless for the third, since it names no reason. Three
 * different things were indistinguishable:
 *
 *   - the picker opened and the person closed it (nothing to report);
 *   - there are no medications in the Health app to pick (the person has to
 *     add them THERE first — the app cannot and the button never will);
 *   - the request genuinely failed (worth reporting, and worth a code).
 *
 * `medPickerNote` is that split, and `isMedPickerFault` keeps the first two out
 * of `/fault`: an answer is not a failure.
 */

/** The native side's own words (EcgHealthModule.hkCode), plus the three this
 *  side can conclude without it. An unmapped HealthKit error arrives as its
 *  number (`hk14`), which is why this is a string and not a union. */
export type MedPickerCode =
  | 'ok'            // the request was processed; WHAT was shared is not said
  | 'canceled'      // the picker was closed
  | 'nodata'        // the Health app has no medications to choose from
  | 'denied'        // medication access is off for this app
  | 'notdetermined'
  | 'restricted'    // managed device
  | 'locked'        // database inaccessible (phone locked)
  | 'invalid'
  | 'unsupported'   // iOS 25 or earlier: no medication log on this phone
  | 'unavailable'   // HealthKit itself is unavailable
  | 'missing'       // this binary has no such native function
  | 'failed'        // processed and returned false, or an unreadable error
  | (string & {});

export interface MedPickerOutcome {
  /** The request was PROCESSED. Never a claim that anything was shared. */
  ok: boolean;
  code: MedPickerCode;
  /** The OS's own words, for the support dump. Never shown as the note. */
  message?: string;
}

/**
 * Whatever the native call resolved, as an outcome.
 *
 * A binary built before this shipped resolves a bare boolean, and one built
 * before 1.39 has no such function at all, so both shapes have to be readable:
 * the JS can reach a phone the Swift change has not (the `fingerprint` runtime
 * version makes that unlikely, not impossible), and an outcome that throws here
 * would be a worse answer than a vague one.
 */
export function normalizeMedPicker(v: unknown): MedPickerOutcome {
  if (v === true) return { ok: true, code: 'ok' };
  if (v === false) return { ok: false, code: 'failed' };
  if (v && typeof v === 'object') {
    const o = v as { ok?: unknown; code?: unknown; message?: unknown };
    const code = typeof o.code === 'string' && o.code ? o.code : (o.ok ? 'ok' : 'failed');
    const msg = typeof o.message === 'string' && o.message ? o.message : undefined;
    return { ok: !!o.ok, code, ...(msg ? { message: msg } : null) };
  }
  return { ok: false, code: 'missing' };
}

/** A recorded answer (./medPickerMemory) read back as an outcome. `ok` is
 *  derived, never stored: the record is of what the OS said, and "processed"
 *  is the one thing the code already tells us. */
export function outcomeOf(rec: { code: string; message?: string }): MedPickerOutcome {
  return { ok: rec.code === 'ok', code: rec.code, ...(rec.message ? { message: rec.message } : null) };
}

/** Is this outcome worth a `/fault` row? An answer is not a failure: the two
 *  the person (or their own Health data) gave are recorded in the support dump
 *  and nowhere else, or the Failures tab fills with people closing a sheet. */
export function isMedPickerFault(code: MedPickerCode): boolean {
  return code !== 'ok' && code !== 'canceled' && code !== 'nodata';
}

export interface MedPickerNote {
  /** `error` renders as StoreError, `info` as the sheet's own dim body text. */
  kind: 'error' | 'info';
  text: string;
}

/**
 * What to show under the button, or null for the two outcomes that need no
 * words: a processed request (the Health sheet the person just answered IS the
 * receipt, and `ok` says nothing about what was shared) and a closed picker.
 *
 * `permissionPath` is passed in rather than imported so this file stays pure.
 */
export function medPickerNote(
  o: MedPickerOutcome,
  permissionPath: string,
): MedPickerNote | null {
  if (o.ok || o.code === 'ok') return null;
  switch (o.code) {
    case 'canceled':
      return null;
    case 'nodata':
      // Not a failure, and the fix is not in this app: a dose is named by the
      // medication list, so a phone that keeps no medications in the Health
      // app has nothing for the picker to offer and nothing to import.
      return {
        kind: 'info',
        text: 'The Health app has no medications to choose from yet. Add them there '
          + '(Health → Browse → Medications), then come back.',
      };
    case 'denied':
    case 'notdetermined':
      return {
        kind: 'error',
        text: `Apple Health is not allowing medication access. Check ${permissionPath}.`,
      };
    case 'restricted':
      return {
        kind: 'error',
        text: 'Medication access is restricted on this iPhone, which is usually a device-management setting.',
      };
    case 'locked':
      return {
        kind: 'error',
        text: 'Apple Health could not be read just now. Unlock the phone and try again.',
      };
    case 'unsupported':
      return {
        kind: 'error',
        text: 'This iPhone has no medication log — doses need iOS 26.',
      };
    case 'unavailable':
      return {
        kind: 'error',
        text: 'Apple Health is not available on this iPhone.',
      };
    case 'missing':
      return {
        kind: 'error',
        text: 'This build cannot open the medication list. Update the app and try again.',
      };
    default:
      // The code is in the sentence on purpose. This is the branch nobody
      // anticipated, so the one thing worth having on screen is the word a
      // support dump and a /fault row will also carry.
      return {
        kind: 'error',
        text: `Could not open the medication list (${o.code}). Try again, or share the `
          + 'medication from the Health app itself.',
      };
  }
}
