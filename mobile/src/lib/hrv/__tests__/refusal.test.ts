import {
  abandonSignature, artifactBand, attemptSignature, CAPTURE_EVENT_TAGS, CAPTURE_TAGS, coverageBand,
  durationBand, filedSignature, rawBand, refusalSignature, segmentBand,
} from '../refusal';
import { redactMessage } from '../../errorReport';

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

describe('telling the three no-data refusals apart', () => {
  const base = { source: 'camera', artifactPct: 0, coverageSec: 0, hasFields: false, beats: 0 };

  it('bands collected pulse, stretches and length', () => {
    expect(rawBand(20, 300)).toBe('raw<25');
    expect(rawBand(100, 300)).toBe('raw25-50');
    expect(rawBand(230, 300)).toBe('raw50+');
    expect(rawBand(10, 0)).toBe('raw?');
    expect(segmentBand(0)).toBe('seg0');
    expect(segmentBand(1)).toBe('seg1');
    expect(segmentBand(4)).toBe('seg2-4');
    expect(segmentBand(18)).toBe('seg5+');
    expect(durationBand(12)).toBe('dur<1m');
    expect(durationBand(120)).toBe('dur1-4m');
    expect(durationBand(300)).toBe('dur4m+');
  });

  // All three used to be `camera nodata art? cov<25`, one row.
  it('separates a lock that would not hold from a pulse that never came and a reading ended early', () => {
    const flapping = refusalSignature({ ...base, durationSec: 300, rawSec: 230, segments: 18, kind: 'breath' });
    const silent = refusalSignature({ ...base, durationSec: 300, rawSec: 6, segments: 1, kind: 'breath' });
    const early = refusalSignature({ ...base, durationSec: 70, rawSec: 12, segments: 1, kind: 'unstructured' });
    expect(flapping).toBe('camera nodata art? cov<25 raw50+ seg5+ dur4m+ paced');
    expect(silent).toBe('camera nodata art? cov<25 raw<25 seg1 dur4m+ paced');
    expect(early).toBe('camera nodata art? cov<25 raw<25 seg1 dur1-4m free');
    expect(new Set([flapping, silent, early]).size).toBe(3);
  });

  it('keeps the old line when a caller knows no more than it used to', () => {
    expect(refusalSignature({ ...base, durationSec: 180 })).toBe('camera nodata art? cov<25');
  });

  it('describes an abandoned reading against the time it actually ran', () => {
    expect(abandonSignature({ source: 'camera', reason: 'signal', keptSec: 0, rawSec: 40, segments: 4, elapsedSec: 52, kind: 'breath' }))
      .toBe('camera signal cov<25 raw50+ seg2-4 dur<1m paced');
    expect(abandonSignature({ source: 'camera', reason: 'early', keptSec: 18, rawSec: 18, segments: 1, elapsedSec: 20 }))
      .toBe('camera early cov75+ raw50+ seg1 dur<1m');
  });

  it('names an attempt and a filed reading', () => {
    expect(attemptSignature('camera', 'breath')).toBe('camera paced');
    expect(attemptSignature('polar', 'unstructured')).toBe('polar free');
    expect(filedSignature('camera', 'fair', 'breath')).toBe('camera fair paced');
  });

  it('survives the fault redaction untouched, every shape', () => {
    [
      refusalSignature({ ...base, durationSec: 300, rawSec: 230, segments: 18, kind: 'breath' }),
      abandonSignature({ source: 'camera', reason: 'signal', keptSec: 0, rawSec: 40, segments: 4, elapsedSec: 52, kind: 'breath' }),
      attemptSignature('camera', 'breath'),
      filedSignature('camera', 'high', 'unstructured'),
    ].forEach((sig) => expect(redactMessage(sig)).toBe(sig));
  });

  it('lists the tags that are not failures', () => {
    expect(CAPTURE_EVENT_TAGS).toEqual([CAPTURE_TAGS.attempt, CAPTURE_TAGS.filed, CAPTURE_TAGS.salvaged]);
    expect(CAPTURE_EVENT_TAGS).not.toContain(CAPTURE_TAGS.refused);
    expect(CAPTURE_EVENT_TAGS).not.toContain(CAPTURE_TAGS.abandoned);
  });
});
