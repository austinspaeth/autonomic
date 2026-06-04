// Food & Drink — Water (cups/L) + Meals (legacy renderFoodDrink/waterDrawer/
// mealsDrawer, docs/index.html:2604-2782). Water tap opens a stepper drawer;
// Meals tap opens a list + add-meal form.
import React, { useState } from 'react';
import { View } from 'react-native';
import type { DateKey, Entry } from '@core/types';
import { MEAL_TYPES } from '@core/domain/otherTypes';
import { uid } from '@core/date/dateUtils';
import { useRepository, useRepoSelector } from '@data/RepositoryProvider';
import { Text } from '@ui/primitives';
import { Section, Muted } from '@ui/components/Section';
import { Row } from '@ui/components/Row';
import { Button } from '@ui/components/Button';
import { H2, H3 } from '@ui/components/SheetText';
import { Field, AppInput } from '@ui/forms/Field';
import { Stepper } from '@ui/forms/Stepper';
import { SegmentedControl } from '@ui/forms/SegmentedControl';
import { openSheet, type SheetApi } from '@ui/sheets/useSheets';
import { useTheme } from '@ui/theme/ThemeProvider';

export function FoodSection({ dateKey }: { dateKey: DateKey }) {
  const food = useRepoSelector((r) => r.getDay(dateKey).food);
  const totalCal = (food.meals || []).reduce((s, m) => s + (parseInt(String(m.calories), 10) || 0), 0);

  return (
    <Section title="Food & Drink">
      <Row first icon="cup" title="Water" value={`${+food.water || 0} L`} onPress={() => openWater(dateKey)} />
      <Row icon="utensils" title="Meals" value={`${totalCal} cal`} onPress={() => openMeals(dateKey)} />
    </Section>
  );
}

function WaterBody({ dateKey }: { dateKey: DateKey }) {
  const repo = useRepository();
  const water = useRepoSelector((r) => r.getDay(dateKey).food.water);
  return (
    <>
      <H2>Water</H2>
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        <Stepper
          value={+water || 0}
          step={0.25}
          format={(v) => `${v} L`}
          onChange={(v) => repo.updateDay(dateKey, (d) => { d.food = { ...d.food, water: v }; })}
        />
      </View>
    </>
  );
}
function openWater(dateKey: DateKey) {
  openSheet(() => <WaterBody dateKey={dateKey} />);
}

const MEAL_OPTIONS = Object.entries(MEAL_TYPES).map(([value, label]) => ({ value, label: label as string }));

function MealsBody({ dateKey, api }: { dateKey: DateKey; api: SheetApi }) {
  const t = useTheme();
  const repo = useRepository();
  const meals = useRepoSelector((r) => r.getDay(dateKey).food.meals);
  return (
    <>
      <H2>Meals</H2>
      {meals.length === 0 ? <Muted>No meals logged.</Muted> : null}
      {meals.map((m, i) => (
        <Row
          key={m.id}
          first={i === 0}
          title={(MEAL_TYPES as Record<string, string>)[String(m.type)] || 'Meal'}
          sub={m.note ? String(m.note) : undefined}
          value={m.calories ? `${m.calories} cal` : undefined}
          onPress={() => openMealForm(dateKey, m)}
        />
      ))}
      <View style={{ marginTop: 16 }}>
        <Button title="+ Add meal" variant="dashed" onPress={() => openMealForm(dateKey)} />
      </View>
    </>
  );
}
function openMeals(dateKey: DateKey) {
  openSheet((api) => <MealsBody dateKey={dateKey} api={api} />);
}

function MealFormBody({ dateKey, existing, api }: { dateKey: DateKey; existing?: Entry; api: SheetApi }) {
  const repo = useRepository();
  const [type, setType] = useState(String(existing?.type ?? 'breakfast'));
  const [calories, setCalories] = useState(String(existing?.calories ?? ''));
  const [note, setNote] = useState(String(existing?.note ?? ''));

  const save = () => {
    const rec: Entry = { id: existing?.id ?? uid(), type, calories: calories.trim(), note: note.trim() };
    repo.updateDay(dateKey, (d) => {
      const arr = d.food.meals || [];
      const idx = arr.findIndex((x) => x.id === rec.id);
      if (idx >= 0) arr[idx] = rec;
      else arr.push(rec);
      d.food = { ...d.food, meals: arr };
    });
    api.close();
  };
  const del = () => {
    repo.updateDay(dateKey, (d) => {
      d.food = { ...d.food, meals: (d.food.meals || []).filter((x) => x.id !== existing?.id) };
    });
    api.close();
  };

  return (
    <>
      <H2>{existing ? 'Edit meal' : 'Add meal'}</H2>
      <H3>Meal</H3>
      <SegmentedControl options={MEAL_OPTIONS} value={type} onChange={setType} />
      <Field label="Calories">
        <AppInput value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholder="cal" />
      </Field>
      <Field label="Notes">
        <AppInput value={note} onChangeText={setNote} placeholder="Optional note" multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
      </Field>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        {existing ? (
          <View style={{ flex: 1 }}>
            <Button title="Delete" variant="danger" onPress={del} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button title="Save" variant="primary" onPress={save} />
        </View>
      </View>
    </>
  );
}
function openMealForm(dateKey: DateKey, existing?: Entry) {
  openSheet((api) => <MealFormBody dateKey={dateKey} existing={existing} api={api} />);
}
