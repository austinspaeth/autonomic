// JournalScreen — the day view. Date navigation + the day's sections.
// (DaySummary score card + Sleep + the food/digestion sections land next; the
// four logging sections + date nav are wired here.)
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { type SharedValue } from 'react-native-reanimated';
import { keyOf, dateFromKey } from '@core/date/dateUtils';
import type { DateKey } from '@core/types';
import { READING_TYPES } from '@core/domain/readingTypes';
import { ACTIVITY_TYPES } from '@core/domain/activityTypes';
import { MED_TYPES, SYMPTOM_TYPES } from '@core/domain/otherTypes';
import { Screen } from '@ui/components/Screen';
import { DateBar } from '@ui/components/DateBar';
import { openCalendar } from '@ui/screens/drawers/CalendarDrawer';
import { DaySummary } from './DaySummary';
import { LoggedSection } from './LoggedSection';
import { SleepSection } from './SleepSection';
import { TriggersSection } from './TriggersSection';
import { FoodSection } from './FoodSection';
import { DigestionSection } from './DigestionSection';

const shift = (key: DateKey, delta: number): DateKey => {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + delta);
  return keyOf(d);
};

export function JournalScreen({ scrollY }: { scrollY: SharedValue<number> }) {
  const [dateKey, setDateKey] = useState<DateKey>(keyOf(new Date()));

  const onPrev = useCallback(() => setDateKey((k) => shift(k, -1)), []);
  const onNext = useCallback(
    () => setDateKey((k) => (k === keyOf(new Date()) ? k : shift(k, 1))),
    [],
  );

  // Web: ← / → arrow keys shift the day (legacy docs/index.html:1062-1070).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onPrev, onNext]);

  return (
    <Screen scrollY={scrollY}>
      <DateBar
        dateKey={dateKey}
        onPrev={onPrev}
        onNext={onNext}
        onPickDate={() => openCalendar(dateKey, setDateKey)}
      />
      <View style={{ height: 4 }} />
      <DaySummary dateKey={dateKey} />
      <SleepSection dateKey={dateKey} />
      <LoggedSection
        title="Readings"
        addLabel="Add reading"
        emptyText="No readings yet."
        typeMap={READING_TYPES}
        arrKey="readings"
        dateKey={dateKey}
        showValue
        showPeriod
        summary
      />
      <LoggedSection
        title="Activities"
        addLabel="Add activity"
        emptyText="No activities yet."
        typeMap={ACTIVITY_TYPES}
        arrKey="activities"
        dateKey={dateKey}
        showValue
        showTime
      />
      <LoggedSection
        title="Medications & Supplements"
        addLabel="Add medication or supplement"
        emptyText="No medications or supplements taken yet."
        typeMap={MED_TYPES}
        arrKey="meds"
        dateKey={dateKey}
        showPeriod
      />
      <LoggedSection
        title="Symptoms"
        addLabel="Add symptom"
        emptyText="No symptoms logged yet."
        typeMap={SYMPTOM_TYPES}
        arrKey="symptoms"
        dateKey={dateKey}
        showValue
        showTime
      />
      <TriggersSection dateKey={dateKey} />
      <FoodSection dateKey={dateKey} />
      <DigestionSection dateKey={dateKey} />
    </Screen>
  );
}
