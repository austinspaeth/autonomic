// FieldRenderer — renders a type's field schema into controlled inputs (legacy
// buildFieldInputs, docs/index.html:3932-3990). Number fields pack into rows of
// two (legacy .field-grid); signed numbers get a ± toggle; select/time/check/
// text/textarea handled per type. Values are held by the parent EntryForm.
import React from 'react';
import { View } from 'react-native';
import { type Field, type InputField, isDivider, isNumberField, fieldLabel } from '@core/domain/fieldSchema';
import { nowTime } from '@core/date/dateUtils';
import { Pressable, Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Field as FieldWrap, AppInput } from './Field';
import { Checkbox } from './fields/Checkbox';
import { Select } from './fields/Select';
import { TimeField } from './fields/TimeField';

export type Values = Record<string, string | boolean>;

export interface FieldRendererProps {
  fields: Field[];
  values: Values;
  onChange: (key: string, value: string | boolean) => void;
}

export function FieldRenderer({ fields, values, onChange }: FieldRendererProps) {
  const t = useTheme();
  const out: React.ReactNode[] = [];
  let run: InputField[] = [];

  const flushRun = (keyPrefix: string) => {
    if (!run.length) return;
    const items = run;
    run = [];
    if (items.length === 1) {
      out.push(<NumberField key={keyPrefix} f={items[0]} values={values} onChange={onChange} />);
      return;
    }
    // Legacy .field-grid is a 2-column grid: a run of N number fields flows two
    // per row (e.g. BP = Systolic/Diastolic, then Pulse).
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2);
      out.push(
        <View key={`${keyPrefix}-${i}`} style={{ flexDirection: 'row', gap: 10 }}>
          {pair.map((f) => (
            <View key={f.key} style={{ flex: 1, minWidth: 0 }}>
              <NumberField f={f} values={values} onChange={onChange} />
            </View>
          ))}
          {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>,
      );
    }
  };

  fields.forEach((f, idx) => {
    if (isNumberField(f)) {
      run.push(f as InputField);
      return;
    }
    flushRun(`run-${idx}`);
    if (isDivider(f)) {
      out.push(<View key={`div-${idx}`} style={{ height: 1, backgroundColor: t.border, marginBottom: 14 }} />);
      return;
    }
    const inf = f as InputField;
    const key = inf.key;
    const val = values[key];
    if (inf.type === 'select') {
      const options = inf.options || [];
      out.push(
        <FieldWrap key={key} label={fieldLabel(inf)}>
          <Select
            label={inf.label}
            options={options}
            value={typeof val === 'string' && val !== '' ? val : options[0] || ''}
            onChange={(v) => onChange(key, v)}
          />
        </FieldWrap>,
      );
    } else if (inf.type === 'time') {
      out.push(
        <FieldWrap key={key} label={inf.label || 'Time'}>
          <TimeField
            value={typeof val === 'string' && val ? val : nowTime()}
            onChange={(v) => onChange(key, v)}
          />
        </FieldWrap>,
      );
    } else if (inf.type === 'check') {
      out.push(
        <Checkbox key={key} label={inf.label} value={!!val} onChange={(v) => onChange(key, v)} />,
      );
    } else if (inf.type === 'textarea') {
      out.push(
        <FieldWrap key={key} label={inf.label}>
          <AppInput
            value={typeof val === 'string' ? val : ''}
            onChangeText={(v) => onChange(key, v)}
            placeholder={inf.placeholder || ''}
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
        </FieldWrap>,
      );
    } else if (inf.type === 'text') {
      out.push(
        <FieldWrap key={key} label={inf.label}>
          <AppInput
            value={typeof val === 'string' ? val : ''}
            onChangeText={(v) => onChange(key, v)}
            placeholder={inf.placeholder || ''}
          />
        </FieldWrap>,
      );
    }
  });
  flushRun('run-tail');

  return <>{out}</>;
}

function NumberField({
  f,
  values,
  onChange,
}: {
  f: InputField;
  values: Values;
  onChange: (key: string, value: string) => void;
}) {
  const t = useTheme();
  const val = values[f.key];
  const text = typeof val === 'string' ? val : val == null ? '' : String(val);
  const toggleSign = () => {
    const v = text.trim();
    if (v === '' || v === '-') return;
    onChange(f.key, v[0] === '-' ? v.slice(1) : '-' + v);
  };
  return (
    <FieldWrap label={fieldLabel(f)}>
      {f.signed ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <AppInput
            value={text}
            onChangeText={(v) => onChange(f.key, v)}
            keyboardType="numbers-and-punctuation"
            placeholder={f.placeholder || ''}
            style={{ flex: 1 }}
          />
          <Pressable
            onPress={toggleSign}
            accessibilityLabel="Toggle negative"
            style={{
              width: 47,
              borderWidth: 1,
              borderColor: t.border,
              borderRadius: t.radiusSm,
              backgroundColor: t.surface2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18, color: t.text }}>±</Text>
          </Pressable>
        </View>
      ) : (
        <AppInput
          value={text}
          onChangeText={(v) => onChange(f.key, v)}
          keyboardType="decimal-pad"
          placeholder={f.placeholder || ''}
        />
      )}
    </FieldWrap>
  );
}
