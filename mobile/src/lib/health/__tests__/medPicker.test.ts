import {
  isMedPickerFault, medPickerNote, normalizeMedPicker, outcomeOf,
} from '../medPicker';

const PATH = 'Apple Health → your profile → Apps';

describe('normalizeMedPicker', () => {
  it('reads the structured answer', () => {
    expect(normalizeMedPicker({ ok: false, code: 'canceled' }))
      .toEqual({ ok: false, code: 'canceled' });
    expect(normalizeMedPicker({ ok: true, code: 'ok' }))
      .toEqual({ ok: true, code: 'ok' });
    expect(normalizeMedPicker({ ok: false, code: 'nodata', message: 'No data available' }))
      .toEqual({ ok: false, code: 'nodata', message: 'No data available' });
  });

  it('reads an older binary’s bare boolean as ok/failed', () => {
    // The JS ships OTA and can reach a binary the Swift has not. ok/failed is
    // exactly what that binary knew.
    expect(normalizeMedPicker(true)).toEqual({ ok: true, code: 'ok' });
    expect(normalizeMedPicker(false)).toEqual({ ok: false, code: 'failed' });
  });

  it('reads an absent native function as its own code', () => {
    expect(normalizeMedPicker(undefined)).toEqual({ ok: false, code: 'missing' });
    expect(normalizeMedPicker(null)).toEqual({ ok: false, code: 'missing' });
  });

  it('never throws, whatever it is handed', () => {
    [0, '', 'yes', NaN, [], { }, { ok: 'maybe' }].forEach((v) => {
      expect(() => normalizeMedPicker(v)).not.toThrow();
      expect(typeof normalizeMedPicker(v).code).toBe('string');
      expect(normalizeMedPicker(v).code).not.toBe('');
    });
  });

  it('derives ok from the code rather than trusting the flag', () => {
    // A payload claiming success with a failure code is not a success.
    expect(normalizeMedPicker({ ok: true, code: 'canceled' }).ok).toBe(false);
  });

  it('caps the message', () => {
    const long = 'x'.repeat(400);
    expect(normalizeMedPicker({ ok: false, code: 'failed', message: long }).message!.length)
      .toBe(140);
  });
});

describe('outcomeOf', () => {
  it('derives ok rather than reading it back', () => {
    expect(outcomeOf({ code: 'ok', at: 1 })).toEqual({ ok: true, code: 'ok' });
    expect(outcomeOf({ code: 'nodata', at: 1 })).toEqual({ ok: false, code: 'nodata' });
  });

  it('is null with nothing recorded', () => {
    expect(outcomeOf(null)).toBeNull();
    expect(outcomeOf(undefined)).toBeNull();
    expect(outcomeOf({ code: '', at: 1 })).toBeNull();
  });
});

describe('isMedPickerFault', () => {
  it('leaves the two outcomes that are not failures alone', () => {
    // A cancel is the commonest outcome there is — the picker presenting and
    // being answered IS the feature working — and an empty medication list is
    // the person's own data. A /fault row for either would count people using
    // the feature as people hitting a bug.
    ['ok', 'canceled', 'nodata'].forEach((c) => expect(isMedPickerFault(c)).toBe(false));
  });

  it('reports everything else', () => {
    ['denied', 'notdetermined', 'restricted', 'locked', 'unsupported', 'unavailable',
      'invalid', 'missing', 'failed', 'hk42'].forEach((c) => expect(isMedPickerFault(c)).toBe(true));
  });
});

describe('medPickerNote', () => {
  it('says nothing when there is nothing to claim', () => {
    // `success` is not a grant, and the Health sheet the person just answered
    // is the receipt — so neither a success nor a cancel gets a sentence.
    expect(medPickerNote({ ok: true, code: 'ok' }, PATH)).toBeNull();
    expect(medPickerNote({ ok: false, code: 'canceled' }, PATH)).toBeNull();
    expect(medPickerNote(null, PATH)).toBeNull();
    expect(medPickerNote(undefined, PATH)).toBeNull();
  });

  it('treats an empty medication list as information, not an error', () => {
    const n = medPickerNote({ ok: false, code: 'nodata' }, PATH)!;
    expect(n.kind).toBe('info');
    // The fix is in the Health app, and the copy has to say where.
    expect(n.text).toContain('Medications');
  });

  it('points a permission problem at the path it is handed', () => {
    // Passed in, so this module stays pure.
    ['denied', 'notdetermined'].forEach((code) => {
      const n = medPickerNote({ ok: false, code }, PATH)!;
      expect(n.kind).toBe('error');
      expect(n.text).toContain(PATH);
    });
  });

  it('gives every not-success its own words', () => {
    const codes = ['nodata', 'denied', 'notdetermined', 'restricted', 'locked',
      'unsupported', 'unavailable', 'missing', 'invalid', 'failed', 'hk99'];
    const seen = new Set<string>();
    codes.forEach((code) => {
      const n = medPickerNote({ ok: false, code }, PATH);
      expect(n).not.toBeNull();
      expect(n!.text.length).toBeGreaterThan(20);
      seen.add(n!.text);
    });
    // Nothing is left sharing a sentence except the default branch's two,
    // which name their own code and so still differ.
    expect(seen.size).toBe(codes.length);
  });

  it('puts the code in the default branch’s sentence', () => {
    // That branch exists because nobody knew what would land in it, so the
    // word a support dump and a /fault row carry must be on screen too.
    expect(medPickerNote({ ok: false, code: 'hk77' }, PATH)!.text).toContain('hk77');
    expect(medPickerNote({ ok: false, code: 'invalid' }, PATH)!.text).toContain('invalid');
  });
});
