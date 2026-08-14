/**
 * The Journal sections: Sleep, Readings, Activities, Meds, Symptoms,
 * Triggers, Hydration, Digestion — each a Card with a header + "+ Add".
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { AddDashButton, Button, Card, Muted, Pill, ProgressBar, Row, RowValue, SectionHeader, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { TimeField } from '../components/Field';
import { useSheets, SheetFooter, type SheetControls } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { WATER_BLUE, fonts, radius, usePalette } from '../theme';
import {
  READING_TYPES,
  bmLabel, readingLabel, readingRowValue, summarizeFields,
} from '../lib/registry';
import { typesFor } from '../lib/typeCatalog';
import { orthoDeltaCat, orthoMaxDelta, rowScoreCategory, SCORE_COLORS, GRADE_LABEL } from '../lib/scoring';
import { sleepGrade, sleepHours, stagesForWindow, waterGoalL, type DaysMap } from '../lib/scoring/day';
import type { SleepRecord, SleepStages } from '../lib/types';
import { ensureDay, getState, getWaveform, save, storeSleepSeries, useAppState, useStore } from '../store/store';
import { setJournalSectionY } from '../store/nav';
import { useTier } from '../store/tier';
import { canCaptureHrv, hrvCaptureUsedToday } from '../lib/gating';
import { trustedReadings } from '../lib/hrvQuality';
import { fmtDateLong, fmtDuration, fmtTime12, minsBetween, periodOf, todayKey } from '../lib/dates';
import { health, healthAppName, type SleepImport } from '../lib/health';
import { STAGE_COLORS, STAGE_LABEL, STAGE_ORDER, fmtMin } from '../lib/sleep/stages';
import { typicalOvernightLow } from '../lib/sleep/night';
import { SleepConfirmSheet } from './Health';
import { SleepReportSheet } from './SleepReport';
import { useEntryForms } from './forms';
import { useDrawers } from './drawers';

export function JournalSections({ dk }: { dk: string }) {
  const p = usePalette();
  const state = useAppState();
  const d = state.days[dk];
  const ctx = { sex: state.profile.sex, height: state.profile.height };
  const forms = useEntryForms(dk);
  const drawers = useDrawers(dk);
  // Freemium: after the free tier's one live capture today, the button flips
  // to a locked look; the tap still goes through captureHrv, which raises the
  // paywall instead of the session.
  const tier = useTier();
  const hrvLocked = !canCaptureHrv(tier, hrvCaptureUsedToday(state.days[todayKey()]));
  const day = d || { readings: [], activities: [], meds: [], symptoms: [], sleep: { bed: '', wake: '' }, food: { water: 0, meals: [], triggers: {} }, digestion: { movements: [] } };
  return (
    <>
      <SleepSection dk={dk} />
      {/* Readings */}
      <Card>
        <SectionHeader title="Readings" />
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {/* Imported HRV samples too short to trust are never listed — they'd
              be tappable fiction and they'd skew every average (hrvQuality.ts). */}
          {[...trustedReadings(day.readings)].sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || '')).map((r) => {
            const def = READING_TYPES[r.type];
            if (!def) return null;
            // Episodes grade on the max delta seen across the captured curve
            // (a ≥30 bpm drop below baseline flags the blue warning zone).
            const curve = r.type === 'orthostatic' ? getWaveform(String(r.id))?.sampledHr : undefined;
            const cat = r.type === 'orthostatic' ? orthoDeltaCat(orthoMaxDelta(r, curve)) : rowScoreCategory(r, ctx);
            return <Row key={r.id} icon={def.icon as never} title={readingLabel(r)} right={<View style={{ flexDirection: 'row', alignItems: 'center' }}><RowValue text={readingRowValue(r, curve)} cat={cat} />{r.time ? <Pill text={fmtTime12(r.time)} /> : null}</View>} onPress={() => forms.openReadingSummary(r)} />;
          })}
          <View style={{ gap: 8, marginTop: 6 }}>
            {/* Live HRV capture only makes sense on today — a live reading
                belongs to the day it happens, never a back-dated one. */}
            {dk === todayKey() ? (
              <Pressable onPress={forms.captureHrv} style={({ pressed }) => [{ flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: hrvLocked ? p.surface2 : p.accent, borderWidth: hrvLocked ? 1 : 0, borderColor: p.border, borderRadius: radius.control, paddingVertical: 13 }, pressed && { opacity: 0.7 }]}>
                <Icon name={hrvLocked ? 'lock' : 'activity'} size={18} color={hrvLocked ? p.textDim : '#fff'} />
                <Text style={{ color: hrvLocked ? p.textDim : '#fff', fontSize: 15, fontWeight: '600' }}>Capture HRV reading</Text>
              </Pressable>
            ) : null}
            <AddDashButton onPress={forms.pickReading} label="+ Add reading" />
          </View>
        </View>
      </Card>
      {/* Activities */}
      <Card onLayout={(e) => setJournalSectionY('activities', e.nativeEvent.layout.y)}>
        <SectionHeader title="Activities" />
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {[...(day.activities || [])].sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || '')).map((a) => {
            const def = typesFor(state, 'activities')[a.type];
            if (!def) return null;
            const headline = def.summary ? def.summary(a) : summarizeFields(def, a);
            return <Row key={a.id} icon={def.icon as never} title={def.label} right={<View style={{ flexDirection: 'row', alignItems: 'center' }}>{headline ? <Text style={{ color: p.text, fontWeight: '600' }}>{headline}</Text> : null}{a.time ? <Pill text={fmtTime12(a.time)} /> : null}</View>} onPress={() => forms.openActivity(a)} />;
          })}
          <View style={{ marginTop: 6 }}><AddDashButton onPress={forms.pickActivity} label="+ Add activity" /></View>
        </View>
      </Card>
      {/* Meds */}
      <LoggedSection title="Medications & Supplements" dk={dk} arr="meds" typeMap={typesFor(state, 'meds')} onAdd={forms.pickMed} addLabel="+ Add medication" onOpen={forms.openMed} showPeriod />
      {/* Symptoms */}
      <LoggedSection title="Symptoms" dk={dk} arr="symptoms" typeMap={typesFor(state, 'symptoms')} onAdd={forms.pickSymptom} addLabel="+ Add symptom" onOpen={forms.openSymptom} showValue showTime />
      {/* Triggers */}
      <TriggerSection dk={dk} onAdd={drawers.triggers} />
      {/* Hydration */}
      <HydrationSection water={+(day.food?.water || 0)} onPress={drawers.water} />
      {/* Digestion */}
      <Card>
        <SectionHeader title="Bowel Movements" />
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {[...(day.digestion?.movements || [])].sort((a, b) => (a.time || '').localeCompare(b.time || '')).map((m) => (
            <Row key={m.id} icon="poop" title={bmLabel(m)} right={m.time ? <Pill text={fmtTime12(m.time)} /> : undefined} onPress={() => drawers.bowel(m)} />
          ))}
          <View style={{ marginTop: 6 }}><AddDashButton onPress={() => drawers.bowel(null)} label="+ Add bowel movement" /></View>
        </View>
      </Card>
      {/* Notes */}
      <NotesSection dk={dk} />
    </>
  );
}

/** Water logged vs the daily goal (clean-day protocol amount, else 2.5 L).
 *  Tapping anywhere opens the water drawer. */
function HydrationSection({ water, onPress }: { water: number; onPress: () => void }) {
  const p = usePalette();
  const state = useAppState();
  const goal = waterGoalL(state.settings.protocol);
  const pct = Math.min(1, water / goal);
  return (
    <Card>
      <SectionHeader title="Hydration" />
      <Pressable onPress={onPress} style={({ pressed }) => [{ paddingHorizontal: 14, paddingBottom: 14 }, pressed && { opacity: 0.6 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="cup" size={21} color={p.textDim} />
          {/* 16pt regular title; the liters figure is the blue grotesque number
              (Manrope ExtraBold), the " Liters" unit stays regular in text color. */}
          <Text style={{ color: p.text, fontSize: 16, flex: 1 }}>Water</Text>
          <Text style={{ fontSize: 14, color: WATER_BLUE, fontVariant: ['tabular-nums'] }}>
            <Text style={{ fontFamily: fonts.numHeavy, fontSize: 20 }}>{water}</Text>
            <Text style={{ color: p.text }}>{` Liter${water === 1 ? '' : 's'}`}</Text>
          </Text>
        </View>
        <ProgressBar pct={pct} color={WATER_BLUE} track={p.surface2} style={{ marginTop: 12 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ color: p.textDim, fontSize: 13 }}>{`${water} L logged`}</Text>
          <Text style={{ color: p.textDim, fontSize: 13 }}>{`Goal ${goal} L`}</Text>
        </View>
      </Pressable>
    </Card>
  );
}

/** Free-text day notes. The journal shows the note read-only (the box grows to
 *  fit the full text); tapping it opens a card-modal editor with a Save button
 *  pinned above the keyboard. The text is only surfaced when building
 *  AI-insights prompts. */
function NotesSection({ dk }: { dk: string }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  // Primitive selector: re-renders only when this day's note text changes.
  const note = useStore((s) => s.state.days[dk]?.notes || '');
  return (
    <Card>
      <SectionHeader title="Notes" />
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <Pressable
          onPress={() => openSheet((c) => <NotesSheet dk={dk} controls={c} />)}
          style={({ pressed }) => [
            { backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12, minHeight: 90 },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={{ fontSize: 15, lineHeight: 21, color: note ? p.text : p.textDim }}>
            {note || 'Write anything about your health or experiences today.'}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

/** Card-modal note editor. Save (pinned above the keyboard, next to the
 *  standard minimize-keyboard chevron) commits the draft and closes. */
function NotesSheet({ dk, controls }: { dk: string; controls: SheetControls }) {
  const p = usePalette();
  const [text, setText] = useState(() => getState().days[dk]?.notes || '');
  const save_ = () => {
    const d = ensureDay(dk);
    if ((d.notes || '') !== text) { d.notes = text; save(); }
    controls.close();
  };
  return (
    <View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: p.text, marginBottom: 16 }}>{`Notes for ${fmtDateLong(dk)}`}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        keyboardAppearance="dark"
        placeholder="Write anything about your health or experiences today."
        placeholderTextColor={p.textDim}
        style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12, fontSize: 15, lineHeight: 21, color: p.text, minHeight: 180, textAlignVertical: 'top' }}
      />
      <SheetFooter>
        <Pressable onPress={save_} style={({ pressed }) => [{ flex: 1, borderRadius: radius.control, backgroundColor: p.accent, paddingVertical: 13, alignItems: 'center' }, pressed && { opacity: 0.7 }]}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save</Text>
        </Pressable>
      </SheetFooter>
    </View>
  );
}

function SleepSection({ dk }: { dk: string }) {
  const p = usePalette();
  const state = useAppState();
  const { openSheet } = useSheets();
  const sleep = state.days[dk]?.sleep || { bed: '', wake: '' };
  const hasData = !!(sleep.bed && sleep.wake);
  const canHealth = health().available;

  // Empty night: the whole row is the add affordance (chevron on the right),
  // opening a mini card that looks the night up in the health store and always
  // offers manual entry — the same shape as "+ Add activity"'s import card.
  // Without a health store there's nothing to look up, so it opens the editor.
  const openAdd = () => (canHealth
    ? openSheet(() => <SleepImportSheet dk={dk} />, { fitContent: true })
    : openSheet((c) => <SleepEditSheet dk={dk} controls={c} add />, { fitContent: true }));

  return (
    <Card>
      <SectionHeader title="Sleep" />
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        {hasData ? (
          <>
            <SleepGrade dk={dk} sleep={sleep} />
            <Pressable
              onPress={() => openSheet((c) => <SleepEditSheet dk={dk} controls={c} />, { fitContent: true })}
              style={({ pressed }) => [{ marginTop: 12, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, paddingVertical: 12 }, pressed && { opacity: 0.6 }]}
            >
              <Text style={{ color: p.text, fontWeight: '600' }}>Edit sleep details</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={openAdd}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8 }, pressed && { opacity: 0.6 }]}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: p.surface2, borderRadius: radius.control, padding: 12 }}>
              <Text style={{ flex: 1, color: p.textDim, fontSize: 13, lineHeight: 18 }}>
                {dk !== todayKey()
                  // A past night is never still "on its way" from the health
                  // store, so don't tell them to check back — it just wasn't
                  // recorded. Adding/editing stays open either way.
                  ? 'No sleep was recorded for this day. Add it here.'
                  : canHealth
                    ? `Waiting for last night’s sleep from ${healthAppName()}. It can take a while after you wake for the data to be ready. Check back, or enter it yourself.`
                    : 'Enter last night’s sleep details.'}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={p.textDim} />
          </Pressable>
        )}
      </View>
    </Card>
  );
}

/** Mini "add sleep" card: looks last night up in the health store (tap the
 *  result to confirm the window before it's written) and always leaves a manual
 *  path in the footer. Same pattern as the reading / workout import cards. */
function SleepImportSheet({ dk }: { dk: string }) {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
  const [loading, setLoading] = useState(true);
  const [found, setFound] = useState<SleepImport | null>(null);
  React.useEffect(() => {
    let alive = true;
    health().readSleep(dk)
      .then((s) => { if (alive) setFound(s); })
      .catch(() => { /* graceful — falls through to the empty state */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dk]);
  const openManual = () => openSheet((c) => <SleepEditSheet dk={dk} controls={c} add />, { fitContent: true });
  // A past night is settled: the health store either has it or never will, so
  // the copy drops the "still on its way, check back" framing.
  const past = dk !== todayKey();
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 4 }}>Add sleep</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16 }}>{`Import ${past ? 'this night' : 'last night'} from ${healthAppName()}, or enter it manually.`}</Text>
      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 30, gap: 12 }}>
          <ActivityIndicator color={p.accent} />
          <Text style={{ color: p.textDim, fontSize: 14 }}>{`Getting sleep from ${healthAppName()}…`}</Text>
        </View>
      ) : !found ? (
        <Muted>{past
          ? `No sleep was recorded in ${healthAppName()} for this night. Enter it manually below.`
          : `No sleep in ${healthAppName()} for this night yet. It can take a while after you wake for the data to be ready. Check back, or enter it manually below.`}</Muted>
      ) : (
        <Pressable
          // Even when found, the window is confirmed before it's written.
          onPress={() => openSheet((c) => <SleepConfirmSheet dk={dk} data={found} controls={c} onDone={() => toast('Sleep saved')} />)}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }, pressed && { opacity: 0.5 }]}
        >
          <Icon name="moon" size={22} color={p.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: p.text, fontSize: 17, fontWeight: '600' }}>{`${fmtTime12(found.bed)} – ${fmtTime12(found.wake)}`}</Text>
            <Text style={{ color: p.textDim, fontSize: 13, marginTop: 1 }}>
              {found.minutesAsleep > 0 ? `${fmtMin(found.minutesAsleep)} asleep${found.interrupted ? ', interrupted' : ''}` : healthAppName()}
            </Text>
          </View>
          <Icon name="chevronRight" size={20} color={p.textDim} />
        </Pressable>
      )}
      <SheetFooter>
        <Button title="Enter manually" variant="default" onPress={openManual} />
      </SheetFooter>
    </View>
  );
}

/** Why the night graded the way it did — shown under the divider when there's
 *  something worth flagging (short/interrupted night, elevated overnight HR). */
function sleepNote(days: DaysMap, dk: string, hrs: number | null, interrupted: boolean, hrLow: number | null): string | null {
  const reasons: string[] = [];
  if (hrs != null && hrs < 7) reasons.push(hrs < 5 ? 'very short duration' : 'short duration');
  if (interrupted) reasons.push('interrupted sleep');
  const typical = typicalOvernightLow(days, dk);
  if (hrLow != null && typical != null && hrLow >= typical + 5) {
    reasons.push(`elevated overnight HR (${hrLow} bpm vs ${Math.round(typical)} typical)`);
  }
  if (!reasons.length) return null;
  const joined = reasons.length > 1 ? `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}` : reasons[0];
  return joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
}

/** Graded summary of a night with data: grade chip, hours asleep, stage bar.
 *  Tapping it opens the full sleep report (`SleepReport.tsx`) — the card itself
 *  is unchanged apart from the chevron that says so. The report's floating
 *  pencil reaches the same editor as the button below the card. */
function SleepGrade({ dk, sleep }: { dk: string; sleep: { bed: string; wake: string; quality?: string; hrLow?: string | number; hrHigh?: string | number; stages?: SleepStages } }) {
  const p = usePalette();
  const state = useAppState();
  const { openSheet } = useSheets();
  const openEdit = () => openSheet((c) => <SleepEditSheet dk={dk} controls={c} />, { fitContent: true });
  const openReport = () => openSheet(() => <SleepReportSheet dk={dk} />, { action: { icon: 'edit', onPress: openEdit } });
  const grade = sleepGrade(state.days, dk);
  // Stages only count when they still describe the recorded window — after a
  // hand-corrected bed/wake they don't, and duration comes from the times.
  const stages = stagesForWindow(sleep as SleepRecord);
  const asleepMin = stages ? stages.deep + stages.rem + stages.core : null;
  const hrs = asleepMin != null ? asleepMin / 60 : sleepHours(state.days, dk);
  const color = grade ? SCORE_COLORS[grade] : p.textDim;
  const interrupted = sleep.quality === 'interrupted';
  const hrLowN = parseFloat(String(sleep.hrLow ?? ''));
  const note = sleepNote(state.days as never, dk, hrs, interrupted, Number.isFinite(hrLowN) ? hrLowN : null);
  const hrRange = sleep.hrLow != null && sleep.hrLow !== '' && sleep.hrHigh != null && sleep.hrHigh !== ''
    ? `${sleep.hrLow}–${sleep.hrHigh} bpm`
    : sleep.hrLow != null && sleep.hrLow !== '' ? `${sleep.hrLow} bpm low` : null;
  return (
    <Pressable
      onPress={openReport}
      style={({ pressed }) => [{ borderWidth: 1, borderRadius: radius.card, padding: 14, marginBottom: 2, backgroundColor: p.surface2, borderColor: p.border }, pressed && { opacity: 0.6 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700' }}>Last night</Text>
        {grade ? (
          <View style={{ backgroundColor: color, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 }}>{GRADE_LABEL[grade]}</Text>
          </View>
        ) : null}
        <Icon name="chevronRight" size={18} color={p.textDim} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
        <Text style={{ fontSize: 38, fontFamily: fonts.numHeavy, color: p.text, fontVariant: ['tabular-nums'] }}>{hrs != null ? hrs.toFixed(1) : '–'}</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: p.textDim, marginLeft: 6 }}>hrs asleep</Text>
      </View>
      <Text style={{ fontSize: 13, color: p.textDim, marginTop: 4 }}>
        {`${fmtTime12(sleep.bed)} → ${fmtTime12(sleep.wake)}`}
        {interrupted ? ' · Interrupted' : ''}
        {hrRange ? ` · HR ${hrRange}` : ''}
      </Text>
      {stages ? <StageBar stages={stages} /> : null}
      {note ? (
        <>
          <View style={{ height: 1, backgroundColor: p.border, marginTop: 14 }} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
            <View style={{ marginTop: 1 }}><Icon name="info" size={15} color={color} /></View>
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: p.textDim }}>{note}</Text>
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

/** Stacked stage bar + legend (Deep / REM / Core / Awake with minutes). */
function StageBar({ stages }: { stages: SleepStages }) {
  const p = usePalette();
  const total = STAGE_ORDER.reduce((s, k) => s + stages[k], 0);
  if (!total) return null;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', height: 10, gap: 2 }}>
        {STAGE_ORDER.filter((k) => stages[k] > 0).map((k) => (
          <View key={k} style={{ flexGrow: stages[k], flexBasis: 0, backgroundColor: STAGE_COLORS[k], borderRadius: 3 }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 10 }}>
        {STAGE_ORDER.map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 9, height: 9, borderRadius: 2.5, backgroundColor: STAGE_COLORS[k] }} />
            <Text style={{ fontSize: 13, color: p.text, fontWeight: '500' }}>{`${STAGE_LABEL[k]} ${fmtMin(stages[k])}`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type SleepShape = { bed: string; wake: string; quality?: string; hrLow?: string | number; hrHigh?: string | number };

/** Bed/wake/quality/HR inputs — shared by the inline manual editor and the edit sheet. */
function SleepEditFields({ dk, sleep }: { dk: string; sleep: SleepShape }) {
  const p = usePalette();
  const setField = (field: string, v: string) => {
    const s = ensureDay(dk).sleep;
    (s as never as Record<string, string>)[field] = v;
    // Correcting the window invalidates an imported stage breakdown that no
    // longer spans it (watch off half the night). Drop it rather than keep
    // reporting stage minutes that contradict the times just entered.
    // ...and the overnight series with them: a curve keyed to the old bedtime
    // describes a window the user has just told us was wrong.
    if (field === 'bed' || field === 'wake') {
      if (s.stages && !stagesForWindow(s)) delete s.stages;
      storeSleepSeries(dk);
    }
    save();
  };
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <View style={{ flex: 1 }}><TimeField label="Bed (last night)" value={sleep.bed} onChange={(v) => setField('bed', v)} /></View>
        <View style={{ flex: 1 }}><TimeField label="Woke (this morning)" value={sleep.wake} onChange={(v) => setField('wake', v)} /></View>
      </View>
      <Segmented options={[{ val: 'good', label: 'Good sleep' }, { val: 'interrupted', label: 'Interrupted' }]} value={(sleep.quality as 'good' | 'interrupted') || 'good'} onChange={(v) => setField('quality', v)} style={{ marginBottom: 12 }} />
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: p.textDim, marginBottom: 4, fontWeight: '600' }}>HR low</Text>
          <TextInput keyboardType="decimal-pad" defaultValue={sleep.hrLow != null ? String(sleep.hrLow) : ''} onEndEditing={(e) => setField('hrLow', e.nativeEvent.text)} style={inp(p)} placeholderTextColor={p.textDim} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: p.textDim, marginBottom: 4, fontWeight: '600' }}>HR high</Text>
          <TextInput keyboardType="decimal-pad" defaultValue={sleep.hrHigh != null ? String(sleep.hrHigh) : ''} onEndEditing={(e) => setField('hrHigh', e.nativeEvent.text)} style={inp(p)} placeholderTextColor={p.textDim} />
        </View>
      </View>
    </>
  );
}

/** Card-modal editor for a night — opened from "Edit sleep details", and with
 *  `add` from the import card's "Enter manually". Fields write straight through
 *  on change, so Done only dismisses. */
function SleepEditSheet({ dk, controls, add }: { dk: string; controls: SheetControls; add?: boolean }) {
  const p = usePalette();
  const state = useAppState();
  const sleep = state.days[dk]?.sleep || { bed: '', wake: '' };
  return (
    <View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: p.text, marginBottom: 16 }}>{add ? 'Enter sleep details' : 'Edit sleep details'}</Text>
      <SleepEditFields dk={dk} sleep={sleep} />
      <SheetFooter>
        {/* Stacked on the import card, Done dismisses both — the night is
            already saved, so there's nothing to come back to underneath. */}
        <Pressable onPress={add ? controls.closeAll : controls.close} style={({ pressed }) => [{ flex: 1, borderRadius: radius.control, backgroundColor: p.accent, paddingVertical: 13, alignItems: 'center' }, pressed && { opacity: 0.7 }]}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Done</Text>
        </Pressable>
      </SheetFooter>
    </View>
  );
}
const inp = (p: ReturnType<typeof usePalette>) => ({ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 11, fontSize: 16, color: p.text, minHeight: 44 });

function LoggedSection({ title, dk, arr, typeMap, onAdd, addLabel, onOpen, showValue, showTime, showPeriod }: {
  title: string; dk: string; arr: 'meds' | 'symptoms'; typeMap: Record<string, { label: string; icon: string; summary?: (r: never) => string }>;
  onAdd: () => void; addLabel: string; onOpen: (r: never) => void; showValue?: boolean; showTime?: boolean; showPeriod?: boolean;
}) {
  const state = useAppState();
  const p = usePalette();
  const list = [...(state.days[dk]?.[arr] || [])].sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
  return (
    <Card>
      <SectionHeader title={title} />
      <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
        {list.map((m) => {
          const def = typeMap[m.type];
          if (!def) return null;
          const value = showValue ? summarizeFields(def as never, m) : '';
          // A symptom that has ended says so on its own line rather than in the
          // pill, which would fight the label for the row's width.
          const end = (m.endTime as string) || '';
          const ran = end ? minsBetween(m.time as string, end) : null;
          const sub = end ? `Ended ${fmtTime12(end)}${ran ? ` (${fmtDuration(ran)})` : ''}` : undefined;
          return (
            <Row key={m.id} icon={def.icon as never} title={def.label} sub={sub}
              right={<View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {value ? <Text style={{ color: p.text, fontWeight: '600' }}>{value}</Text> : null}
                {showTime && m.time ? <Pill text={fmtTime12(m.time as string)} /> : null}
                {showPeriod && m.time ? <Pill text={periodOf(m.time as string)} /> : null}
              </View>}
              onPress={() => onOpen(m as never)} />
          );
        })}
        <View style={{ marginTop: 6 }}><AddDashButton onPress={onAdd} label={addLabel} /></View>
      </View>
    </Card>
  );
}

function TriggerSection({ dk, onAdd }: { dk: string; onAdd: () => void }) {
  const p = usePalette();
  const state = useAppState();
  const trigTypes = typesFor(state, 'triggers');
  const trigs = state.days[dk]?.food?.triggers || {};
  const keys = Object.keys(trigs).filter((k) => trigs[k] > 0 && trigTypes[k]);
  return (
    <Card>
      <SectionHeader title="Triggers" />
      <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
        {keys.map((k) => (
          <Row key={k} icon="alert" title={trigTypes[k].label} right={<Pressable onPress={() => { delete ensureDay(dk).food.triggers[k]; save(); }} hitSlop={8}><Icon name="x" size={18} color={p.textDim} /></Pressable>} />
        ))}
        <View style={{ marginTop: 6 }}><AddDashButton onPress={onAdd} label="+ Add trigger" /></View>
      </View>
    </Card>
  );
}
