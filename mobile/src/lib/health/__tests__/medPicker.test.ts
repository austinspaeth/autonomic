import {
  isMedPickerFault, medPickerNote, normalizeMedPicker, outcomeOf,
} from '../medPicker';

const PATH = 'Apple Health → your profile → Apps';

describe('the medication picker answer', () => {
  it('reads the structured answer', () => {
    expect(normalizeMedPicker({ ok: true, code: 'ok' })).toEqual({ ok: true, code: 'ok' });
    expect(normalizeMedPicker({ ok: false, code: 'nodata', message: 'No data available' }))
      .toEqual({ ok: false, code: 'nodata', message: 'No data available' });
  });

  it('reads the bare boolean an older binary resolves', () => {
    // The Swift change and the JS that reads it ship together, but the JS can
    // reach a phone the native code has not, and throwing there would be a
    // worse answer than a vague one.
    expect(normalizeMedPicker(true)).toEqual({ ok: true, code: 'ok' });
    expect(normalizeMedPicker(false)).toEqual({ ok: false, code: 'failed' });
  });

  it('reads a missing native function as missing, not as a failure to present', () => {
    expect(normalizeMedPicker(undefined).code).toBe('missing');
    expect(normalizeMedPicker(null).code).toBe('missing');
  });

  it('derives ok from the recorded code alone', () => {
    expect(outcomeOf({ code: 'ok' })).toEqual({ ok: true, code: 'ok' });
    expect(outcomeOf({ code: 'canceled' }).ok).toBe(false);
  });
});

describe('which answers are failures', () => {
  it('counts a closed picker and an empty medication list as answers', () => {
    // Both are the feature working. A /fault row for either would report
    // people using it as people hitting a bug, and `canceled` is the single
    // commonest outcome there is.
    expect(isMedPickerFault('canceled')).toBe(false);
    expect(isMedPickerFault('nodata')).toBe(false);
    expect(isMedPickerFault('ok')).toBe(false);
  });

  it('counts everything else as a failure worth reporting', () => {
    ['denied', 'notdetermined', 'restricted', 'locked', 'invalid', 'failed', 'missing', 'threw', 'hk14']
      .forEach((c) => expect(isMedPickerFault(c)).toBe(true));
  });
});

describe('what the sheet says', () => {
  const note = (code: string, ok = false) => medPickerNote({ ok, code }, PATH);

  it('says nothing about a processed request', () => {
    // `success` is not a grant, so there is nothing to claim; the Health sheet
    // the person just answered is the receipt.
    expect(note('ok', true)).toBeNull();
    expect(medPickerNote({ ok: true, code: 'anything' }, PATH)).toBeNull();
  });

  it('says nothing about a picker the person closed', () => {
    expect(note('canceled')).toBeNull();
  });

  it('tells an empty medication list from a failure, and does not call it an error', () => {
    const n = note('nodata');
    expect(n?.kind).toBe('info');
    // The fix is in the Health app, not here: a dose is named by the
    // medication list, so a phone with no medications in it has nothing to
    // offer and nothing to import.
    expect(n?.text).toContain('Medications');
    expect(n?.text).not.toContain('Could not');
  });

  it('points a refused grant at the place it can be changed', () => {
    ['denied', 'notdetermined'].forEach((c) => {
      const n = note(c);
      expect(n?.kind).toBe('error');
      expect(n?.text).toContain(PATH);
    });
  });

  it('names an unanticipated code in the sentence', () => {
    // The whole reason the code travels: this is the branch that exists
    // because nobody knew what it would be, so the word a support dump and a
    // /fault row carry has to be on screen too.
    expect(note('hk14')?.text).toContain('(hk14)');
    expect(note('failed')?.text).toContain('(failed)');
  });

  it('never leaves a not-success with no words', () => {
    ['nodata', 'denied', 'notdetermined', 'restricted', 'locked', 'unsupported',
      'unavailable', 'missing', 'failed', 'threw', 'hk99']
      .forEach((c) => expect(note(c)?.text).toBeTruthy());
  });
});
