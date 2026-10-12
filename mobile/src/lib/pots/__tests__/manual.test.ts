import { buildManualStandFields, parseBp, parseHr, standReadingRows } from '../manual';

describe('hand-entered stand test', () => {
  it('reads a pulse and refuses what cannot be one', () => {
    expect(parseHr(' 72 ')).toBe(72);
    expect(parseHr('')).toBeNull();
    expect(parseHr('7')).toBeNull();
    expect(parseHr('20')).toBeNull();
    expect(parseHr('300')).toBeNull();
    expect(parseHr('7x')).toBeNull();
  });

  it('treats blood pressure as optional but never half-entered', () => {
    expect(parseBp('', '')).toBeNull();
    expect(parseBp('118', '76')).toEqual({ sys: 118, dia: 76 });
    expect(parseBp('118', '')).toBe('invalid');
    expect(parseBp('76', '118')).toBe('invalid');
    expect(parseBp('999', '80')).toBe('invalid');
  });

  it('grades the last standing reading as the sustained rise', () => {
    const f = buildManualStandFields({
      baselineHr: 64, baselineBp: { sys: 112, dia: 70 }, restSeconds: 300, age: 34, sex: 'female',
      readings: [{ min: 3, hr: 104 }, { min: 1, hr: 96 }, { min: 10, hr: 98, sys: 108, dia: 72 }, { min: 5, hr: 101 }],
    })!;
    expect(f.baselineHr).toBe(64);
    expect(f.peakHr).toBe(104);
    expect(f.peakDelta).toBe(40);
    expect(f.sustainedDelta).toBe(34);
    expect(f.metThreshold).toBe(true);
    expect(f.maxHrReached).toBe(104);
    expect(f.standAt).toBe(300);
    expect(f.endedEarly).toBeUndefined();
    expect(f.baselineUnstable).toBeUndefined();
    expect(f.restSys).toBe(112);
    expect((f.standReadings as { min: number }[]).map((r) => r.min)).toEqual([1, 3, 5, 10]);
    // Five typed figures are not a trace.
    expect(f.sampledHr).toBeUndefined();
  });

  it('flags a test stopped before the last mark and a skipped rest', () => {
    const f = buildManualStandFields({
      baselineHr: 70, baselineBp: null, restSeconds: 20, age: null,
      readings: [{ min: 1, hr: 88 }, { min: 3, hr: 92 }],
    })!;
    expect(f.endedEarly).toBe(true);
    expect(f.baselineUnstable).toBe(true);
    expect(f.sustainedDelta).toBe(22);
    expect(f.metThreshold).toBe(false);
    expect(f.restSys).toBeUndefined();
  });

  it('has nothing to keep without a standing reading', () => {
    expect(buildManualStandFields({ baselineHr: 70, baselineBp: null, restSeconds: 300, age: 30, readings: [] })).toBeNull();
  });

  it('lists the readings for the result card, and none for a streamed test', () => {
    const f = buildManualStandFields({
      baselineHr: 64, baselineBp: { sys: 112, dia: 70 }, restSeconds: 300, age: 34,
      readings: [{ min: 1, hr: 96 }, { min: 3, hr: 104, sys: 108, dia: 72 }],
    })!;
    expect(standReadingRows(f)).toEqual([
      { label: 'Lying down', value: '64 bpm · 112/70' },
      { label: 'Standing 1 min', value: '96 bpm' },
      { label: 'Standing 3 min', value: '104 bpm · 108/72' },
    ]);
    expect(standReadingRows({ baselineHr: 64 })).toEqual([]);
  });
});
