/**
 * Cycle history: where today sits, the month as the model sees it, and the
 * recent cycles as a table. Opened from the Journal chip, the Cycle row and
 * Settings → Cycle.
 *
 * The calendar is the Journal's own `MonthGrid`, with phase in place of score.
 * Two honesty rules are drawn, not just written: a PREDICTED day is outlined
 * and never filled (a forecast must not look like a logged day), and an
 * ovulation mark says its basis — filled when the temperature found it,
 * hollow when it was counted.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SheetFooter, useSheets, type SheetControls } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { MonthGrid } from '../Calendar';
import { MetricByPhase, ScoreByCycleDay } from './CycleCharts';
import { cycleMetricValue, type CycleRowId } from '../../lib/insights/cycle';
import { profileCtx } from '../../lib/scoring';
import { radius, usePalette } from '../../theme';
import { chipLabel, forecastLine, shortDay } from '../../lib/cycle/copy';
import { PATTERN_MIN_CYCLES, type CycleModel } from '../../lib/cycle';
import { dateFromKey, todayKey } from '../../lib/dates';
import { useAppState, useCycleModel } from '../../store/store';
import { CycleRing } from './CycleRing';
import { CycleEntrySheet } from './CycleEntry';
import { PrivacyLine } from './parts';

/** Logged period days are solid white with dark numbers: the one fact on the
 *  calendar that is recorded rather than worked out. */
const PERIOD_FILL = '#f2f2f5';
const PERIOD_INK = '#111113';
/** Ovulation, a dot under the day's number: purple when estimated (counted
 *  back from a period), blue when an overnight temperature rise found it. */
const OV_EST = '#a78bfa';
const OV_TEMP = '#4a9de0';
/** A predicted day's dashed outline. */
const PERIOD_EDGE = 'rgba(255,255,255,0.45)';


export function CycleHistorySheet({ controls }: { controls: SheetControls }) {
  void controls;
  const p = usePalette();
  const live = useCycleModel();
  const state = useAppState();
  const tk = todayKey();
  const model = live;
  const { openSheet } = useSheets();
  // Each chart asks for a measurement by id; one memoised function per id so
  // the charts' own memos hold across renders.
  const valueFor = useMemo(() => {
    const cache = new Map<CycleRowId, (dk: string) => number | null>();
    return (id: CycleRowId) => {
      if (!cache.has(id)) cache.set(id, cycleMetricValue(id, state.days, profileCtx(state.profile)));
      return cache.get(id)!;
    };
  }, [state.days, state.profile]);
  const [view, setView] = useState(() => { const d = dateFromKey(tk); d.setDate(1); return d; });

  const chip = model ? chipLabel(model, tk) : null;
  const recent = useMemo(() => (model ? [...model.cycles].reverse().slice(0, 6) : []), [model]);
  if (!model) {
    return (
      <View>
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 8 }}>Cycle impact</Text>
        <Text style={{ color: p.textDim, fontSize: 15 }}>Cycle tracking is off.</Text>
      </View>
    );
  }
  const ovDays = new Map(Object.values(model.ovulation).map((o) => [o.dk, o.basis]));
  const predicted = (dk: string) => !!model.prediction && dk >= model.prediction.early && dk <= model.prediction.late && dk > tk;

  const learning = model.mode === 'regular' && !model.prediction && model.completeCycles < PATTERN_MIN_CYCLES;
  const s = model.stats;

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 14 }}>Cycle impact</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 20, paddingHorizontal: 18, borderRadius: radius.card, backgroundColor: p.sunk, borderWidth: 1, borderColor: p.border, marginBottom: 14 }}>
        <CycleRing model={model} dk={tk} size={56} stroke={4.6} periodColor={p.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.text, fontSize: 20, fontWeight: '700' }}>{chip || 'No period logged yet'}</Text>
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 19, marginTop: 4 }}>{forecastLine(model)}</Text>
        </View>
      </View>

      {/* What the cycle does to the numbers first; the calendar is reference. */}
      <ScoreByCycleDay model={model} value={valueFor('score')} />
      <MetricByPhase model={model} valueFor={valueFor} />
      <MonthGrid view={view} setView={setView} ahead={model.prediction ? 1 : 0} renderDay={(dk, dn) => {
        const flow = (model.periods.some((pp) => dk >= pp.start && dk <= pp.end));
        const pred = predicted(dk);
        const ov = ovDays.get(dk);
        const future = dk > tk;
        return (
          <Pressable
            disabled={future}
            onPress={() => openSheet((c) => <CycleEntrySheet dk={dk} controls={c} />, { fitContent: true })}
            style={{
              flex: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
              backgroundColor: flow ? PERIOD_FILL : 'transparent',
              borderWidth: pred ? 1 : 0,
              borderStyle: pred ? 'dashed' : 'solid',
              borderColor: pred ? PERIOD_EDGE : 'transparent',
              opacity: future && !pred ? 0.3 : 1,
            }}
          >
            <Text style={{ color: flow ? PERIOD_INK : dk === tk ? p.accent : p.text, fontWeight: flow || dk === tk ? '700' : '400', fontSize: 15 }}>{dn}</Text>
            {ov ? (
              <View style={{
                position: 'absolute', bottom: 4, width: 8, height: 8, borderRadius: 4,
                backgroundColor: ov === 'temperature' ? OV_TEMP : OV_EST,
              }} />
            ) : null}
          </Pressable>
        );
      }} />

      <Legend model={model} />

      {learning ? (
        <Text style={{ color: p.textDim, fontSize: 13.5, lineHeight: 19, marginTop: 12 }}>
          {`After ${PATTERN_MIN_CYCLES} cycles Autonomic can predict your next period and estimate ovulation.`}
        </Text>
      ) : model.mode === 'irregular' || model.mode === 'perimenopause' ? (
        <Text style={{ color: p.textDim, fontSize: 13.5, lineHeight: 19, marginTop: 12 }}>
          This cycle type does not predict. Log each period and your history stays accurate.
        </Text>
      ) : null}

      {recent.length ? (
        <View style={{ marginTop: 16, backgroundColor: p.sunk, borderRadius: radius.control, borderWidth: 1, borderColor: p.border }}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 9 }}>
            {['Start', 'Cycle', 'Period'].map((h) => (
              <Text key={h} style={{ flex: 1, color: p.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>{h}</Text>
            ))}
          </View>
          {recent.map((c) => (
            <View key={c.start} style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: p.border }}>
              <Text style={{ flex: 1, color: p.text, fontSize: 15 }}>{shortDay(c.start)}</Text>
              <Text style={{ flex: 1, color: c.next ? p.text : p.textDim, fontSize: 15, fontVariant: ['tabular-nums'] }}>
                {c.length == null ? 'In progress' : c.plausible ? `${c.length} days` : 'Gap'}
              </Text>
              <Text style={{ flex: 1, color: p.text, fontSize: 15, fontVariant: ['tabular-nums'] }}>{`${c.period.days} day${c.period.days === 1 ? '' : 's'}`}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {s.n >= 2 ? (
        <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 18, marginTop: 10 }}>
          {`Average cycle ${Math.round(s.medianLength!)} days, range ${s.minLength} to ${s.maxLength}`}
          {s.medianPeriod != null ? ` · Average period ${Math.round(s.medianPeriod)} days` : ''}
        </Text>
      ) : null}
      <PrivacyLine />
      <SheetFooter>
        <Button title="Log flow or symptoms" variant="primary" onPress={() => openSheet((c) => <CycleEntrySheet dk={tk} controls={c} />, { fitContent: true })} />
      </SheetFooter>
    </View>
  );
}

function Legend({ model }: { model: CycleModel }) {
  const p = usePalette();
  const item = (key: string, swatch: React.ReactNode, label: string) => (
    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{swatch}<Text style={{ color: p.textDim, fontSize: 12 }}>{label}</Text></View>
  );
  const box = (dashed: boolean, fill: boolean) => (
    <View style={{ width: 12, height: 12, borderRadius: 4, borderWidth: dashed ? 1 : 0, borderStyle: 'dashed', borderColor: PERIOD_EDGE, backgroundColor: fill ? PERIOD_FILL : 'transparent' }} />
  );
  const dot = (filled: boolean) => (
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: filled ? OV_TEMP : OV_EST }} />
  );
  const items = [item('p', box(false, true), 'Period')];
  if (model.prediction) items.push(item('pr', box(true, false), 'Predicted'));
  const bases = new Set(Object.values(model.ovulation).map((o) => o.basis));
  if (model.mode !== 'contraception' && (bases.has('retrospective') || bases.has('calendar'))) items.push(item('oe', dot(false), 'Ovulation, estimated'));
  if (bases.has('temperature')) items.push(item('ot', dot(true), 'Ovulation, from temperature'));
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>{items}</View>;
}
