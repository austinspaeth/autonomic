/**
 * Fetch RR-backed readings from Apple Health: heartbeat series (what a watch
 * Mindfulness/Breathe session records) via the health wrapper, plus ECGs via
 * the local native module. Each source fails soft — a missing module or an
 * unauthorized query never hides the other source's results.
 */
import { health } from './index';
import { rrFromEcg, type RawEcgSample } from './ecgMetrics';
import { ecgNative } from '../../../modules/ecg-health';
import type { RrCandidate } from './rrCandidates';

/** All RR-backed readings overlapping [fromMs, toMs], newest first. */
export async function findRrCandidates({ fromMs, toMs }: { fromMs: number; toMs: number }): Promise<RrCandidate[]> {
  const found: RrCandidate[] = [];

  const hk = health();
  if (hk.available) {
    const sessions = await hk.readHrvSessions({ fromMs, toMs });
    for (const s of sessions) {
      found.push({ key: `hrv-${s.startMs}`, kind: 'hrv', rr: s.rr, startMs: s.startMs, endMs: s.endMs, avgHr: null, sourceName: s.sourceName });
    }
  }

  const native = ecgNative();
  if (native) {
    let raw: RawEcgSample[] = [];
    try { raw = await native.queryEcg(fromMs, 10); } catch { raw = []; }
    for (const s of raw) {
      if (s.start > toMs || s.end < fromMs) continue;
      const rr = rrFromEcg(s);
      if (rr.length < 10) continue;
      found.push({ key: `ecg-${s.start}`, kind: 'ecg', rr, startMs: s.start, endMs: s.end, avgHr: s.averageHeartRate ? Math.round(s.averageHeartRate) : null, sourceName: 'Apple Watch' });
    }
  }

  return found.sort((a, b) => b.startMs - a.startMs);
}
