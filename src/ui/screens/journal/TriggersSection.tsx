// Triggers — per-type count map under day.food.triggers (legacy renderTriggers/
// triggerMenu, docs/index.html:2637-2806). "+ Add" picks a trigger (increments
// its count); tapping a row removes it.
import React, { useState } from 'react';
import type { DateKey } from '@core/types';
import { TRIGGER_TYPES } from '@core/domain/otherTypes';
import { useRepository, useRepoSelector } from '@data/RepositoryProvider';
import type { IconName } from '@ui/primitives';
import { Section, AddLink, Muted } from '@ui/components/Section';
import { Row } from '@ui/components/Row';
import { H2 } from '@ui/components/SheetText';
import { MenuItem } from '@ui/components/MenuItem';
import { AppInput, Field } from '@ui/forms/Field';
import { openSheet } from '@ui/sheets/useSheets';

export function TriggersSection({ dateKey }: { dateKey: DateKey }) {
  const repo = useRepository();
  const triggers = useRepoSelector((r) => r.getDay(dateKey).food.triggers);
  const keys = Object.keys(triggers).filter((k) => triggers[k] > 0 && TRIGGER_TYPES[k]);

  const remove = (k: string) =>
    repo.updateDay(dateKey, (d) => {
      const next = { ...d.food.triggers };
      delete next[k];
      d.food = { ...d.food, triggers: next };
    });

  return (
    <Section title="Triggers" action={<AddLink onPress={() => openTriggerPicker(dateKey)} />}>
      {keys.length === 0 ? (
        <Muted>No triggers logged.</Muted>
      ) : (
        keys.map((k, i) => (
          <Row
            key={k}
            first={i === 0}
            icon={TRIGGER_TYPES[k].icon as IconName}
            title={TRIGGER_TYPES[k].label}
            value={triggers[k] > 1 ? `×${triggers[k]}` : undefined}
            onPress={() => remove(k)}
          />
        ))
      )}
    </Section>
  );
}

function TriggerPickerBody({ dateKey }: { dateKey: DateKey }) {
  const repo = useRepository();
  const [q, setQ] = useState('');
  const types = Object.keys(TRIGGER_TYPES);
  const matches = types.filter((k) => TRIGGER_TYPES[k].label.toLowerCase().includes(q.trim().toLowerCase()));
  const add = (k: string) =>
    repo.updateDay(dateKey, (d) => {
      const next = { ...d.food.triggers };
      next[k] = (next[k] || 0) + 1;
      d.food = { ...d.food, triggers: next };
    });
  return (
    <>
      <H2>Add trigger</H2>
      <Field>
        <AppInput value={q} onChangeText={setQ} placeholder="Filter…" autoCapitalize="none" />
      </Field>
      {matches.map((k) => (
        <MenuItem key={k} icon={TRIGGER_TYPES[k].icon as IconName} title={TRIGGER_TYPES[k].label} onPress={() => add(k)} />
      ))}
    </>
  );
}
function openTriggerPicker(dateKey: DateKey) {
  openSheet(() => <TriggerPickerBody dateKey={dateKey} />);
}
