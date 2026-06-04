// Profile drawer — sex / birthday / weight / height (legacy openProfile,
// docs/index.html:4468-4502). Feeds reading scores (sex-adjusted QTc, BMI).
import React, { useState } from 'react';
import { View } from 'react-native';
import { ageFromBirthday } from '@core/date/dateUtils';
import type { Sex } from '@core/types';
import { useRepository } from '@data/RepositoryProvider';
import { Text } from '@ui/primitives';
import { Button } from '@ui/components/Button';
import { H2 } from '@ui/components/SheetText';
import { Field, AppInput } from '@ui/forms/Field';
import { SegmentedControl } from '@ui/forms/SegmentedControl';
import { openSheet, type SheetApi } from '@ui/sheets/useSheets';
import { useTheme } from '@ui/theme/ThemeProvider';

function ProfileBody({ api }: { api: SheetApi }) {
  const t = useTheme();
  const repo = useRepository();
  const existing = repo.getProfile();
  const [sex, setSex] = useState<Sex>(existing.sex || '');
  const [birthday, setBirthday] = useState(existing.birthday || '');
  const [weight, setWeight] = useState(existing.weight || '');
  const [height, setHeight] = useState(existing.height || '');

  const age = ageFromBirthday(birthday);

  const save = () => {
    repo.setProfile({ sex, birthday: birthday.trim(), weight: weight.trim(), height: height.trim() });
    api.closeAll();
  };

  return (
    <>
      <H2>Profile</H2>
      <Field label="Sex">
        <SegmentedControl<Sex>
          options={[
            { value: '', label: 'Not set' },
            { value: 'Male', label: 'Male' },
            { value: 'Female', label: 'Female' },
          ]}
          value={sex}
          onChange={setSex}
        />
      </Field>
      <Field label="Birthday">
        <AppInput value={birthday} onChangeText={setBirthday} placeholder="YYYY-MM-DD" autoCapitalize="none" />
      </Field>
      <Text style={{ fontSize: 12.5, color: t.textDim, marginTop: -6, marginBottom: 8 }}>
        {age != null ? `Age: ${age}` : 'Age: not set'}
      </Text>
      <Field label="Weight (lb)">
        <AppInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="lb" />
      </Field>
      <Field label="Height (in)">
        <AppInput value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="in" />
      </Field>
      <Text style={{ fontSize: 12.5, color: t.textDim, lineHeight: 18, marginBottom: 18 }}>
        Used to personalize reading scores (e.g. sex-adjusted QTc; birthday/height/weight for upcoming
        indexes).
      </Text>
      <View style={{ marginTop: 4 }}>
        <Button title="Save" variant="primary" onPress={save} />
      </View>
    </>
  );
}

export function openProfile() {
  openSheet((api) => <ProfileBody api={api} />);
}
