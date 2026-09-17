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
    const a = refusalSignature({ source: 'camera', artifactPct: 21.4, coverageSec: 176, durationSec: 180, hasFields: true, beats: 200 });
    const b = refusalSignature({ source: 'camera', artifactPct: 28.9, coverageSec: 171, durationSec: 180, hasFields: true, beats: 200 });
    expect(a).toBe(b);
    expect(a).toBe('camera noisy art15-30 cov75+');
  });

  it('tells a noisy reading apart from one that barely got a pulse', () => {
    expect(refusalSignature({ source: 'camera', artifactPct: 8, coverageSec: 30, durationSec: 180, hasFields: true, beats: 200 }))
      .toBe('camera thin art5-15 cov<25');
    expect(refusalSignature({ source: 'polar', artifactPct: 40, coverageSec: 300, durationSec: 300, hasFields: true, beats: 320 }))
      .toBe('polar noisy art30-45 cov75+');
  });

  it('says so when nothing computed at all', () => {
    expect(refusalSignature({ source: 'camera', artifactPct: 0, coverageSec: 4, durationSec: 180, hasFields: false, beats: 0 }))
      .toMatch(/^camera nodata /);
  });

  // `computeHrv` divides the flagged beats by the KEPT beats, so a reading that
  // kept none arrives claiming 0% — the cleanest band there is, on a reading
  // with no signal in it at all. Across a report that reads as proof that
  // nothing is ever refused for noise.
  it('never reports an artifact rate computed over no beats as a clean one', () => {
    expect(refusalSignature({ source: 'camera', artifactPct: 0, coverageSec: 4, durationSec: 180, hasFields: false, beats: 0 }))
      .toBe('camera nodata art? cov<25');
  });

  // Not the same question as `hasFields`: a reading can keep beats and still
  // compute no metrics, and there the rate is real and worth having.
  it('still bands the rate when beats were kept but nothing computed', () => {
    expect(refusalSignature({ source: 'watch', artifactPct: 22, coverageSec: 80, durationSec: 180, hasFields: false, beats: 40 }))
      .toBe('watch nodata art15-30 cov25-50');
  });

  it('carries no digit run long enough for the fault redaction to eat', () => {
    const sig = refusalSignature({ source: 'camera', artifactPct: 21, coverageSec: 176, durationSec: 180, hasFields: true, beats: 200 });
    expect(sig).not.toMatch(/\d{4,}/);
  });

  it('never reports an absent source as a real one', () => {
    expect(refusalSignature({ artifactPct: 20, coverageSec: 100, durationSec: 180, hasFields: true, beats: 200 }))
      .toMatch(/^unknown /);
  });
});
