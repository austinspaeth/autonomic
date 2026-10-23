import {
  advertisesPmd, bytesToBase64, deviceModel, parseControlResponse, parsePpiFrame, ppiToSample, supportsPpi,
  warmupBand, PMD_SERVICE, PPI_START,
} from '../pmd';

/** A PPI frame: type 3, an 8-byte timestamp, frame type 0, then 6-byte samples. */
function frame(samples: { hr: number; pp: number; err?: number; flags?: number }[], frameType = 0): Uint8Array {
  const out = [3, 1, 2, 3, 4, 5, 6, 7, 8, frameType];
  for (const s of samples) {
    out.push(s.hr, s.pp & 0xff, s.pp >> 8, (s.err ?? 10) & 0xff, (s.err ?? 10) >> 8, s.flags ?? 0x06);
  }
  return Uint8Array.from(out);
}

describe('supportsPpi', () => {
  it('reads the PPI bit (type 3) from the features byte', () => {
    expect(supportsPpi(Uint8Array.of(0x0f, 0b0000_1000))).toBe(true);
    // An H10 offers ECG (0) and ACC (2) but no PPI.
    expect(supportsPpi(Uint8Array.of(0x0f, 0b0000_0101))).toBe(false);
  });

  it('refuses anything that is not a features read', () => {
    expect(supportsPpi(Uint8Array.of(0xf0, 0xff))).toBe(false);
    expect(supportsPpi(Uint8Array.of(0x0f))).toBe(false);
  });
});

describe('parseControlResponse', () => {
  it('reads op, type and error from an indication', () => {
    expect(parseControlResponse(Uint8Array.of(0xf0, 0x02, 0x03, 0x00, 0x00))).toEqual({ op: 2, type: 3, error: 0 });
    expect(parseControlResponse(Uint8Array.of(0xf0, 0x02, 0x03, 0x0a))).toEqual({ op: 2, type: 3, error: 10 });
  });

  it('ignores other packets', () => {
    expect(parseControlResponse(Uint8Array.of(0x0f, 0x08))).toBeNull();
  });
});

describe('parsePpiFrame', () => {
  it('reads every sample: hr, interval, error estimate and blocker bit', () => {
    const f = frame([{ hr: 62, pp: 968, err: 12 }, { hr: 63, pp: 1001, flags: 0x07 }]);
    expect(parsePpiFrame(f)).toEqual([
      { hr: 62, ppMs: 968, errorMs: 12, blocker: false },
      { hr: 63, ppMs: 1001, errorMs: 10, blocker: true },
    ]);
  });

  it('refuses frames it cannot read rather than guessing', () => {
    expect(parsePpiFrame(frame([{ hr: 60, pp: 1000 }], 0x80))).toBeNull(); // compressed
    expect(parsePpiFrame(frame([{ hr: 60, pp: 1000 }], 1))).toBeNull(); // another frame type
    const wrongType = frame([{ hr: 60, pp: 1000 }]); wrongType[0] = 1;
    expect(parsePpiFrame(wrongType)).toBeNull();
    expect(parsePpiFrame(frame([{ hr: 60, pp: 1000 }]).slice(0, 13))).toBeNull(); // partial sample
    expect(parsePpiFrame(frame([]))).toBeNull();
  });
});

describe('ppiToSample', () => {
  it('becomes the ordinary strap sample, keeping blocked beats and counting them', () => {
    const s = ppiToSample([
      { hr: 62, ppMs: 968, errorMs: 10, blocker: false },
      { hr: 0, ppMs: 1400, errorMs: 80, blocker: true },
    ]);
    expect(s).toEqual({ hr: 62, rr: [968, 1400], blocked: 1 });
  });

  it('drops intervals no heart could produce', () => {
    expect(ppiToSample([
      { hr: 60, ppMs: 0, errorMs: 0, blocker: false },
      { hr: 60, ppMs: 5000, errorMs: 0, blocker: false },
    ]).rr).toEqual([]);
  });
});

describe('helpers', () => {
  it('encodes the start command for ble-plx', () => {
    expect(bytesToBase64(PPI_START)).toBe('AgM=');
    expect(bytesToBase64(Uint8Array.of(1, 2, 3))).toBe('AQID');
    expect(bytesToBase64(Uint8Array.of(0xff))).toBe('/w==');
  });

  it('bands the warm-up', () => {
    expect(warmupBand(9000)).toBe('first<15s');
    expect(warmupBand(24000)).toBe('first15-30s');
    expect(warmupBand(31000)).toBe('first30-45s');
    expect(warmupBand(70000)).toBe('first45s+');
  });

  it('names the model without the serial', () => {
    expect(deviceModel('Polar 360 1A2B3C4D')).toBe('Polar 360');
    expect(deviceModel('Polar Sense B36CF323')).toBe('Polar Sense');
    expect(deviceModel(null)).toBe('unknown');
  });

  it('spots the PMD service in an advertisement', () => {
    expect(advertisesPmd([PMD_SERVICE.toUpperCase()])).toBe(true);
    expect(advertisesPmd(['180d'])).toBe(false);
  });
});
