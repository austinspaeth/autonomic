/**
 * Results screen after a live reading: runs the HRV pipeline on the collected
 * RR, builds a reading identical to a typed-in one (same field keys), and shows
 * the hero autonomic score, power distribution, tachogram waveform, and graded
 * metric rows. Save writes the metrics to today's readings and the raw arrays
 * to the waveform sidecar (the journal blob never carries them); optional
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
import { getState, storeWaveform, upsertEntry } from '../../store/store';
import { splitWaveform } from '../../lib/waveforms';
import { health, healthAppName } from '../../lib/health';
import { keyOf, nowTime, pad, todayKey, uid } from '../../lib/dates';
import type { DayRecord, Entry } from '../../lib/types';
import type { SessionConfig } from './Session';

const CONFIDENCE_LABEL: Record<'high' | 'fair' | 'low', string> = {
  high: 'High confidence',
  fair: 'Fair confidence',
  low: 'Low confidence',
};

export function HrvResults({ rr, segmentStarts, hrSamples, sdnnSamples, config, durationSec, startedAtMs, watchFallback, controls }: {
  rr: number[]; hrSamples: { t: number; bpm: number }[]; sdnnSamples?: { t: number; sdnn: number }[];
  /** Indices into `rr` where camera tracking resumed after a dropout. */
  segmentStarts?: number[];
  config: SessionConfig; durationSec: number;
  /** When the reading actually began (watch-synced / imported readings) — the
   *  entry is stamped with this time and day, not the moment Save is pressed. */
  startedAtMs?: number | null;
  watchFallback: { sdnn?: number; hr?: number } | null; controls: SheetControls;
}) {
  const p = usePalette();
  const toast = useToast();
  const [writeHealth, setWriteHealth] = useState(false);
  const ctx = { sex: getState().profile.sex, height: getState().profile.height };

  const result = useMemo(
    () => computeHrv(rr, { style: config.style, source: config.source, durationSec, segmentStarts }),
    [rr, segmentStarts, config.style, config.source, durationSec],
  );

  // The day + time the reading physically happened — never the day the journal
  // happens to be showing, and for watch-synced/imported readings the moment
  // the watch recorded it, not the moment Save is pressed.
  const startedAt = startedAtMs ? new Date(startedAtMs) : null;
  const dk = startedAt ? keyOf(startedAt) : todayKey();

  // Build the reading with the same keys the manual form uses.
  const reading = useMemo<Entry>(() => {
    const type = config.kind === 'breath' ? 'breathHrv' : 'hrv';
    const note = config.source === 'watch' ? 'Captured via Apple Watch'
      : config.source === 'camera' ? 'Captured via device camera (PPG)'
      : `Captured via ${getState().settings.lastBleDeviceName || 'Bluetooth device'}`;
    const base: Entry = {
      id: uid(), type, time: startedAt ? `${pad(startedAt.getHours())}:${pad(startedAt.getMinutes())}` : nowTime(),
      period: config.period || 'Other',
      note,
      // Capture source is stamped on the reading so camera (PPG) readings stay
      // distinguishable downstream (filtering / de-weighting in Analysis later).
      source: config.source, durationSec,
      rrRaw: rr, rrClean: result.rrClean, sampledHr: hrSamples,
    };
    if (segmentStarts && segmentStarts.length) base.rrSegments = segmentStarts;
    if (config.source === 'polar' && getState().settings.lastBleDeviceName) {
      base.sourceName = getState().settings.lastBleDeviceName;
    }
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
    const day = days[dk] as DayRecord | undefined;
    return { ...days, [dk]: { ...(day || {}), readings: [...((day && day.readings) || []), reading] } } as typeof days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading]);

  const save = async () => {
    // The preview `reading` carries its arrays inline (ReadingSummary renders
    // from them pre-save); persisting splits them into the waveform sidecar,
    // written before the entry so the journal never references a missing blob.
    const { entry, waveform } = splitWaveform(reading);
    if (waveform) storeWaveform(entry.id, waveform);
    upsertEntry(dk, 'readings', entry);
    if (writeHealth && health().available) {
      const sdnn = parseFloat(reading.sdnn as string);
      const rmssd = parseFloat(reading.rmssd as string);
      const hr = parseFloat((reading.hr || reading.avgHr) as string);
      // iOS stores SDNN (HealthKit's HRV type), Android RMSSD (Health
      // Connect's) — pass both and let the platform impl pick.
      if (!isNaN(sdnn) || !isNaN(rmssd)) {
        try {
          await health().writeHrvSession({
            sdnnMs: isNaN(sdnn) ? undefined : sdnn,
            rmssdMs: isNaN(rmssd) ? undefined : rmssd,
            avgHr: isNaN(hr) ? undefined : hr,
            startISO: new Date(startedAtMs || (Date.now() - durationSec * 1000)).toISOString(),
            durationSec,
          });
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

      {/* Camera readings are stitched from however much clean pulse we got, so
          say how much that was. A number built from 90 s of a 3 min attempt is
          a different claim than one built from all of it. */}
      {config.source === 'camera' && enoughData ? (
        <Text style={{ color: p.textDim, fontSize: 13, marginTop: -10, marginBottom: 16 }}>
          {`${CONFIDENCE_LABEL[result.confidence]} · ${Math.round(result.coverageSec)}s of usable pulse`
            + (result.segmentsDropped ? ` · ${result.segmentsDropped} unusable stretch${result.segmentsDropped > 1 ? 'es' : ''} discarded` : '')
            + (result.segmentsUsed > 1 ? ` · stitched from ${result.segmentsUsed} segments` : '')}
        </Text>
      ) : null}

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
              <Button title={writeHealth ? `✓ Will write to ${healthAppName()}` : `Also write to ${healthAppName()}`} variant={writeHealth ? 'default' : 'ghost'} onPress={() => setWriteHealth((v) => !v)} />
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
