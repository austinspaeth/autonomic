/**
 * Results screen after a live reading: runs the HRV pipeline on the collected
 * RR, builds a reading identical to a typed-in one (same field keys), and shows
 * the hero autonomic score, power distribution, tachogram waveform, and graded
 * metric rows. Save writes it to today's readings (with raw data); optional
 * "Write to Apple Health" logs SDNN + a mindful session.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetControls } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { Waveform } from '../../components/charts';
import { ReadingSummary } from '../../components/summary';
import { useToast } from '../../components/Toast';
import { usePalette } from '../../theme';
import { computeHrv } from '../../lib/hrv';
import { computeScores } from '../../lib/scoring';
import { getState, upsertEntry } from '../../store/store';
import { getCurrentKey } from '../../store/nav';
import { health } from '../../lib/health';
import { nowTime, todayKey, uid } from '../../lib/dates';
import type { Entry } from '../../lib/types';
import type { SessionConfig } from './Session';

export function HrvResults({ rr, hrSamples, config, durationSec, watchFallback, controls, rootControls }: {
  rr: number[]; hrSamples: { t: number; bpm: number }[]; config: SessionConfig; durationSec: number;
  watchFallback: { sdnn?: number; hr?: number } | null; controls: SheetControls; rootControls: SheetControls;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [writeHealth, setWriteHealth] = useState(false);
  const ctx = { sex: getState().profile.sex, height: getState().profile.height };

  const result = useMemo(() => computeHrv(rr, { style: config.style }), [rr, config.style]);

  // Build the reading with the same keys the manual form uses.
  const reading = useMemo<Entry>(() => {
    const type = config.kind === 'breath' ? 'breathHrv' : 'hrv';
    const base: Entry = {
      id: uid(), type, time: nowTime(),
      period: 'Random', note: config.source === 'watch' ? 'Captured via Apple Watch' : 'Captured via chest strap',
      source: config.source, durationSec,
      rrRaw: rr, rrClean: result.rrClean, sampledHr: hrSamples,
    };
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

  const hrWave = hrSamples.length > 2 ? hrSamples.map((s) => s.bpm) : result.rrClean.map((v) => 60000 / v);

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
    controls.close();
    rootControls.closeAll();
  };

  const enoughData = result.ok || (watchFallback && (watchFallback.sdnn != null));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.bg }} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: p.text, marginBottom: 4 }}>Reading complete</Text>
      <Text style={{ color: p.textDim, fontSize: 13, marginBottom: 16 }}>
        {`${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')} captured · ${rr.length} beats · ${Math.round(result.artifactPct)}% artifacts`}
      </Text>

      {!enoughData ? (
        <View style={{ backgroundColor: p.surface2, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ color: p.text, fontWeight: '700', marginBottom: 4 }}>Not enough clean data</Text>
          <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19 }}>{result.reason || 'Try again with the strap snug and stay still.'}</Text>
        </View>
      ) : null}

      {hrWave.length > 2 ? (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700', marginBottom: 8 }}>Heart rate over the reading</Text>
          <Waveform data={hrWave} label="bpm" />
        </View>
      ) : null}

      <ReadingSummary r={reading} days={getState().days} ctx={ctx} />

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
        <Button title="Discard" variant="danger" onPress={() => { controls.close(); rootControls.closeAll(); }} />
        <Button title="Save reading" variant="primary" onPress={save} />
      </View>
      {health().available ? (
        <Button title={writeHealth ? '✓ Will write to Apple Health' : 'Also write to Apple Health'} variant={writeHealth ? 'default' : 'ghost'} onPress={() => setWriteHealth((v) => !v)} style={{ marginTop: 12 }} />
      ) : null}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

export { todayKey };
