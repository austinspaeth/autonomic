/**
 * Results screen after a live reading: runs the HRV pipeline on the collected
 * RR, builds a reading identical to a typed-in one (same field keys), and shows
 * the hero autonomic score, power distribution, tachogram waveform, and graded
 * metric rows. Save writes it to today's readings (with raw data); optional
 * "Write to Apple Health" logs SDNN + a mindful session.
 */
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { SheetControls, SheetFooter } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { ReadingSummary } from '../../components/summary';
import { useToast } from '../../components/Toast';
import { usePalette } from '../../theme';
import { computeHrv } from '../../lib/hrv';
import { computeScores } from '../../lib/scoring';
import { getState, upsertEntry } from '../../store/store';
import { getCurrentKey } from '../../store/nav';
import { health } from '../../lib/health';
import { addDays, defaultTimeFor, fmtTime12, nowTime, todayKey, uid } from '../../lib/dates';
import type { DayRecord, Entry } from '../../lib/types';
import type { SessionConfig } from './Session';

export function HrvResults({ rr, hrSamples, sdnnSamples, config, durationSec, watchFallback, controls }: {
  rr: number[]; hrSamples: { t: number; bpm: number }[]; sdnnSamples?: { t: number; sdnn: number }[];
  config: SessionConfig; durationSec: number;
  watchFallback: { sdnn?: number; hr?: number } | null; controls: SheetControls;
}) {
  const p = usePalette();
  const toast = useToast();
  const [writeHealth, setWriteHealth] = useState(false);
  const ctx = { sex: getState().profile.sex, height: getState().profile.height };

  const result = useMemo(() => computeHrv(rr, { style: config.style }), [rr, config.style]);

  // Build the reading with the same keys the manual form uses.
  const reading = useMemo<Entry>(() => {
    const type = config.kind === 'breath' ? 'breathHrv' : 'hrv';
    const dk = getCurrentKey();
    // Capturing for yesterday just after midnight: pin the time to 23:59 so
    // the reading sorts inside that day, and note the real clock time.
    const afterMidnight = dk !== todayKey() && dk === addDays(todayKey(), -1) && new Date().getHours() < 6;
    let note = config.source === 'watch' ? 'Captured via Apple Watch ECG'
      : config.source === 'camera' ? 'Captured via phone camera (PPG)'
      : 'Captured via chest strap';
    if (afterMidnight) note += ` · Taken after midnight (actual time ${fmtTime12(nowTime())})`;
    const base: Entry = {
      id: uid(), type, time: defaultTimeFor(dk),
      period: config.period || 'Other',
      note,
      // Capture source is stamped on the reading so camera (PPG) readings stay
      // distinguishable downstream (filtering / de-weighting in Analysis later).
      source: config.source, durationSec,
      rrRaw: rr, rrClean: result.rrClean, sampledHr: hrSamples,
    };
    if (sdnnSamples && sdnnSamples.length) base.sampledSdnn = sdnnSamples;
    if (config.kind === 'breath' && config.style) base.style = config.style;
    if (result.ok || Object.keys(result.fields).length) {
      Object.assign(base, result.fields);
    } else if (watchFallback) {
      if (watchFallback.sdnn != null) base.sdnn = String(watchFallback.sdnn);
      if (watchFallback.hr != null) { base.hr = String(watchFallback.hr); base.avgHr = String(watchFallback.hr); }
    }
    base.scores = computeScores(base, ctx);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The reading isn't saved until "Save", but its sparklines should already
  // include this result — so hand ReadingSummary a days map with the live
  // reading appended to today's readings.
  const daysWithCurrent = useMemo(() => {
    const days = getState().days;
    const dk = getCurrentKey();
    const day = days[dk] as DayRecord | undefined;
    return { ...days, [dk]: { ...(day || {}), readings: [...((day && day.readings) || []), reading] } } as typeof days;
  }, [reading]);

  const save = async () => {
    upsertEntry(getCurrentKey(), 'readings', reading);
    if (writeHealth && health().available) {
      const sdnn = parseFloat(reading.sdnn as string);
      const hr = parseFloat((reading.hr || reading.avgHr) as string);
      if (!isNaN(sdnn)) {
        try {
          await health().writeHrvSession({ sdnnMs: sdnn, avgHr: isNaN(hr) ? 60 : hr, startISO: new Date(Date.now() - durationSec * 1000).toISOString(), durationSec });
        } catch { /* graceful */ }
      }
    }
    toast('Reading saved');
    controls.closeAll(); // close the results card AND the capture card beneath it
  };

  const enoughData = result.ok || (watchFallback && (watchFallback.sdnn != null));

  return (
    <View>
      <Text style={{ fontSize: 25, fontWeight: '800', color: p.text, marginBottom: 4 }}>Reading complete</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16 }}>
        {`${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')} captured · ${rr.length} beats · ${Math.round(result.artifactPct)}% artifacts${config.source === 'camera' ? ' · Camera (PPG)' : ''}`}
      </Text>

      {!enoughData ? (
        <View style={{ backgroundColor: p.surface2, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ color: p.text, fontWeight: '700', marginBottom: 4 }}>Not enough clean data</Text>
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 19 }}>{result.reason || 'Try again with the strap snug and stay still.'}</Text>
        </View>
      ) : null}

      <ReadingSummary r={reading} days={daysWithCurrent} ctx={ctx} />

      {/* The whole action cluster rides the fixed footer — no scrolling to
          the bottom to find Save. */}
      <SheetFooter>
        <View style={{ flex: 1 }}>
          {/* Watch readings came FROM Apple Health — no need to write them back. */}
          {health().available && config.source !== 'watch' ? (
            <View style={{ flexDirection: 'row', marginBottom: 10 }}>
              <Button title={writeHealth ? '✓ Will write to Apple Health' : 'Also write to Apple Health'} variant={writeHealth ? 'default' : 'ghost'} onPress={() => setWriteHealth((v) => !v)} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Discard" variant="danger" onPress={() => controls.closeAll()} />
            <Button title="Save reading" variant="primary" onPress={save} />
          </View>
        </View>
      </SheetFooter>
    </View>
  );
}

export { todayKey };
