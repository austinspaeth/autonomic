/**
 * Form controls for the typed field schema (number/select/time/check/text/
 * textarea/divider). buildFieldInputs mirrors the PWA: consecutive number
 * fields are grouped 2-up; everything else is full width. A tiny controlled
 * form-state hook collects values keyed by field key.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { radius, space, usePalette } from '../theme';
import { Button } from './ui';
import { SheetControls, useSheets } from './Sheet';
import type { Entry, FieldDef } from '../lib/types';
import { fieldLabel, isDivider, isNumberField } from '../lib/registry';
import { fmtTime12, nowTime } from '../lib/dates';


export type FormState = Record<string, string | boolean>;

export function useFormState(fields: FieldDef[], initial: Entry): [FormState, (k: string, v: string | boolean) => void] {
  const [state, setState] = useState<FormState>(() => {
    const s: FormState = {};
    fields.forEach((f) => {
      if (isDivider(f) || !f.key) return;
      if (f.type === 'check') s[f.key] = !!initial[f.key];
      else if (f.type === 'select') s[f.key] = (initial[f.key] as string) ?? (f.options ? f.options[0] : '');
      else if (f.type === 'time') s[f.key] = (initial[f.key] as string) || nowTime();
      else s[f.key] = initial[f.key] != null ? String(initial[f.key]) : '';
    });
    return s;
  });
  const set = (k: string, v: string | boolean) => setState((prev) => ({ ...prev, [k]: v }));
  return [state, set];
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <Text style={{ fontSize: 14, fontWeight: '600', color: p.textDim, marginBottom: 6 }}>{children}</Text>;
}

export function TextField({ label, value, onChange, keyboardType, placeholder, multiline, signed, onToggleSign }: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad'; placeholder?: string; multiline?: boolean;
  signed?: boolean; onToggleSign?: () => void;
}) {
  const p = usePalette();
  const input = (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType={keyboardType || 'default'}
      placeholder={placeholder || '-'}
      placeholderTextColor={p.textDim}
      multiline={multiline}
      style={[
        { flex: 1, backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12, fontSize: 17, color: p.text },
        multiline && { minHeight: 80, textAlignVertical: 'top' },
      ]}
    />
  );
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      <FieldLabel>{label}</FieldLabel>
      {signed ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {input}
          <Pressable onPress={onToggleSign} style={{ width: 42, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: p.text, fontSize: 19, fontWeight: '700' }}>±</Text>
          </Pressable>
        </View>
      ) : input}
    </View>
  );
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const p = usePalette();
  return (
    <View style={{ marginBottom: 14 }}>
      <FieldLabel>{label}</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const active = o === value;
          return (
            <Pressable key={o} onPress={() => onChange(o)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
              <Text style={{ color: active ? p.accent : p.text, fontWeight: active ? '700' : '500' }}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Contents of the time-picker sheet: spinner + full-width red Save. */
function TimePickerSheet({ label, value, onChange, controls }: { label: string; value: string; onChange: (v: string) => void; controls: SheetControls }) {
  const p = usePalette();
  const [h, m] = (value || '00:00').split(':').map(Number);
  const base = new Date();
  base.setHours(h || 0, m || 0, 0, 0);
  // Draft the spinner value locally so nothing commits until "Save".
  const [draft, setDraft] = useState(base);
  const commit = () => {
    onChange(`${String(draft.getHours()).padStart(2, '0')}:${String(draft.getMinutes()).padStart(2, '0')}`);
    controls.close();
  };
  return (
    <View>
      {/* Title vertically aligned with the sheet's ✕ (top:12, h:32 → centered on 28px). */}
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, lineHeight: 32, marginTop: -12, marginBottom: 12 }}>{label}</Text>
      <DateTimePicker
        value={draft}
        mode="time"
        display="spinner"
        textColor="#ffffff"
        themeVariant="dark"
        style={{ height: 180 }}
        onChange={(_, date) => { if (date) setDraft(date); }}
      />
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <Button title="Save" variant="primary" onPress={commit} />
      </View>
    </View>
  );
}

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const open = () => openSheet(
    (c) => <TimePickerSheet label={label} value={value} onChange={onChange} controls={c} />,
    { fitContent: true },
  );
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable onPress={open} style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 13, minHeight: 47 }}>
        <Text style={{ color: value ? p.text : p.textDim, fontSize: 17 }}>{value ? fmtTime12(value) : 'Set time'}</Text>
      </Pressable>
    </View>
  );
}

export function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <View style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: p.text, fontSize: 16 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: p.accent }} />
    </View>
  );
}

/** Render the ordered field schema, grouping runs of number fields 2-up. */
export function FieldInputs({ fields, form, set }: { fields: FieldDef[]; form: FormState; set: (k: string, v: string | boolean) => void }) {
  const p = usePalette();
  const out: React.ReactNode[] = [];
  let run: FieldDef[] = [];
  const flush = () => {
    if (!run.length) return;
    // Chunk consecutive number fields into rows of at most 2.
    for (let i = 0; i < run.length; i += 2) {
      const pair = run.slice(i, i + 2);
      if (pair.length === 1) {
        const f = pair[0];
        out.push(<NumField key={f.key} f={f} form={form} set={set} />);
      } else {
        out.push(
          <View key={`grid-${pair[0].key}`} style={{ flexDirection: 'row', gap: 10 }}>
            {pair.map((f) => <NumField key={f.key} f={f} form={form} set={set} />)}
          </View>,
        );
      }
    }
    run = [];
  };
  fields.forEach((f) => {
    if (isNumberField(f)) { run.push(f); return; }
    flush();
    if (isDivider(f)) out.push(<View key={`div-${out.length}`} style={{ height: 1, backgroundColor: p.border, marginVertical: 6, marginBottom: 18 }} />);
    else if (f.type === 'select') out.push(<SelectField key={f.key} label={fieldLabel(f)} value={form[f.key!] as string} options={f.options || []} onChange={(v) => set(f.key!, v)} />);
    else if (f.type === 'time') out.push(<TimeField key={f.key} label={f.label || 'Time'} value={form[f.key!] as string} onChange={(v) => set(f.key!, v)} />);
    else if (f.type === 'check') out.push(<CheckField key={f.key} label={f.label || ''} value={!!form[f.key!]} onChange={(v) => set(f.key!, v)} />);
    else if (f.type === 'textarea') out.push(<TextField key={f.key} label={f.label || ''} value={form[f.key!] as string} onChange={(v) => set(f.key!, v)} placeholder={f.placeholder} multiline />);
    else if (f.type === 'text') out.push(<TextField key={f.key} label={f.label || ''} value={form[f.key!] as string} onChange={(v) => set(f.key!, v)} placeholder={f.placeholder} />);
  });
  flush();
  return <>{out}</>;
}

function NumField({ f, form, set }: { f: FieldDef; form: FormState; set: (k: string, v: string | boolean) => void }) {
  const v = form[f.key!] as string;
  return (
    <TextField
      label={fieldLabel(f)}
      value={v}
      onChange={(nv) => set(f.key!, nv)}
      keyboardType="decimal-pad"
      signed={f.signed}
      onToggleSign={() => {
        const cur = (v || '').trim();
        if (cur === '' || cur === '-') return;
        set(f.key!, cur[0] === '-' ? cur.slice(1) : '-' + cur);
      }}
    />
  );
}

export const fieldStyles = StyleSheet.create({ pad: { padding: space.md } });
