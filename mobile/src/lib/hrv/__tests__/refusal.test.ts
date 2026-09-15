import { artifactBand, coverageBand, refusalSignature } from '../refusal';

describe('describing a refused reading', () => {
  it('bands artifacts on the decisions the app actually made', () => {
    // The 15 and 30 edges are the camera capture gate and the salvage ceiling,
    // so a row says which side of each one it fell on.
    expect(artifactBand(2)).toBe('art<5');
    expect(artifactBand(12)).toBe('art5-15');
    expect(artifactBand(22)).toBe('art15-30');
    expect(artifactBand(30)).toBe('art15-30');
    expect(artifactBand(31)).toBe('art30-45');
    expect(artifactBand(80)).toBe('art45+');
    expect(artifactBand(NaN)).toBe('unknown');
  });

  it('bands coverage as a share of the session, not in seconds', () => {
    expect(coverageBand(20, 180)).toBe('cov<25');
    expect(coverageBand(80, 180)).toBe('cov25-50');
    expect(coverageBand(120, 180)).toBe('cov50-75');
    expect(coverageBand(175, 180)).toBe('cov75+');
    expect(coverageBand(100, 0)).toBe('cov?');
  });

  it('groups every refusal of the same shape into one signature', () => {
    const a = refusalSignature({ source: 'camera', artifactPct: 21.4, coverageSec: 176, durationSec: 180, hasFields: true });
    const b = refusalSignature({ source: 'camera', artifactPct: 28.9, coverageSec: 171, durationSec: 180, hasFields: true });
    expect(a).toBe(b);
    expect(a).toBe('camera noisy art15-30 cov75+');
  });

  it('tells a noisy reading apart from one that barely got a pulse', () => {
    expect(refusalSignature({ source: 'camera', artifactPct: 8, coverageSec: 30, durationSec: 180, hasFields: true }))
      .toBe('camera thin art5-15 cov<25');
    expect(refusalSignature({ source: 'polar', artifactPct: 40, coverageSec: 300, durationSec: 300, hasFields: true }))
      .toBe('polar noisy art30-45 cov75+');
  });

  it('says so when nothing computed at all', () => {
    expect(refusalSignature({ source: 'camera', artifactPct: 0, coverageSec: 4, durationSec: 180, hasFields: false }))
      .toMatch(/^camera nodata /);
  });

  it('carries no digit run long enough for the fault redaction to eat', () => {
    const sig = refusalSignature({ source: 'camera', artifactPct: 21, coverageSec: 176, durationSec: 180, hasFields: true });
    expect(sig).not.toMatch(/\d{4,}/);
  });

  it('never reports an absent source as a real one', () => {
    expect(refusalSignature({ artifactPct: 20, coverageSec: 100, durationSec: 180, hasFields: true }))
      .toMatch(/^unknown /);
  });
});
