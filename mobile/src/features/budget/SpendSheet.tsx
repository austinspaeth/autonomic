/**
 * The drill-in: one spend source, and why it cost what it did.
 *
 * The last "Why" row is GOOD NEWS whenever there is any, so the sheet is not
 * purely a list of debits. That is deliberate: a screen that only ever adds
 * things up teaches the reader that opening it feels bad.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { CardRow, InsightCard } from '../insights/Sections';
import { LineChart } from '../../components/charts';

import { hexA } from '../../lib/color';
import { SCORE_COLORS } from '../../lib/scoring';
import { fonts, usePalette } from '../../theme';
import { clock, hm, type BudgetView, type SpendRow } from '../../lib/budget';
import { BAND_FRACTION } from '../../lib/budget/upright';
import { HR_BAND_EDGES, HR_BAND_OFFSETS } from '../../lib/budget/burn';
import { hrBoostFor } from '../../lib/budget/load';
import { getWaveform, useAppState } from '../../store/store';
import { loadWaveformId } from '../../lib/waveforms';
import type { OpenSheet } from '../forms';

/** Buckets the all-day curve is drawn in. Enough to show the shape of a day
 *  without pretending to per-minute resolution on a 350pt-wide chart. */
const CHART_BUCKETS = 48;

function Why({ rows }: { rows: { label: string; value: string; good?: boolean }[] }) {
  const p = usePalette();
  return (
    <>
      {rows.map((r) => (
        <CardRow key={r.label} bg={p.bg}>
          <Text style={{ flex: 1, minWidth: 0, fontSize: 13, color: hexA(p.text, 0.8) }}>{r.label}</Text>
          <Text style={{
            fontFamily: fonts.numHeavy, fontSize: 14,
            color: r.good ? SCORE_COLORS.good : p.text, fontVariant: ['tabular-nums'],
          }}>
            {r.value}
          </Text>
        </CardRow>
      ))}
    </>
  );
}

/**
 * The day's heart-rate curve, coloured by the user's own exertion line.
 *
 * Same mechanism the workout report and every Progress chart use: `zones` hand
 * `LineChart` a set of value bands and it paints the trace through them, so the
 * minutes that cost something are hot and the rest is quiet. Nothing bespoke —
 * a second way of colouring a line by threshold is a second thing to keep in
 * step with the grade palette.
 */
function DayTrace({ dk, lineBpm, onPick }: {
  dk: string;
  lineBpm: number | null;
  onPick: (p: { bpm: number; min: number } | null) => void;
}) {
  const p = usePalette();
  const curve = getWaveform(loadWaveformId(dk))?.sampledHr;
  if (!curve || curve.length < 4) return null;

  const span = 1440 / CHART_BUCKETS;
  const sums: number[] = new Array(CHART_BUCKETS).fill(0);
  const counts = new Array(CHART_BUCKETS).fill(0);
  curve.forEach((pt) => {
    const i = Math.min(CHART_BUCKETS - 1, Math.floor(pt.t / 60 / span));
    sums[i] += pt.bpm;
    counts[i]++;
  });
  const series = sums.map((v, i) => (counts[i] ? Math.round(v / counts[i]) : null));

  // Two bands: below the line is quiet, at or above it is the cost. `1e9` is
  // the same open-ended top the band tables use.
  const zones = lineBpm != null
    ? [{ from: -1e9, to: lineBpm, color: hexA(p.text, 0.45) }, { from: lineBpm, to: 1e9, color: p.accent }]
    : null;

  const buckets = Array.from({ length: CHART_BUCKETS }, (_, i) => {
    const m = Math.round(i * span);
    return { label: i % 12 === 0 ? clock(m).replace(':00', '') : '' };
  });

  return (
    <View style={{ marginTop: 12 }}>
      <LineChart
        buckets={buckets}
        series={[{ label: 'Heart rate', values: series, color: hexA(p.text, 0.45) }]}
        zones={zones}
        zonesOn={false}
        height={150}
        hideHeader
        integer
        onSelect={(i) => {
          const v = i == null ? null : series[i];
          onPick(v == null || i == null ? null : { bpm: v, min: Math.round(i * span) });
        }}
      />
    </View>
  );
}

/** One key per line ON the chart, and the dashed entry is the threshold rather
 *  than a series — labelling the solid line with a bpm made the reader look for
 *  a line that sat at that value. */
function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {it.dashed ? (
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ width: 4, height: 2, backgroundColor: it.color }} />
              ))}
            </View>
          ) : (
            <View style={{ width: 14, height: 3, borderRadius: 999, backgroundColor: it.color }} />
          )}
          <Text style={{ fontSize: 11.5, color: p.textDim }}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** What the finger is on. Only ever shown while something is picked: a
 *  readout that falls back to the latest value reads as a claim about now. */
function Readout({ picked }: { picked: { bpm: number; min: number } | null }) {
  const p = usePalette();
  return (
    <View style={{ height: 20, justifyContent: 'center', marginTop: 6 }}>
      {picked ? (
        <Text style={{ fontSize: 12.5, color: hexA(p.text, 0.8) }}>
          <Text style={{ fontFamily: fonts.numHeavy }}>{picked.bpm}</Text>
          {` bpm at ${clock(picked.min)}`}
        </Text>
      ) : (
        <Text style={{ fontSize: 12.5, color: p.textDim }}>Touch the trace for a reading</Text>
      )}
    </View>
  );
}

export function SpendSheet({ dk, budget, row }: { dk: string; budget: BudgetView; row: SpendRow }) {
  const p = usePalette();
  const state = useAppState();
  const [picked, setPicked] = React.useState<{ bpm: number; min: number } | null>(null);
  const load = state.days[dk]?.load;
  const credit = row.effortMin < 0;

  const lead = credit ? `-${hm(row.effortMin)}` : hm(row.effortMin);
  const leadSub = `${credit ? 'given back' : 'charged'} of ${hm(budget.burn.effortMin)} spent`;

  let sentence = '';
  let body: React.ReactNode = null;
  const whyRows: { label: string; value: string; good?: boolean }[] = [];

  if (row.source === 'hr') {
    const line = load?.lineBpm;
    sentence = line
      ? `Time your heart rate sat above ${Math.round(line)} bpm, which is your own exertion line, not a fitness zone. The further above it went, the more each minute costs.`
      : 'Time your heart rate sat above your own exertion line, not a fitness zone. The further above it went, the more each minute costs.';
    body = (
      <>
        <DayTrace dk={dk} lineBpm={line ?? null} onPick={setPicked} />
        <Readout picked={picked} />
        <Legend items={[
          { label: 'HR', color: hexA(p.text, 0.45) },
          { label: line ? `${Math.round(line)} bpm` : 'Your line', color: p.accent, dashed: true },
        ]} />
      </>
    );
    // One row per intensity band, so the minutes and the effort minutes can be
    // reconciled by hand. A day stored before bands existed keeps the single
    // flat row it was charged as, rather than being split up after the fact.
    if (load?.hrBands && line) {
      const lo = Math.round(line);
      load.hrBands.forEach((min, i) => {
        if (min < 1) return;
        const from = lo + HR_BAND_EDGES[i];
        const to = HR_BAND_EDGES[i + 1] != null ? lo + HR_BAND_EDGES[i + 1] : null;
        whyRows.push({
          label: `${hm(min)} at ${to != null ? `${from} to ${to}` : `${from}+`} bpm`,
          value: hm(min * hrBoostFor(HR_BAND_OFFSETS[i])),
        });
      });
    } else if (load?.hrAboveMin != null && line) {
      whyRows.push({ label: `${hm(load.hrAboveMin)} above ${Math.round(line)} bpm`, value: hm(load.hrAboveMin) });
    }
    if (load?.longestStretch) {
      const s = load.longestStretch;
      whyRows.push({ label: `Longest stretch, ${clock(s.startMin)} to ${clock(s.endMin)}`, value: hm(s.endMin - s.startMin) });
    }
    if (load?.peakBpm != null && line) whyRows.push({ label: `Peak, ${load.peakBpm} bpm`, value: `${Math.round(load.peakBpm - line)} above` });
  } else if (row.source === 'upright') {
    const estimated = load?.stillUprightMin != null && load?.standMin == null;
    sentence = estimated
      ? `Minutes your heart sat in your own standing band with no steps, plus minutes walking. Estimated, so say below if ${budget.past ? 'that day' : 'today'} was not like that.`
      : load?.standMin != null
        ? 'Standing and walking minutes, as your watch recorded them.'
        : 'Minutes holding steps, from your phone. Standing still is not counted without a heart-rate series.';
    body = (
      <>
        <DayTrace dk={dk} lineBpm={load?.lineBpm ?? null} onPick={setPicked} />
        <Readout picked={picked} />
        <Legend items={[{ label: 'HR', color: hexA(p.text, 0.45) }]} />
      </>
    );
    if (load?.walkingMin != null) whyRows.push({ label: `${hm(load.walkingMin)} walking`, value: hm(load.walkingMin * 0.2) });
    if (load?.stillUprightMin != null) whyRows.push({ label: `${hm(load.stillUprightMin)} standing, estimated`, value: hm(load.stillUprightMin * 0.2) });
    if (load?.standMin != null) whyRows.push({ label: `${hm(load.standMin)} standing or walking`, value: hm(load.standMin * 0.2) });
  } else if (row.source === 'activities' || row.source === 'credits') {
    sentence = row.source === 'credits'
      ? `Restorative entries give minutes back, up to a quarter of what the day ${budget.past ? 'cost' : 'has cost'}.`
      : 'Each logged activity, charged by how long it ran and how heavy that kind of thing tends to be.';
    body = (
      <View style={{ marginTop: 4 }}>
        {(row.members || []).map((m) => (
          <CardRow key={m.entryId} bg={p.bg}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13.5, color: p.text }}>{m.label}</Text>
              <Text style={{ fontSize: 11.5, color: p.textDim, marginTop: 2 }}>
                {m.assumed ? `${hm(m.minutes)} assumed, no duration logged` : hm(m.minutes)}
              </Text>
            </View>
            <Text style={{
              fontFamily: fonts.numHeavy, fontSize: 14,
              color: m.credit ? SCORE_COLORS.good : p.text, fontVariant: ['tabular-nums'],
            }}>
              {m.credit ? `-${hm(Math.abs(m.effortMin))}` : hm(m.effortMin)}
            </Text>
          </CardRow>
        ))}
      </View>
    );
  } else if (row.source === 'steps') {
    sentence = 'Your step count, used as a floor under the day. It never adds to what is already logged, it only fills in what is not.';
  } else {
    sentence = `A pattern from your own log that makes ${budget.past ? 'a day like that' : 'today'} cost more. Capped, and only ever charged when it can be named.`;
  }

  return (
    <View style={{ paddingHorizontal: 2 }}>
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: p.textDim, marginBottom: 3 }}>
          Spend source
        </Text>
        <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.3, color: p.text }}>{row.label}</Text>
      </View>

      <InsightCard bg={p.sunk}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
          <Text style={{ fontFamily: fonts.numHeavy, fontSize: 32, lineHeight: 34, color: credit ? SCORE_COLORS.good : p.text, fontVariant: ['tabular-nums'] }}>
            {lead}
          </Text>
          <Text style={{ flex: 1, fontSize: 13.5, color: p.textDim }}>{leadSub}</Text>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: p.textDim }}>{sentence}</Text>
        {body}
      </InsightCard>

      {whyRows.length ? (
        <InsightCard title={`Why it cost ${hm(row.effortMin)}`} desc="Charged minute for minute, then adjusted by patterns from your own log." bg={p.sunk}>
          <Why rows={whyRows} />
        </InsightCard>
      ) : null}
    </View>
  );
}

export function openSpendSheet(openSheet: OpenSheet, dk: string, budget: BudgetView, row: SpendRow) {
  openSheet(() => <SpendSheet dk={dk} budget={budget} row={row} />);
}

/** Re-exported so the band's floor can be explained without a second copy of
 *  the fraction. */
export { BAND_FRACTION };
