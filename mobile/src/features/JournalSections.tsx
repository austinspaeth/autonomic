/**
 * The Journal sections: Sleep, Readings, Activities, Meds, Symptoms,
 * Triggers, Hydration, Digestion — each a Card with a header + "+ Add".
 */
import React, { useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Platform, Pressable, Text, TextInput, UIManager, View } from 'react-native';
import { AddButton, Card, Muted, Pill, Row, RowValue, SectionHeader, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { TimeField } from '../components/Field';
import { useSheets } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import {
  ACTIVITY_TYPES, MED_TYPES, READING_TYPES, SYMPTOM_TYPES, TRIGGER_TYPES,
  bmLabel, readingLabel, readingRowValue, summarizeFields,
} from '../lib/registry';
import { rowScoreCategory, SCORE_COLORS, GRADE_LABEL } from '../lib/scoring';
import { sleepGrade, sleepHours } from '../lib/scoring/day';
import { ensureDay, save, useAppState } from '../store/store';
import { fmtTime12, periodOf } from '../lib/dates';
import { health } from '../lib/health';
import { SleepConfirmSheet } from './Health';
import { useEntryForms } from './forms';
import { useDrawers } from './drawers';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const hexA = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function JournalSections({ dk }: { dk: string }) {
  const p = usePalette();
  const state = useAppState();
  const d = state.days[dk];
  const ctx = { sex: state.profile.sex, height: state.profile.height };
  const forms = useEntryForms(dk);
  const drawers = useDrawers(dk);
  const day = d || { readings: [], activities: [], meds: [], symptoms: [], sleep: { bed: '', wake: '' }, food: { water: 0, meals: [], triggers: {} }, digestion: { movements: [] } };

  return (
    <>
      <SleepSection dk={dk} />
      {/* Readings */}
      <Card>
        <SectionHeader title="Readings" action={<AddButton onPress={forms.pickReading} />} />
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {(day.readings || []).length === 0 ? <Muted>No readings yet.</Muted> : [...day.readings].sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || '')).map((r) => {
            const def = READING_TYPES[r.type];
            if (!def) return null;
            return <Row key={r.id} icon={def.icon as never} title={readingLabel(r)} right={<View style={{ flexDirection: 'row', alignItems: 'center' }}><RowValue text={readingRowValue(r)} cat={rowScoreCategory(r, ctx)} />{r.time ? <Pill text={fmtTime12(r.time)} /> : null}</View>} onPress={() => forms.openReadingSummary(r)} />;
          })}
        </View>
      </Card>
      {/* Activities */}
      <Card>
        <SectionHeader title="Activities" action={<AddButton onPress={forms.pickActivity} />} />
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {(day.activities || []).length === 0 ? <Muted>No activities yet.</Muted> : [...day.activities].sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || '')).map((a) => {
            const def = ACTIVITY_TYPES[a.type];
            if (!def) return null;
            const headline = def.summary ? def.summary(a) : summarizeFields(def, a);
            return <Row key={a.id} icon={def.icon as never} title={def.label} right={<View style={{ flexDirection: 'row', alignItems: 'center' }}>{headline ? <Text style={{ color: p.text, fontWeight: '600' }}>{headline}</Text> : null}{a.time ? <Pill text={fmtTime12(a.time)} /> : null}</View>} onPress={() => forms.openActivityForm(a.type, a)} />;
          })}
        </View>
      </Card>
      {/* Meds */}
      <LoggedSection title="Medications & Supplements" dk={dk} arr="meds" typeMap={MED_TYPES} empty="No medications or supplements taken yet." onAdd={forms.pickMed} onOpen={forms.openMed} showPeriod />
      {/* Symptoms */}
      <LoggedSection title="Symptoms" dk={dk} arr="symptoms" typeMap={SYMPTOM_TYPES} empty="No symptoms logged yet." onAdd={forms.pickSymptom} onOpen={forms.openSymptom} showValue showTime />
      {/* Triggers */}
      <TriggerSection dk={dk} onAdd={drawers.triggers} />
      {/* Hydration */}
      <Card>
        <SectionHeader title="Hydration" />
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          <Row icon="cup" title="Water" right={<Text style={{ color: p.text, fontWeight: '600' }}>{`${+(day.food?.water || 0)} L`}</Text>} onPress={drawers.water} />
        </View>
      </Card>
      {/* Digestion */}
      <Card>
        <SectionHeader title="Bowel Movements" action={<AddButton onPress={() => drawers.bowel(null)} />} />
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {(day.digestion?.movements || []).length === 0 ? <Muted>No bowel movements logged.</Muted> : [...(day.digestion.movements)].sort((a, b) => (a.time || '').localeCompare(b.time || '')).map((m) => (
            <Row key={m.id} icon="poop" title={bmLabel(m)} right={m.time ? <Pill text={fmtTime12(m.time)} /> : undefined} onPress={() => drawers.bowel(m)} />
          ))}
        </View>
      </Card>
    </>
  );
}

const GRADE_SLEEP_LABEL: Record<string, string> = { great: 'Great', good: 'Good', ok: 'OK', bad: 'Poor', crash: 'Very poor' };

function SleepSection({ dk }: { dk: string }) {
  const p = usePalette();
  const state = useAppState();
  const toast = useToast();
  const { openSheet } = useSheets();
  const sleep = state.days[dk]?.sleep || { bed: '', wake: '' };
  const hasData = !!(sleep.bed && sleep.wake);
  const api = health();
  const canHealth = api.available && Platform.OS === 'ios';

  const [manual, setManual] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const toggleManual = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setManual((v) => !v); };

  const checkHealth = async () => {
    setSyncing(true);
    try {
      const s = await api.readSleep(dk);
      setSyncing(false);
      if (!s) { toast('No sleep data from Apple Health yet'); return; }
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
                    Waiting for last night&rsquo;s sleep from Apple Health. It can take a while after you wake for the data to be ready — check back, or enter it yourself.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={checkHealth} disabled={syncing} style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, paddingVertical: 12 }, pressed && { opacity: 0.6 }]}>
                    {syncing ? <ActivityIndicator size="small" color={p.textDim} /> : <Icon name="download" size={16} color={p.text} />}
                    <Text style={{ color: p.text, fontWeight: '600' }}>{syncing ? 'Checking…' : 'Check for updates'}</Text>
                  </Pressable>
                  <Pressable onPress={toggleManual} style={({ pressed }) => [{ flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: manual ? p.accent : p.border, backgroundColor: manual ? p.accentSoft : p.surface2, paddingVertical: 12 }, pressed && { opacity: 0.6 }]}>
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
        {(manual || hasData) ? <SleepFields dk={dk} sleep={sleep} startOpen={hasData} expanded={manual} onToggle={toggleManual} /> : null}
      </View>
    </Card>
  );
}

/** Graded summary of a night with data: colored fill, grade chip, hours + HR range. */
function SleepGrade({ dk, sleep }: { dk: string; sleep: { bed: string; wake: string; quality?: string; hrLow?: string | number; hrHigh?: string | number } }) {
  const p = usePalette();
  const state = useAppState();
  const grade = sleepGrade(state.days, dk);
  const hrs = sleepHours(state.days, dk);
  const color = grade ? SCORE_COLORS[grade] : p.textDim;
  const hrRange = sleep.hrLow != null && sleep.hrLow !== '' && sleep.hrHigh != null && sleep.hrHigh !== ''
    ? `${sleep.hrLow}–${sleep.hrHigh} bpm`
    : sleep.hrLow != null && sleep.hrLow !== '' ? `${sleep.hrLow} bpm low` : null;
  return (
    <View style={{ borderWidth: 1, borderRadius: radius.card, padding: 14, marginBottom: 2, backgroundColor: hexA(color, 0.12), borderColor: hexA(color, 0.4) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700' }}>Last night&rsquo;s sleep</Text>
        {grade ? <View style={{ backgroundColor: color, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999 }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>{GRADE_SLEEP_LABEL[grade] || GRADE_LABEL[grade]}</Text></View> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
        <Text style={{ fontSize: 38, fontWeight: '800', color: p.text, fontVariant: ['tabular-nums'] }}>{hrs != null ? hrs.toFixed(1) : '–'}</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: p.textDim, marginLeft: 4 }}>hours</Text>
      </View>
      <Text style={{ fontSize: 13, color: p.textDim, marginTop: 4 }}>
        {`${fmtTime12(sleep.bed)} → ${fmtTime12(sleep.wake)}`}
        {sleep.quality === 'interrupted' ? ' · Interrupted' : ''}
        {hrRange ? ` · HR ${hrRange}` : ''}
      </Text>
    </View>
  );
}

/** The editable sleep fields, shown in the manual editor and when data exists. */
function SleepFields({ dk, sleep, startOpen, expanded, onToggle }: { dk: string; sleep: { bed: string; wake: string; quality?: string; hrLow?: string | number; hrHigh?: string | number }; startOpen: boolean; expanded: boolean; onToggle: () => void }) {
  const p = usePalette();
  const setField = (field: string, v: string) => { (ensureDay(dk).sleep as never as Record<string, string>)[field] = v; save(); };
  // When data already exists, show a compact "Edit" affordance that expands the
  // fields; when the user tapped "Enter manually" (no data), show them directly.
  const show = startOpen ? expanded : true;
  return (
    <View style={{ marginTop: startOpen ? 10 : 12 }}>
      {startOpen ? (
        <Pressable onPress={onToggle} hitSlop={6} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }, pressed && { opacity: 0.5 }]}>
          <Icon name={expanded ? 'chevron' : 'edit'} size={15} color={p.accent} />
          <Text style={{ color: p.accent, fontWeight: '600', fontSize: 13 }}>{expanded ? 'Done editing' : 'Edit sleep details'}</Text>
        </Pressable>
      ) : null}
      {show ? (
        <View style={{ marginTop: startOpen ? 12 : 0 }}>
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
          {!startOpen ? (
            <Pressable onPress={onToggle} style={({ pressed }) => [{ marginTop: 14, borderRadius: radius.control, backgroundColor: p.accent, paddingVertical: 13, alignItems: 'center' }, pressed && { opacity: 0.7 }]}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save sleep</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
const inp = (p: ReturnType<typeof usePalette>) => ({ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 11, fontSize: 16, color: p.text, minHeight: 44 });

function LoggedSection({ title, dk, arr, typeMap, empty, onAdd, onOpen, showValue, showTime, showPeriod }: {
  title: string; dk: string; arr: 'meds' | 'symptoms'; typeMap: Record<string, { label: string; icon: string; summary?: (r: never) => string }>; empty: string;
  onAdd: () => void; onOpen: (r: never) => void; showValue?: boolean; showTime?: boolean; showPeriod?: boolean;
}) {
  const state = useAppState();
  const p = usePalette();
  const list = [...(state.days[dk]?.[arr] || [])].sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
  return (
    <Card>
      <SectionHeader title={title} action={<AddButton onPress={onAdd} />} />
      <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
        {list.length === 0 ? <Muted>{empty}</Muted> : list.map((m) => {
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
      </View>
    </Card>
  );
}

function TriggerSection({ dk, onAdd }: { dk: string; onAdd: () => void }) {
  const p = usePalette();
  const state = useAppState();
  const trigs = state.days[dk]?.food?.triggers || {};
  const keys = Object.keys(trigs).filter((k) => trigs[k] > 0 && TRIGGER_TYPES[k]);
  return (
    <Card>
      <SectionHeader title="Triggers" action={<AddButton onPress={onAdd} />} />
      <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
        {keys.length === 0 ? <Muted>No triggers logged.</Muted> : keys.map((k) => (
          <Row key={k} icon="alert" title={TRIGGER_TYPES[k].label} right={<Pressable onPress={() => { delete ensureDay(dk).food.triggers[k]; save(); }} hitSlop={8}><Icon name="x" size={18} color={p.textDim} /></Pressable>} />
        ))}
      </View>
    </Card>
  );
}
