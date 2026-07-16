/**
 * The Journal sections: Sleep, Readings, Activities, Meds, Symptoms,
 * Triggers, Hydration, Digestion — each a Card with a header + "+ Add".
 */
import React, { useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Platform, Pressable, Text, TextInput, UIManager, View } from 'react-native';
import { AddDashButton, Card, Pill, ProgressBar, Row, RowValue, SectionHeader, Segmented } from '../components/ui';
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
import { sleepGrade, sleepHours, waterGoalL, type DaysMap } from '../lib/scoring/day';
import type { SleepStages } from '../lib/types';
import { ensureDay, getState, getWaveform, save, useAppState, useStore } from '../store/store';
import { setJournalSectionY } from '../store/nav';
import { useTier } from '../store/tier';
import { canCaptureHrv, hrvCaptureUsedToday } from '../lib/gating';
import { fmtDateLong, fmtTime12, periodOf, todayKey } from '../lib/dates';
import { health, healthAppName } from '../lib/health';
import { SleepConfirmSheet } from './Health';
import { useEntryForms } from './forms';
import { useDrawers } from './drawers';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
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
          {[...(day.readings || [])].sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || '')).map((r) => {
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
            return <Row key={a.id} icon={def.icon as never} title={def.label} right={<View style={{ flexDirection: 'row', alignItems: 'center' }}>{headline ? <Text style={{ color: p.text, fontWeight: '600' }}>{headline}</Text> : null}{a.time ? <Pill text={fmtTime12(a.time)} /> : null}</View>} onPress={() => forms.openActivityForm(a.type, a)} />;
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
  const toast = useToast();
  const { openSheet } = useSheets();
  const sleep = state.days[dk]?.sleep || { bed: '', wake: '' };
  const hasData = !!(sleep.bed && sleep.wake);
  const api = health();
  const canHealth = api.available;

  const [manual, setManual] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const toggleManual = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setManual((v) => !v); };

  const checkHealth = async () => {
    setSyncing(true);
    try {
      const s = await api.readSleep(dk);
      setSyncing(false);
      if (!s) { toast(`No sleep data from ${healthAppName()} yet`); return; }
      // Even when found, still confirm the asleep window before writing it.
      openSheet((c) => <SleepConfirmSheet dk={dk} data={s} controls={c} onDone={() => toast('Sleep saved')} />);
    } catch {
      setSyncing(false);
      toast('Could not read sleep');
    }
  };

  return (
    <Card>
      <SectionHeader title="Sleep" />
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        {hasData ? <SleepGrade dk={dk} sleep={sleep} /> : (
          <View style={{ marginBottom: 4 }}>
            {canHealth ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: p.surface2, borderRadius: radius.control, padding: 12, marginBottom: 12 }}>
                  <Icon name="moon" size={18} color={p.textDim} />
                  <Text style={{ flex: 1, color: p.textDim, fontSize: 13, lineHeight: 18 }}>
                    {`Waiting for last night’s sleep from ${healthAppName()}. It can take a while after you wake for the data to be ready. Check back, or enter it yourself.`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={checkHealth} disabled={syncing} style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, paddingVertical: 12 }, pressed && { opacity: 0.6 }]}>
                    {syncing ? <ActivityIndicator size="small" color={p.textDim} /> : <Icon name="download" size={16} color={p.text} />}
                    <Text style={{ color: p.text, fontWeight: '600' }}>{syncing ? 'Checking…' : 'Check for updates'}</Text>
                  </Pressable>
                  <Pressable onPress={toggleManual} style={({ pressed }) => [{ justifyContent: 'center', alignItems: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: manual ? p.accent : p.border, backgroundColor: manual ? p.accentSoft : p.surface2, paddingVertical: 12, paddingHorizontal: 16 }, pressed && { opacity: 0.6 }]}>
                    <Text style={{ color: manual ? p.accent : p.text, fontWeight: '600' }}>{manual ? 'Close' : 'Enter manually'}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable onPress={toggleManual} style={({ pressed }) => [{ flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: manual ? p.accent : p.border, backgroundColor: manual ? p.accentSoft : p.surface2, paddingVertical: 12 }, pressed && { opacity: 0.6 }]}>
                <Icon name="edit" size={16} color={manual ? p.accent : p.text} />
                <Text style={{ color: manual ? p.accent : p.text, fontWeight: '600' }}>{manual ? 'Close' : 'Enter sleep details'}</Text>
              </Pressable>
            )}
          </View>
        )}
        {hasData ? (
          <Pressable
            onPress={() => openSheet((c) => <SleepEditSheet dk={dk} controls={c} />, { fitContent: true })}
            style={({ pressed }) => [{ marginTop: 12, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, paddingVertical: 12 }, pressed && { opacity: 0.6 }]}
          >
            <Text style={{ color: p.text, fontWeight: '600' }}>Edit sleep details</Text>
          </Pressable>
        ) : manual ? (
          <SleepFields dk={dk} sleep={sleep} onDone={toggleManual} />
        ) : null}
      </View>
    </Card>
  );
}

/** Sleep-stage colors (Apple-Health-like: deep violet → REM light blue → core
 *  blue, awake neutral). Validated for CVD separation + contrast on the dark
 *  surface; identity is also carried by the labeled legend, never color alone. */
const STAGE_COLORS = { deep: '#8b5cf6', rem: '#3d93ee', core: '#2f66d0', awake: '#71717a' } as const;
const STAGE_ORDER = ['deep', 'rem', 'core', 'awake'] as const;
const STAGE_LABEL = { deep: 'Deep', rem: 'REM', core: 'Core', awake: 'Awake' } as const;

const fmtMin = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

/** Typical overnight low HR: median of prior nights' hrLow (needs 3+ nights). */
function typicalHrLow(days: DaysMap, dk: string): number | null {
  const vals = Object.keys(days)
    .filter((k) => k < dk)
    .sort()
    .slice(-30)
    .map((k) => parseFloat(String(days[k]?.sleep?.hrLow ?? '')))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length < 3) return null;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Why the night graded the way it did — shown under the divider when there's
 *  something worth flagging (short/interrupted night, elevated overnight HR). */
function sleepNote(days: DaysMap, dk: string, hrs: number | null, interrupted: boolean, hrLow: number | null): string | null {
  const reasons: string[] = [];
  if (hrs != null && hrs < 7) reasons.push(hrs < 5 ? 'very short duration' : 'short duration');
  if (interrupted) reasons.push('interrupted sleep');
  const typical = typicalHrLow(days, dk);
  if (hrLow != null && typical != null && hrLow >= typical + 5) {
    reasons.push(`elevated overnight HR (${hrLow} bpm vs ${Math.round(typical)} typical)`);
  }
  if (!reasons.length) return null;
  const joined = reasons.length > 1 ? `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}` : reasons[0];
  return joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
}

/** Graded summary of a night with data: grade chip, hours asleep, stage bar. */
function SleepGrade({ dk, sleep }: { dk: string; sleep: { bed: string; wake: string; quality?: string; hrLow?: string | number; hrHigh?: string | number; stages?: SleepStages } }) {
  const p = usePalette();
  const state = useAppState();
  const grade = sleepGrade(state.days, dk);
  const stages = sleep.stages;
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
    <View style={{ borderWidth: 1, borderRadius: radius.card, padding: 14, marginBottom: 2, backgroundColor: p.surface2, borderColor: p.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700' }}>Last night</Text>
        {grade ? (
          <View style={{ backgroundColor: color, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 }}>{GRADE_LABEL[grade]}</Text>
          </View>
        ) : null}
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
    </View>
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
  const setField = (field: string, v: string) => { (ensureDay(dk).sleep as never as Record<string, string>)[field] = v; save(); };
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

/** Inline editor shown when entering a night manually (no Apple Health data yet). */
function SleepFields({ dk, sleep, onDone }: { dk: string; sleep: SleepShape; onDone: () => void }) {
  const p = usePalette();
  return (
    <View style={{ marginTop: 12 }}>
      <SleepEditFields dk={dk} sleep={sleep} />
      <Pressable onPress={onDone} style={({ pressed }) => [{ marginTop: 14, borderRadius: radius.control, backgroundColor: p.accent, paddingVertical: 13, alignItems: 'center' }, pressed && { opacity: 0.7 }]}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save sleep</Text>
      </Pressable>
    </View>
  );
}

/** Card-modal editor for a night that already has data — opened from "Edit sleep details". */
function SleepEditSheet({ dk, controls }: { dk: string; controls: SheetControls }) {
  const p = usePalette();
  const state = useAppState();
  const sleep = state.days[dk]?.sleep || { bed: '', wake: '' };
  return (
    <View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: p.text, marginBottom: 16 }}>Edit sleep details</Text>
      <SleepEditFields dk={dk} sleep={sleep} />
      <SheetFooter>
        <Pressable onPress={controls.close} style={({ pressed }) => [{ flex: 1, borderRadius: radius.control, backgroundColor: p.accent, paddingVertical: 13, alignItems: 'center' }, pressed && { opacity: 0.7 }]}>
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
          return (
            <Row key={m.id} icon={def.icon as never} title={def.label}
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
