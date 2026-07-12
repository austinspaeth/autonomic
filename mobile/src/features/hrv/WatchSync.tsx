/**
 * Apple Watch sync — stacked over the session card when a watch reading
 * finishes. The wearer took a reading on the watch during the capture window:
 * a Mindfulness/Breathe session (the watch records a heartbeat series with
 * real beat-to-beat RR) or an ECG. Apple Health receives it from the watch a
 * few moments later. This card polls HealthKit for any RR-backed reading near
 * the session window — heartbeat series and ECGs — runs the full HRV pipeline
 * on the RR intervals, and hands off to the normal results card. If more than
 * one reading lands in the window it asks which one to use. Cancel closes the
 * whole capture stack.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SheetControls, SheetFooter } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { usePalette } from '../../theme';
import { health } from '../../lib/health';
import { requestEcgAuth } from '../../lib/health/ecg';
import { rrFromEcg, type RawEcgSample } from '../../lib/health/ecgMetrics';
import { ecgNative } from '../../../modules/ecg-health';
import { fmtTime12 } from '../../lib/dates';
import { HrvResults } from './Results';
import type { SessionConfig } from './Session';

const POLL_MS = 4000;
// A reading counts if it overlaps the session window stretched by 3 minutes on
// each side: the watch clock can drift, hand-off takes a moment, and a Breathe
// session started just before or after the in-app reading is clearly the one
// the wearer means.
const GRACE_MS = 3 * 60000;

type Candidate = {
  key: string;
  kind: 'hrv' | 'ecg';
  rr: number[];
  startMs: number;
  endMs: number;
  avgHr: number | null; // ECG-reported average HR, results fallback when RR is too dirty
};

type Phase = 'syncing' | 'choose' | 'noauth' | 'unavailable' | 'found';

const pad = (n: number) => String(n).padStart(2, '0');
const timeOf = (ms: number) => {
  const d = new Date(ms);
  return fmtTime12(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
};
const durLabel = (c: Candidate) => {
  const sec = Math.max(1, Math.round((c.endMs - c.startMs) / 1000));
  return sec >= 90 ? `${Math.round(sec / 60)} min` : `${sec}s`;
};

export function WatchSyncSheet({ windowStartMs, windowEndMs, config, controls }: {
  windowStartMs: number; windowEndMs: number; config: SessionConfig; controls: SheetControls;
}) {
  const p = usePalette();
  const [phase, setPhase] = useState<Phase>('syncing');
  const [waitedSec, setWaitedSec] = useState(0);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;
    (async () => {
      const hk = health();
      const native = ecgNative();
      if (!hk.available && !native) { setPhase('unavailable'); return; }
      const [hkOk, ecgOk] = await Promise.all([
        hk.available ? hk.requestAuth() : Promise.resolve(false),
        native ? requestEcgAuth() : Promise.resolve(false),
      ]);
      if (cancelled.current) return;
      if (!hkOk && !ecgOk) { setPhase('noauth'); return; }

      const fromMs = windowStartMs - GRACE_MS;
      const toMs = windowEndMs + GRACE_MS;

      const tick = async () => {
        if (cancelled.current || done) return;
        setWaitedSec((s) => s + POLL_MS / 1000);
        const found: Candidate[] = [];
        if (hkOk) {
          const sessions = await hk.readHrvSessions({ fromMs, toMs });
          for (const s of sessions) {
            found.push({ key: `hrv-${s.startMs}`, kind: 'hrv', rr: s.rr, startMs: s.startMs, endMs: s.endMs, avgHr: null });
          }
        }
        if (ecgOk && native) {
          let raw: RawEcgSample[] = [];
          try { raw = await native.queryEcg(fromMs, 10); } catch { raw = []; }
          for (const s of raw) {
            if (s.start > toMs || s.end < fromMs) continue;
            const rr = rrFromEcg(s);
            if (rr.length < 10) continue;
            found.push({ key: `ecg-${s.start}`, kind: 'ecg', rr, startMs: s.start, endMs: s.end, avgHr: s.averageHeartRate ? Math.round(s.averageHeartRate) : null });
          }
        }
        if (cancelled.current || done || !found.length) return;
        done = true;
        if (timer) clearInterval(timer);
        found.sort((a, b) => b.startMs - a.startMs);
        if (found.length === 1) {
          setChosen(found[0]);
          setPhase('found');
        } else {
          setCandidates(found);
          setPhase('choose');
        }
      };
      await tick();
      if (!cancelled.current && !done) timer = setInterval(tick, POLL_MS);
    })();
    return () => { cancelled.current = true; if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'found' && chosen) {
    const durationSec = Math.max(1, Math.round((chosen.endMs - chosen.startMs) / 1000));
    return (
      <HrvResults
        rr={chosen.rr}
        hrSamples={[]}
        config={config}
        durationSec={durationSec}
        watchFallback={chosen.avgHr != null ? { hr: chosen.avgHr } : null}
        controls={controls}
      />
    );
  }

  if (phase === 'choose') {
    return (
      <View style={{ paddingTop: 24, paddingBottom: 8 }}>
        <Text style={{ color: p.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', textAlign: 'center' }}>Apple Watch</Text>
        <Text style={{ fontSize: 25, fontWeight: '800', color: p.text, marginTop: 6, textAlign: 'center' }}>Which reading?</Text>
        <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 28, marginTop: 8, marginBottom: 18 }}>
          More than one watch reading landed near this session. Pick the one to use.
        </Text>
        {candidates.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => { setChosen(c); setPhase('found'); }}
            style={({ pressed }) => ({ backgroundColor: p.surface2, borderRadius: 14, padding: 16, marginBottom: 10, opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>
              {c.kind === 'hrv' ? 'HRV reading' : 'ECG'} · {timeOf(c.startMs)}
            </Text>
            <Text style={{ color: p.textDim, fontSize: 13, marginTop: 3 }}>
              {durLabel(c)} · {c.rr.length} beats
            </Text>
          </Pressable>
        ))}
        <SheetFooter>
          <Button title="Cancel" variant="ghost" onPress={() => controls.closeAll()} />
        </SheetFooter>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', paddingTop: 24, paddingBottom: 8 }}>
      <Text style={{ color: p.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>Apple Watch</Text>
      <Text style={{ fontSize: 25, fontWeight: '800', color: p.text, marginTop: 6, marginBottom: 22 }}>Syncing your reading</Text>

      {phase === 'syncing' ? (
        <>
          <ActivityIndicator size="large" color={p.accent} />
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 28, marginTop: 22 }}>
            Looking in Apple Health for the reading you took on your watch, a Mindfulness breathing session or an ECG. The watch can take a moment to hand it over
            {waitedSec >= 20 ? ', still checking' : ''}…
          </Text>
          {waitedSec >= 60 ? (
            <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 28, marginTop: 12 }}>
              Not seeing it yet. Keep your watch near your phone. Opening the Health app once can nudge the sync.
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Icon name="alert" size={40} color={p.textDim} />
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 28, marginTop: 14 }}>
            {phase === 'unavailable'
              ? 'Watch sync needs an iOS build with Apple Health.'
              : 'Health access is denied. In the Health app, allow Autonomic to read Heart and Electrocardiogram data, then try again.'}
          </Text>
        </>
      )}

      <View style={{ height: 28 }} />
      <View style={{ flexDirection: 'row', alignSelf: 'stretch' }}>
        <Button title="Cancel" variant="ghost" onPress={() => controls.closeAll()} />
      </View>
      <View style={{ height: 12 }} />
    </View>
  );
}
