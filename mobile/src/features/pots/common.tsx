/**
 * Shared pieces for the in-app POTS captures (guided stand test + orthostatic
 * episode) run with a Bluetooth chest strap — the phone twins of the watch
 * companion's flows. Presented exactly like a live HRV capture: a stacked
 * card modal with a progress ring, big timer, live stats, and a results card
 * that rises on completion and saves through the same journal + waveform
 * sidecar path a watch result takes.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { SheetControls, SheetFooter } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { NoteDraftCard, ReadingSummary } from '../../components/summary';
import { usePalette, GRADE_COLORS } from '../../theme';
import { BANDS, catFromBands } from '../../lib/scoring';
import { ble } from '../../lib/ble/manager';
import { getState, storeWaveform, upsertEntry } from '../../store/store';
import { splitWaveform } from '../../lib/waveforms';
import type { DayRecord, Entry } from '../../lib/types';

/** ~1 s strong buzz (same trick as the HRV session): a dense train of heavy
 *  impacts reads as one sustained completion buzz. */
export async function completionBuzz() {
  for (let i = 0; i < 10; i++) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** A short attention buzz for stage changes (stand-up prompt, transitions). */
export function stageBuzz() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export interface StrapStream {
  connected: boolean;
  /** Latest HR shown pre-start as the connection cue (like the HRV card). */
  hr: number | null;
  /** Latest HR only if it arrived in the last ~2.5 s — sensor gaps return
   *  null so a stale value is never recorded as a live sample. */
  freshHr: () => number | null;
}

/**
 * Connect to the saved strap the moment the card opens (retrying quietly until
 * it answers) and stream HR. `onSample` also drives the session clock: while
 * backgrounded iOS freezes JS timers but BLE notifications keep arriving, so
 * ticking from samples keeps the test honest — mirror of the HRV session.
 * The caller owns disconnect (on finish/unmount).
 */
export function useStrapHr(onSample: (bpm: number) => void): StrapStream {
  const [connected, setConnected] = useState(false);
  const [hr, setHr] = useState<number | null>(null);
  const lastRef = useRef<{ bpm: number; at: number } | null>(null);
  const cbRef = useRef(onSample);
  cbRef.current = onSample;

  useEffect(() => {
    const saved = getState().settings.lastBleDeviceId;
    const mgr = ble();
    if (!saved || !mgr.available) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      if (!alive) return;
      try {
        await mgr.requestPermissions();
        await mgr.connect(
          saved,
          (s) => {
            setConnected(true);
            if (s.hr) {
              setHr(s.hr);
              lastRef.current = { bpm: s.hr, at: Date.now() };
            }
            cbRef.current(s.hr);
          },
          () => {
            setConnected(false);
            if (alive) retry = setTimeout(attempt, 2000);
          },
        );
      } catch {
        setConnected(false);
        if (alive) retry = setTimeout(attempt, 3000);
      }
    };
    attempt();
    return () => { alive = false; if (retry) clearTimeout(retry); };
  }, []);

  const freshHr = () => {
    const s = lastRef.current;
    return s && Date.now() - s.at < 2500 ? s.bpm : null;
  };
  return { connected, hr, freshHr };
}

/** The HRV session's progress ring (R=108) with arbitrary center content. */
export function SessionRing({ frac, color, children }: { frac: number; color?: string; children: React.ReactNode }) {
  const p = usePalette();
  const R = 108, SW = 9, C = 2 * Math.PI * R;
  const size = 2 * (R + SW);
  const f = Math.min(1, Math.max(0, frac));
  return (
    <View style={{ width: size, height: size, marginTop: 18, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={R + SW} cy={R + SW} r={R} stroke={p.surface2} strokeWidth={SW} fill="none" />
        <Circle cx={R + SW} cy={R + SW} r={R} stroke={color || p.accent} strokeWidth={SW} fill="none" strokeLinecap="round" strokeDasharray={`${C}`} strokeDashoffset={C * (1 - f)} transform={`rotate(-90 ${R + SW} ${R + SW})`} />
      </Svg>
      {children}
    </View>
  );
}

/** Stat column identical to the HRV session's HR/HRV/Beats row. */
export function Stat({ label, value, unit, color }: { label: string; value: string; unit: string; color?: string }) {
  const p = usePalette();
  return (
    <View style={{ alignItems: 'center', minWidth: 76 }}>
      <Text style={{ color: p.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: color || p.text, fontSize: 29, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ color: p.textDim, fontSize: 11 }}>{unit}</Text>
    </View>
  );
}

export const fmtCountdown = (sec: number) => {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const signedDelta = (d: number) => (d > 0 ? `+${Math.round(d)}` : String(Math.round(d)));

/** Live Δ color from the same grade bands the saved reading is scored with. */
export function deltaColor(d: number | null, bands: 'standDelta' | 'orthoIncrease'): string | undefined {
  if (d == null) return undefined;
  const cat = catFromBands(d, BANDS[bands]);
  return cat ? GRADE_COLORS[cat] : undefined;
}

/**
 * Results card stacked over the finished session (mirror of HrvResults): the
 * built entry previews through the same ReadingSummary the journal row opens,
 * with its HR series still inline.
 *
 * Like HrvResults, the reading is SAVED THE MOMENT THIS CARD OPENS — split into
 * the waveform sidecar before the journal write, exactly like a synced watch
 * result. There is no keep-or-discard question; deleting it is one tap on the
 * journal row.
 */
export function PotsResultsSheet({ entry, dayKey, title, sub, controls }: {
  entry: Entry; dayKey: string; title: string; sub: string; controls: SheetControls;
}) {
  const p = usePalette();
  const ctx = { sex: getState().profile.sex, height: getState().profile.height };

  // Sparklines should already include this result — hand the summary a days map
  // with the reading appended to its day.
  const daysWithCurrent = useMemo(() => {
    const days = getState().days;
    const day = days[dayKey] as DayRecord | undefined;
    return { ...days, [dayKey]: { ...(day || {}), readings: [...((day && day.readings) || []), entry] } } as typeof days;
  }, [entry, dayKey]);

  // The note is written onto the already-saved entry; the draft is held here
  // only to render it.
  const [note, setNote] = useState('');
  /** The persisted (waveform-stripped) entry, once the auto-save has run. */
  const saved = useRef<Entry | null>(null);
  const shown = useMemo(() => (note ? { ...entry, note } : entry), [entry, note]);

  useEffect(() => {
    if (saved.current) return;
    const { entry: stripped, waveform } = splitWaveform(entry);
    if (waveform) storeWaveform(stripped.id, waveform);
    saved.current = stripped;
    upsertEntry(dayKey, 'readings', stripped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNote = (next: string) => {
    setNote(next);
    const e = saved.current;
    if (e) upsertEntry(dayKey, 'readings', { ...e, note: next });
  };

  return (
    <View>
      <Text style={{ fontSize: 25, fontWeight: '800', color: p.text, marginBottom: 4 }}>{title}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 4 }}>{sub}</Text>
      <Text style={{ color: p.textDim, fontSize: 13, marginBottom: 16 }}>Saved to your journal</Text>
      <ReadingSummary r={shown} days={daysWithCurrent} ctx={ctx} />
      <NoteDraftCard note={note} onChange={onNote} />
      <SheetFooter>
        <Button title="Done" variant="primary" onPress={() => controls.closeAll()} />
      </SheetFooter>
    </View>
  );
}
