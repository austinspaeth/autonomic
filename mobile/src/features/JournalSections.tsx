/**
 * The Journal sections: Sleep, Readings, Activities, Meds, Symptoms,
 * Triggers, Hydration, Digestion — each a Card with a header + "+ Add".
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Platform, Pressable, Text, TextInput, UIManager, View } from 'react-native';
import { AddDashButton, Card, Pill, Row, RowValue, SectionHeader, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { TimeField } from '../components/Field';
import { useSheets, SheetFooter, type SheetControls } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import {
  READING_TYPES,
  bmLabel, readingLabel, readingRowValue, summarizeFields,
} from '../lib/registry';
import { typesFor } from '../lib/typeCatalog';
import { rowScoreCategory, SCORE_COLORS, GRADE_LABEL } from '../lib/scoring';
import { sleepGrade, sleepHours } from '../lib/scoring/day';
import { ensureDay, getState, save, useAppState } from '../store/store';
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
        <SectionHeader title="Readings" />
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {[...(day.readings || [])].sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || '')).map((r) => {
            const def = READING_TYPES[r.type];
            if (!def) return null;
            return <Row key={r.id} icon={def.icon as never} title={readingLabel(r)} right={<View style={{ flexDirection: 'row', alignItems: 'center' }}><RowValue text={readingRowValue(r)} cat={rowScoreCategory(r, ctx)} />{r.time ? <Pill text={fmtTime12(r.time)} /> : null}</View>} onPress={() => forms.openReadingSummary(r)} />;
          })}
          <View style={{ gap: 8, marginTop: 6 }}>
            <Pressable onPress={forms.captureHrv} style={({ pressed }) => [{ flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: p.accent, borderRadius: radius.control, paddingVertical: 13 }, pressed && { opacity: 0.7 }]}>
              <Icon name="activity" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Capture HRV reading</Text>
            </Pressable>
            <AddDashButton onPress={forms.pickReading} label="+ Add reading" />
          </View>
        </View>
      </Card>
      {/* Activities */}
      <Card>
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
      <Card>
        <SectionHeader title="Hydration" />
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          <Row icon="cup" title="Water" noDivider right={<Text style={{ color: p.text, fontWeight: '600' }}>{`${+(day.food?.water || 0)} L`}</Text>} onPress={drawers.water} />
        </View>
      </Card>
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

/** Free-text day notes. Auto-saves as you type (no save button); the text is
 *  only surfaced when building AI-insights prompts. */
function NotesSection({ dk }: { dk: string }) {
  const p = usePalette();
  const [text, setText] = useState(() => getState().days[dk]?.notes || '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  const commit = (v: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    pending.current = null;
    const d = ensureDay(dk);
    if ((d.notes || '') === v) return;
    d.notes = v;
    save();
  };

  // Swap in the new day's note on day change; flush any pending write for the
  // old day first (the cleanup closure still holds the old `commit`/`dk`).
  useEffect(() => {
    setText(getState().days[dk]?.notes || '');
    return () => { if (pending.current != null) commit(pending.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dk]);

  const onChange = (v: string) => {
    setText(v);
    pending.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), 500);
  };

  return (
    <Card>
      <SectionHeader title="Notes" />
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <TextInput
          value={text}
          onChangeText={onChange}
          onEndEditing={() => commit(text)}
          multiline
          keyboardAppearance="dark"
          placeholder="Write anything about your health or experiences today."
          placeholderTextColor={p.textDim}
          style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12, fontSize: 15, lineHeight: 21, color: p.text, minHeight: 90, textAlignVertical: 'top' }}
        />
      </View>
    </Card>
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
                    Waiting for last night&rsquo;s sleep from Apple Health. It can take a while after you wake for the data to be ready. Check back, or enter it yourself.
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
        {grade ? <View style={{ backgroundColor: color, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999 }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>{GRADE_LABEL[grade]}</Text></View> : null}
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
