/**
 * Results screen after a live reading: runs the HRV pipeline on the collected
 * RR, builds a reading identical to a typed-in one (same field keys), and shows
 * the hero HRV score, power distribution, tachogram waveform, and graded
 * metric rows. Save writes the metrics to today's readings and the raw arrays
 * to the waveform sidecar (the journal blob never carries them); optional
 * "Write to Apple Health" logs SDNN + a mindful session.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SheetControls, useSheets } from '../../components/Sheet';
import { NoteDraftCard, ReadingSummary } from '../../components/summary';
import { Button, CautionNote } from '../../components/ui';
import { usePalette } from '../../theme';
import { computeHrv } from '../../lib/hrv';
import { refusalSignature } from '../../lib/hrv/refusal';
import { reportFault } from '../../store/errorReport';
import { troubleSourceFor } from '../../lib/ppg/tips';
import { TroubleSheet } from './Trouble';
import { computeScores } from '../../lib/scoring';
import { getState, storeWaveform, upsertEntry } from '../../store/store';
import { splitWaveform } from '../../lib/waveforms';
import { health, healthAppName } from '../../lib/health';
import { confirmDelete, EntryForm } from '../EntryForm';
import { READING_TYPES } from '../../lib/registry';
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

export function HrvResults({ rr, segmentStarts, hrSamples, sdnnSamples, config, durationSec, startedAtMs, watchFallback, onRetry, controls }: {
  rr: number[]; hrSamples: { t: number; bpm: number }[]; sdnnSamples?: { t: number; sdnn: number }[];
  /** Indices into `rr` where camera tracking resumed after a dropout. */
  segmentStarts?: number[];
  config: SessionConfig; durationSec: number;
  /** When the reading actually began (watch-synced / imported readings) — the
   *  entry is stamped with this time and day, not the moment Save is pressed. */
  startedAtMs?: number | null;
  watchFallback: { sdnn?: number; hr?: number } | null;
  /**
   * Take the reading again, supplied by whoever raised this card.
   *
   * Injected rather than reaching for `openCapture` in ./Setup, which would
   * close a require cycle that already runs Setup → HealthImport → WatchSync →
   * Results. It is also genuinely absent for a watch-synced reading, which is
   * one of the two callers: there is no phone-side capture to restart.
   */
  onRetry?: () => void;
  controls: SheetControls;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
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
      // How good this capture was, kept with the numbers it produced. The
      // results card below has always SHOWN these and the entry has never
      // carried them, so a reading could not be judged on its own quality once
      // this card closed — which is the whole question about camera readings,
      // and it was being thrown away on every one of them.
      //
      // Stamped only on this branch: here the metrics came from the beat
      // series, so there is a series to grade. The `watchFallback` branch below
      // takes its numbers from the watch's own summary with no RR behind them,
      // and a 0% artifact rate there would be a quality claim about a
      // measurement we never saw.
      base.artifactPct = Math.round(result.artifactPct * 10) / 10;
      base.coverageSec = Math.round(result.coverageSec);
      base.confidence = result.confidence;
      // Beat count is stamped rather than derived: the waveform sidecar can be
      // pruned, and "how many beats is this built on" has to survive that.
      base.beatCount = result.rrClean.length;
      if (result.segmentsUsed > 1) base.segmentsUsed = result.segmentsUsed;
      if (result.segmentsDropped) base.segmentsDropped = result.segmentsDropped;
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

  /** Good enough for the app to file on the user's behalf, with no question. */
  const enoughData = result.ok || (watchFallback && (watchFallback.sdnn != null));
  /**
   * Refused, and still worth offering.
   *
   * This is the other half of the fix the review asked for. A reading over the
   * camera's artifact gate used to be simply gone — three minutes of sitting
   * still, and the card's only button closed the stack — and repeating that six
   * times is the twenty minutes the review described. But "we will not file
   * this for you" is not the same claim as "these numbers are meaningless", and
   * between the two is a band where the statistics are a noisy version of this
   * person's variability. The person who just sat through the reading is the
   * right one to decide, so the decision is theirs, ONCE, on the reading in
   * front of them, with the artifact rate on screen.
   *
   * Deliberately not a setting. A "less strict mode" flipped once in
   * frustration would silently degrade every later reading, and `trends/` and
   * `insights/` would go on building claims about somebody's body out of the
   * result with nobody remembering it was on.
   */
  const salvageable = !enoughData && result.salvageable;
  const [offered, setOffered] = useState(salvageable);

  // Notes are written onto the already-saved entry, so the draft is held here
  // only to render it — every commit writes straight through.
  const [note, setNote] = useState('');
  /** The persisted (waveform-stripped) entry, once the save has run. */
  const saved = useRef<Entry | null>(null);
  /** When the save happened, so the header pill can arm itself off a real
   *  entry — a salvage save lands after the first render, and the pill's
   *  options are set through `controls.setOptions` rather than at openSheet
   *  time precisely because there is nothing to edit or delete until then. */
  const [savedAt, setSavedAt] = useState(0);
  const reported = useRef(false);
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

  /**
   * Write the reading. Called once, either by the auto-save below or by the
   * user's Save anyway.
   *
   * `degraded` records that the app would have refused this one and the user
   * chose to keep it — a fact about the decision, not a second quality number
   * (`artifactPct` / `confidence` / `coverageSec` are already stamped). It is
   * what the journal row and the summary read to mark the reading, so the
   * reader meets the caveat every time they open it and not only here.
   *
   * It COUNTS. It is in the day score, the trends and the insights sweep like
   * any other reading, because the alternative — a reading that saves but
   * silently buys the user nothing — is a worse answer to "I cannot get a
   * reading" than the refusal was.
   */
  const persist = (degraded: boolean) => {
    if (saved.current) return;
    // The preview `reading` carries its arrays inline (ReadingSummary renders
    // from them pre-save); persisting splits them into the waveform sidecar,
    // written before the entry so the journal never references a missing blob.
    const { entry, waveform } = splitWaveform(degraded ? { ...reading, degraded: true } : reading);
    if (waveform) storeWaveform(entry.id, waveform);
    saved.current = entry;
    upsertEntry(dk, 'readings', entry);
    setSavedAt(Date.now());
    // No ping here on purpose. Capture is counted in the ENGINE, at the two
    // moments that can differ — started and completed (sessionStore.ts).
    //
    // Publish to the health store on the same terms a manually logged reading
    // is published (EntryForm.save): only with Health connected, and never for
    // a watch reading, which came FROM the health store.
    //
    // A DEGRADED reading is not published, and that is the one place its mark
    // changes behaviour. Our journal can carry the caveat with the number; the
    // health store cannot, so what would land there is a bare SDNN, indexed
    // beside clean readings, readable by every other app on the phone, with
    // nothing left to say the app itself would have declined it.
    if (!degraded && health().available && getState().settings.healthEnabled && config.source !== 'watch') {
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
  };

  // Auto-save, once, on the first render of this card. The reading already
  // happened; the card is a receipt, not a form. A salvageable reading is the
  // one exception — there the card IS asking, so nothing is written until it
  // is answered.
  useEffect(() => {
    if (enoughData) persist(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Tell the fault log about a refusal, once per reading.
   *
   * A refused capture is otherwise completely invisible: `finishSession` counts
   * the completion before anything judges the beats, so a phone that can never
   * get a reading looks, in every counter we have, exactly like one taking
   * readings every day. See `lib/hrv/refusal.ts` for why this rides `/fault`
   * rather than a ping, and why the numbers are banded.
   */
  useEffect(() => {
    if (enoughData || reported.current) return;
    reported.current = true;
    reportFault('hrv.refused', refusalSignature({
      source: config.source,
      artifactPct: result.artifactPct,
      coverageSec: result.coverageSec,
      durationSec,
      hasFields: Object.keys(result.fields).length > 0,
      beats: result.rrClean.length,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The header pill: edit, delete, close, the same three every entry card
  // carries. It can only be armed once the auto-save above has run, because
  // until then there is no persisted entry to edit or delete — which is why
  // it is set through `controls.setOptions` rather than at openSheet time.
  // A reading with nothing usable in it was never written, so it gets the ✕
  // alone. The ✕ closes the WHOLE stack either way: this card is raised over
  // the session it belongs to, and that session is finished with.
  useEffect(() => {
    const e = saved.current;
    if (!e) { controls.setOptions({ hideClose: false, dismissAll: true }); return; }
    controls.setOptions({
      hideClose: false,
      dismissAll: true,
      action: { icon: 'edit', onPress: () => openSheet((c) => (
        <EntryForm
          typeMap={READING_TYPES} arrKey="readings" dk={dk}
          type={e.type} existing={saved.current} controls={c} onSaved={() => {}}
        />
      )) },
      destructive: { onPress: () => confirmDelete(openSheet, dk, 'readings', e, READING_TYPES[e.type]?.label || 'reading') },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAt]);

  /** The user keeps a reading the app declined to file. One tap, one reading,
   *  no memory: the next reading is judged by exactly the same bar. */
  const saveAnyway = () => {
    setOffered(false);
    persist(true);
    // Recorded on the same route as the refusal, under its own tag, so the two
    // can be read against each other: how often the escape hatch is reached
    // for, and at what quality, is the only evidence that it is working.
    reportFault('hrv.salvaged', refusalSignature({
      source: config.source,
      artifactPct: result.artifactPct,
      coverageSec: result.coverageSec,
      durationSec,
      hasFields: true,
      beats: result.rrClean.length,
    }));
  };

  const troubleSource = troubleSourceFor(config.source);
  const openTips = () => {
    if (!troubleSource) return;
    openSheet((c) => <TroubleSheet config={config} controls={c} onRetry={onRetry} />);
  };
  /** Did this card's save happen because the user asked for it? */
  const degradedSave = !!saved.current?.degraded;
  /**
   * Is there an entry to talk about? `enoughData` rather than `saved.current`
   * for the auto-save case: the save runs in an effect, so the ref is still
   * null on the first paint and the receipt line would flash in a frame late.
   */
  const filed = !!enoughData || degradedSave;

  // A note committed after the auto-save is an edit of a real entry.
  const onNote = (next: string) => {
    setNote(next);
    const e = saved.current;
    if (e) upsertEntry(dk, 'readings', { ...e, note: next });
  };

  return (
    <View>
      {/* "Complete" is a claim about the entry, not the capture: over a card
          that goes on to say the reading was below our bar it read as the app
          contradicting itself in two lines. */}
      <Text style={{ fontSize: 25, fontWeight: '800', color: p.text, marginBottom: 4 }}>
        {filed ? 'Reading complete' : 'Reading finished'}
      </Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16 }}>
        {`${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')} captured · ${rr.length} beats · ${Math.round(result.artifactPct)}% artifacts${config.source === 'camera' ? ' · Camera (PPG)' : ''}`}
      </Text>

      {/* The card says what it already did, rather than asking. */}
      {filed ? (
        <Text style={{ color: p.textDim, fontSize: 13, marginTop: -10, marginBottom: 16 }}>
          {`Saved to your journal${wroteHealth ? ` and ${healthAppName()}` : ''}`}
        </Text>
      ) : null}

      {/* Every reading here is stitched from however much clean pulse we got,
          so say how much that was. A number built from 90 s of a 3 min attempt
          is a different claim than one built from all of it. This was gated to
          camera captures, on the reasoning that only they drop out — but a
          watch heartbeat series carries its own dropouts (rrFromSeries reports
          them now), and the reading that started this whole fix looked like a
          5-minute session and held under 2 minutes of usable beats. */}
      {filed ? (
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

      {/* Saved by the user's own choice: say so, in the same gold the app uses
          everywhere else for "this is not wrong, but you should know". */}
      {degradedSave ? (
        <CautionNote text={`Saved and marked low quality (${Math.round(result.artifactPct)}% artifacts). It counts toward your scores and trends like any other reading, and the mark stays on it.`} />
      ) : null}

      {!enoughData && !saved.current ? (
        <View style={{ backgroundColor: p.surface2, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ color: p.text, fontWeight: '700', marginBottom: 4 }}>
            {offered ? 'Below our quality bar' : 'Not enough clean data'}
          </Text>
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 19 }}>
            {result.reason || 'Try again with the strap snug and stay still.'}
          </Text>

          {/* The escape hatch. One decision, on this reading, with the number
              in the sentence above it — and the caveat stated before the tap
              rather than discovered afterwards. */}
          {offered ? (
            <>
              <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 10 }}>
                The numbers below did compute, and we can keep them. They will be marked low quality
                wherever they appear, and they will count toward your scores and trends like any other
                reading, so treat them as a rough figure rather than a measurement to compare against.
              </Text>
              <View style={{ gap: 9, marginTop: 14 }}>
                <Button title="Save anyway" variant="caution" onPress={saveAnyway} />
                <Button title="Show me what to fix" variant="ghost" onPress={openTips} />
              </View>
            </>
          ) : troubleSource ? (
            <View style={{ marginTop: 14 }}>
              <Button title="Show me what to fix" variant="ghost" onPress={openTips} />
            </View>
          ) : null}
        </View>
      ) : null}

      <ReadingSummary r={shown} days={daysWithCurrent} ctx={ctx} />
      {/* The summary is read-only, so the note field lives here; it edits the
          saved entry in place. Nothing was saved when there was nothing usable
          to save, so there is nothing to annotate either. */}
      {filed ? <NoteDraftCard note={note} onChange={onNote} /> : null}

    </View>
  );
}
