/**
 * Results screen after a live reading: runs the HRV pipeline on the collected
 * RR, builds a reading identical to a typed-in one (same field keys), and shows
 * the hero autonomic score, power distribution, tachogram waveform, and graded
 * metric rows. Save writes the metrics to today's readings and the raw arrays
 * to the waveform sidecar (the journal blob never carries them); optional
 * "Write to Apple Health" logs SDNN + a mindful session.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SheetControls, SheetFooter } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { NoteDraftCard, ReadingSummary } from '../../components/summary';
import { usePalette } from '../../theme';
import { computeHrv } from '../../lib/hrv';
import { computeScores } from '../../lib/scoring';
import { getState, storeWaveform, upsertEntry } from '../../store/store';
import { splitWaveform } from '../../lib/waveforms';
import { health, healthAppName } from '../../lib/health';
import { keyOf, nowTime, pad, todayKey, uid } from '../../lib/dates';
import { nudgeDecision, nudgeDismissed, nudgeSkipped, suggestedReminderTime } from '../../lib/reminderNudge';
import { nudgeMemory, writeNudgeMemory } from '../../lib/reminderNudgeMemory';
import { DEFAULT_REMINDER_TIME } from '../../lib/reminders';
import { ReminderNudgeCard } from './ReminderNudge';
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

  // Build the reading with the same keys the manual form uses. The capture
  // source is stamped on the entry (and shown in the summary's Details card),
  // so the note stays empty and free for whatever the user wants to write.
  const reading = useMemo<Entry>(() => {
    const type = config.kind === 'breath' ? 'breathHrv' : 'hrv';
    const base: Entry = {
      id: uid(), type, time: startedAt ? `${pad(startedAt.getHours())}:${pad(startedAt.getMinutes())}` : nowTime(),
      period: config.period || 'Other',
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

  const enoughData = result.ok || (watchFallback && (watchFallback.sdnn != null));

  // Notes are written onto the already-saved entry, so the draft is held here
  // only to render it — every commit writes straight through.
  const [note, setNote] = useState('');
  /** The persisted (waveform-stripped) entry, once the auto-save has run. */
  const saved = useRef<Entry | null>(null);
  const [wroteHealth, setWroteHealth] = useState(false);

  // The morning-reminder offer. Decided ONCE per reading (a re-render must not
  // re-count a skip, and the card must not disappear under the user because a
  // save elsewhere flipped the settings), so the decision is taken on the first
  // render and the skip is written the same moment.
  const [showNudge, setShowNudge] = useState(() => {
    const m = nudgeMemory();
    const d = nudgeDecision(m, !!getState().settings.reminder?.enabled);
    if (d === 'skip') writeNudgeMemory(nudgeSkipped(m));
    return d === 'show';
  });
  const nudgeTime = useRef(suggestedReminderTime(reading.time as string, DEFAULT_REMINDER_TIME)).current;
  const shown = useMemo(() => (note ? { ...reading, note } : reading), [reading, note]);

  // Auto-save, once, on the first render of this card. The reading already
  // happened; the card is a receipt, not a form.
  useEffect(() => {
    if (!enoughData || saved.current) return;
    // The preview `reading` carries its arrays inline (ReadingSummary renders
    // from them pre-save); persisting splits them into the waveform sidecar,
    // written before the entry so the journal never references a missing blob.
    const { entry, waveform } = splitWaveform(reading);
    if (waveform) storeWaveform(entry.id, waveform);
    saved.current = entry;
    upsertEntry(dk, 'readings', entry);
    // No ping here on purpose. Capture is counted in the ENGINE, at the two
    // moments that can differ — started and completed (sessionStore.ts).
    // Publish to the health store on the same terms a manually logged reading
    // is published (EntryForm.save): only with Health connected, and never for
    // a watch reading, which came FROM the health store.
    if (health().available && getState().settings.healthEnabled && config.source !== 'watch') {
      const sdnn = parseFloat(reading.sdnn as string);
      const rmssd = parseFloat(reading.rmssd as string);
      const hr = parseFloat((reading.hr || reading.avgHr) as string);
      // iOS stores SDNN (HealthKit's HRV type), Android RMSSD (Health
      // Connect's) — pass both and let the platform impl pick.
      if (!isNaN(sdnn) || !isNaN(rmssd)) {
        health().writeHrvSession({
          sdnnMs: isNaN(sdnn) ? undefined : sdnn,
          rmssdMs: isNaN(rmssd) ? undefined : rmssd,
          avgHr: isNaN(hr) ? undefined : hr,
          startISO: new Date(startedAtMs || (Date.now() - durationSec * 1000)).toISOString(),
          durationSec,
        }).then(() => setWroteHealth(true)).catch(() => { /* graceful */ });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A note committed after the auto-save is an edit of a real entry.
  const onNote = (next: string) => {
    setNote(next);
    const e = saved.current;
    if (e) upsertEntry(dk, 'readings', { ...e, note: next });
  };

  return (
    <View>
      <Text style={{ fontSize: 25, fontWeight: '800', color: p.text, marginBottom: 4 }}>Reading complete</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16 }}>
        {`${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')} captured · ${rr.length} beats · ${Math.round(result.artifactPct)}% artifacts${config.source === 'camera' ? ' · Camera (PPG)' : ''}`}
      </Text>

      {/* The card says what it already did, rather than asking. */}
      {enoughData ? (
        <Text style={{ color: p.textDim, fontSize: 13, marginTop: -10, marginBottom: 16 }}>
          {`Saved to your journal${wroteHealth ? ` and ${healthAppName()}` : ''}`}
        </Text>
      ) : null}

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

      {showNudge ? (
        <ReminderNudgeCard
          initialTime={nudgeTime}
          onDismiss={() => { writeNudgeMemory(nudgeDismissed(nudgeMemory())); setShowNudge(false); }}
          onEnabled={() => setShowNudge(false)}
        />
      ) : null}

      {!enoughData ? (
        <View style={{ backgroundColor: p.surface2, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ color: p.text, fontWeight: '700', marginBottom: 4 }}>Not enough clean data</Text>
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 19 }}>{result.reason || 'Try again with the strap snug and stay still.'}</Text>
        </View>
      ) : null}

      <ReadingSummary r={shown} days={daysWithCurrent} ctx={ctx} />
      {/* The summary is read-only, so the note field lives here; it edits the
          saved entry in place. Nothing was saved when there was nothing usable
          to save, so there is nothing to annotate either. */}
      {enoughData ? <NoteDraftCard note={note} onChange={onNote} /> : null}

      {/* One way out: the reading is already saved. */}
      <SheetFooter>
        <Button title={enoughData ? 'Done' : 'Close'} variant="primary" onPress={() => controls.closeAll()} />
      </SheetFooter>
    </View>
  );
}
