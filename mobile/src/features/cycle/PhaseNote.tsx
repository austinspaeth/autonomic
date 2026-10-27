/**
 * Cycle context beside a measurement: where the day sat in the cycle, then the
 * numbers that place this reading — the plain 30-day usual, this phase's usual
 * across past cycles, and where this reading sat against the usual. No sentence
 * of interpretation: the rows are the claim, stated as the person's own
 * numbers, and the grade above is untouched. The metric is named for what it
 * is (RMSSD, resting HR), never "HRV". Renders nothing when there is nothing
 * honest to say (lib/insights/cycle `phaseDetail`).
 */
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { fonts, radius, usePalette } from '../../theme';
import { chipLabel } from '../../lib/cycle/copy';
import { PHASE_LABEL, phaseColumns } from '../../lib/cycle';
import { USUAL_DAYS, cycleMetricValue, phaseDetail, type CycleRowId } from '../../lib/insights/cycle';
import { profileCtx } from '../../lib/scoring';
import { useAppState, useCycleModel } from '../../store/store';
import { CycleRing } from './CycleRing';

const COPY: Record<CycleRowId, { label: string; unit: string; dp: number }> = {
  baseline: { label: 'RMSSD', unit: 'ms', dp: 0 },
  restingHr: { label: 'resting HR', unit: 'bpm', dp: 0 },
  orthoDelta: { label: 'standing HR rise', unit: 'bpm', dp: 0 },
  symptoms: { label: 'symptom count', unit: 'a day', dp: 1 },
  score: { label: 'day score', unit: 'points', dp: 0 },
  sleepingHr: { label: 'overnight HR', unit: 'bpm', dp: 0 },
  standRise: { label: 'stand rise', unit: 'bpm', dp: 0 },
};


export function CyclePhaseNote({ dk, metric, current, style }: {
  dk: string; metric: CycleRowId;
  /** This reading's own value. Omitted, the day's value stands in. */
  current?: number | null;
  style?: object;
}) {
  const p = usePalette();
  const state = useAppState();
  const model = useCycleModel();
  const c = COPY[metric];
  const detail = useMemo(() => {
    const value = cycleMetricValue(metric, state.days, profileCtx(state.profile));
    return phaseDetail(model, value, dk, current !== undefined ? current : value(dk), c.dp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, metric, dk, current, state.days, state.profile]);
  const d = detail;
  const label = chipLabel(model, dk);
  if (!d || !label) return null;

  const fmt = (v: number) => `${v.toFixed(c.dp)} ${c.unit}`;
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(c.dp)} ${c.unit}`;
  const rows: { title: string; sub: string; value: string }[] = [];
  if (d.usual != null) rows.push({ title: `Your usual ${c.label}`, sub: `Past ${USUAL_DAYS} days`, value: fmt(d.usual) });
  rows.push({ title: `${PHASE_LABEL[d.phase]} usual ${c.label}`, sub: `Last ${d.cycles} cycle${d.cycles === 1 ? '' : 's'}`, value: fmt(d.phaseUsual) });
  if (d.vsUsual != null) rows.push({ title: d.vsUsual < 0 ? 'Below your usual' : 'Above your usual', sub: metric === 'sleepingHr' ? 'Last night' : 'This reading', value: signed(d.vsUsual) });

  return (
    <View style={[{ borderRadius: radius.card, backgroundColor: p.sunk, borderWidth: 1, borderColor: p.border, marginBottom: 12, padding: 14, paddingBottom: 4 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, marginBottom: 10 }}>
        {/* The ring in a tile a step lighter than the card, the warning card's
            icon-tile treatment. */}
        <View style={{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border }}>
          <CycleRing model={model} dk={dk} size={18} stroke={2.2} />
        </View>
        <Text style={{ flex: 1, color: p.text, fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{label}</Text>
      </View>
      {rows.map((r) => (
        <View key={r.title} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: p.border }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: p.text, fontSize: 14, fontWeight: '600' }}>{r.title}</Text>
            <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>{r.sub}</Text>
          </View>
          <Text style={{ color: p.text, fontSize: 15, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'] }}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * "Stand rise by phase" (design 12a): this measurement's median in each phase
 * across the user's finished cycles, under the phase note on a stand test or
 * POTS episode. Nothing until two phases have numbers to compare.
 */
export function CyclePhaseTable({ metric, title }: { metric: CycleRowId; title: string }) {
  const p = usePalette();
  const state = useAppState();
  const model = useCycleModel();
  const c = COPY[metric];
  const cols = useMemo(
    () => (model?.patternReady ? phaseColumns(model, cycleMetricValue(metric, state.days, profileCtx(state.profile))) : null),
    [model, metric, state.days, state.profile],
  );
  if (!cols || cols.filter((col) => col.median != null).length < 2) return null;
  const cycles = Math.max(...cols.map((col) => col.perCycle.length));
  return (
    <View style={{ borderRadius: radius.card, backgroundColor: p.sunk, borderWidth: 1, borderColor: p.border, marginBottom: 12, padding: 14, paddingBottom: 4 }}>
      <Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 2, marginBottom: 6 }}>{`Median of your last ${cycles} cycle${cycles === 1 ? '' : 's'}.`}</Text>
      {cols.map((col) => (
        <View key={col.phase} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: p.border }}>
          <Text style={{ flex: 1, color: p.text, fontSize: 14, fontWeight: '600' }}>{col.label}</Text>
          <Text style={{ color: col.median == null ? p.textDim : p.text, fontSize: 15, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'] }}>
            {col.median == null ? '–' : `${col.median > 0 ? '+' : ''}${col.median.toFixed(c.dp)} ${c.unit}`}
          </Text>
        </View>
      ))}
    </View>
  );
}
