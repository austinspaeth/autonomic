/**
 * Import an HRV reading from Apple Health after the fact — the recovery path
 * when a watch reading never synced into a live session (permission granted too
 * late, hand-off delay, or the app was closed). Lists today's RR-backed
 * readings (heartbeat series from Mindfulness/Breathe sessions, plus ECGs);
 * tapping one runs the normal HRV pipeline and opens the standard results card,
 * stamped with the time the watch recorded it. Opened from the HRV setup sheet,
 * so the kind chosen there (training or baseline) carries through to the saved
 * reading.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSheets } from '../../components/Sheet';
import { Muted } from '../../components/ui';
import { usePalette } from '../../theme';
import { health, healthAppName } from '../../lib/health';
import { dayStartMs, isPickable, type RrCandidate } from '../../lib/health/rrCandidates';
import { findRrCandidates } from '../../lib/health/rrSearch';
import { getState } from '../../store/store';
import { keyOf, pad, todayKey } from '../../lib/dates';
import { defaultPeriod } from '../../lib/period';
import { CandidateRow } from './WatchSync';
import { HrvResults } from './Results';
import { BREATH_STYLE, type SessionConfig } from './Session';

export function HealthRrImportSheet({ kind }: { kind: 'breath' | 'unstructured' }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const [loading, setLoading] = useState(true);
  const [cands, setCands] = useState<RrCandidate[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // One call covers the whole set, ECG included; silent once determined.
      // `force` because the user opened this import card — a sheet here is
      // expected, so the quiet checks' once-per-launch pacing shouldn't apply.
      await health().requestAuth({ force: true });
      const now = Date.now();
      const found = await findRrCandidates({ fromMs: dayStartMs(now), toMs: now });
      // A reading already saved to today's journal (watch-synced or previously
      // imported, stamped with its start time) drops out of the list.
      const logged = new Set(
        (getState().days[todayKey()]?.readings || [])
          .filter((r) => r.type === 'hrv' || r.type === 'breathHrv')
          .map((r) => r.time as string),
      );
      // Too-short readings never make the list: the setup copy asks for a
      // 5-minute session, and anything under four can't be scored honestly.
      const fresh = found.filter(isPickable).filter((c) => {
        const d = new Date(c.startMs);
        return !logged.has(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      });
      if (alive) setCands(fresh);
    })().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const pick = (c: RrCandidate) => {
    const dk = keyOf(new Date(c.startMs));
    const config: SessionConfig = {
      kind,
      source: 'watch',
      style: kind === 'breath' ? BREATH_STYLE : undefined,
      period: defaultPeriod(kind === 'breath' ? 'breathHrv' : 'hrv', dk, new Date(c.startMs).getHours()),
    };
    const durationSec = Math.max(1, Math.round((c.endMs - c.startMs) / 1000));
    openSheet((sc) => (
      <HrvResults
        rr={c.rr}
        hrSamples={[]}
        config={config}
        durationSec={durationSec}
        startedAtMs={c.startMs}
        watchFallback={c.avgHr != null ? { hr: c.avgHr } : null}
        controls={sc}
      />
    ), { hideClose: true });
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 4 }}>{`Import from ${healthAppName()}`}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 19, marginBottom: 16 }}>
        {"Today's readings with beat-to-beat data, from a Mindfulness breathing session or an ECG on your watch. Sessions under 4 minutes are left out, they're too short to score. Tap one to evaluate and save it."}
      </Text>
      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 30, gap: 12 }}>
          <ActivityIndicator color={p.accent} />
          <Text style={{ color: p.textDim, fontSize: 14 }}>{`Looking in ${healthAppName()}…`}</Text>
        </View>
      ) : cands.length === 0 ? (
        <Muted>
          {'No beat-to-beat readings of 4 minutes or longer found today. Take a 5-minute one with the Mindfulness (Breathe) or ECG app on your watch, give it a minute or two to sync, then check that Autonomic can read your heart data: in the Health app tap your picture, then Privacy, then Apps, then Autonomic, and turn everything on, including Beat-to-Beat Measurements.'}
        </Muted>
      ) : (
        cands.map((c) => <CandidateRow key={c.key} c={c} onPress={() => pick(c)} />)
      )}
    </View>
  );
}
