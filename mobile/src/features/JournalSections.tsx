/**
 * The eight Journal sections: Sleep, Readings, Activities, Meds, Symptoms,
 * Food & Drink, Triggers, Digestion — each a Card with a header + "+ Add".
 */
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AddButton, Card, Muted, Pill, Row, RowValue, SectionHeader, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { TimeField } from '../components/Field';
import { radius, usePalette } from '../theme';
import {
  ACTIVITY_TYPES, MEAL_TYPES, MED_TYPES, READING_TYPES, SYMPTOM_TYPES, TRIGGER_TYPES,
  bmLabel, readingRowValue, summarizeFields,
} from '../lib/registry';
import { rowScoreCategory } from '../lib/scoring';
import { ensureDay, save, useAppState } from '../store/store';
import { fmtTime12, periodOf } from '../lib/dates';
import { useEntryForms } from './forms';
import { useDrawers } from './drawers';

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
            return <Row key={r.id} icon={def.icon as never} title={def.label} right={<View style={{ flexDirection: 'row', alignItems: 'center' }}><RowValue text={readingRowValue(r)} cat={rowScoreCategory(r, ctx)} />{r.time ? <Pill text={fmtTime12(r.time)} /> : null}</View>} onPress={() => forms.openReadingSummary(r)} />;
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
      {/* Food & Drink */}
      <Card>
        <SectionHeader title="Food & Drink" />
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          <Row icon="cup" title="Water" right={<Text style={{ color: p.text, fontWeight: '600' }}>{`${+(day.food?.water || 0)} L`}</Text>} onPress={drawers.water} />
          <Row icon="utensils" title="Meals" right={<Text style={{ color: p.text, fontWeight: '600' }}>{`${(day.food?.meals || []).reduce((s, m) => s + (parseInt(String(m.calories), 10) || 0), 0)} cal`}</Text>} onPress={drawers.meals} />
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

function SleepSection({ dk }: { dk: string }) {
  const p = usePalette();
  const state = useAppState();
  const sleep = state.days[dk]?.sleep || { bed: '', wake: '' };
  const setField = (field: string, v: string) => { (ensureDay(dk).sleep as never as Record<string, string>)[field] = v; save(); };
  return (
    <Card>
      <SectionHeader title="Sleep" />
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ flex: 1 }}><TimeField label="Wake time" value={sleep.wake} onChange={(v) => setField('wake', v)} /></View>
          <View style={{ flex: 1 }}><TimeField label="Bed time" value={sleep.bed} onChange={(v) => setField('bed', v)} /></View>
        </View>
        <Segmented options={[{ val: 'good', label: 'Good sleep' }, { val: 'interrupted', label: 'Interrupted' }]} value={(sleep.quality as 'good' | 'interrupted') || 'good'} onChange={(v) => setField('quality', v)} style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: p.textDim, marginBottom: 4, fontWeight: '600' }}>HR low</Text>
            <TextInput keyboardType="decimal-pad" defaultValue={sleep.hrLow != null ? String(sleep.hrLow) : ''} onEndEditing={(e) => setField('hrLow', e.nativeEvent.text)} style={inp(p)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: p.textDim, marginBottom: 4, fontWeight: '600' }}>HR high</Text>
            <TextInput keyboardType="decimal-pad" defaultValue={sleep.hrHigh != null ? String(sleep.hrHigh) : ''} onEndEditing={(e) => setField('hrHigh', e.nativeEvent.text)} style={inp(p)} />
          </View>
        </View>
      </View>
    </Card>
  );
}
const inp = (p: ReturnType<typeof usePalette>) => ({ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 11, fontSize: 15, color: p.text, minHeight: 44 });

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

export { MEAL_TYPES };
