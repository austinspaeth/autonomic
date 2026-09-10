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
import { NightSeriesChart, StackedBars } from '../../components/charts';

import { hexA } from '../../lib/color';
import { SCORE_COLORS } from '../../lib/scoring';
import type { Band, ScoreCat } from '../../lib/types';
import { GRADE_COLORS, fonts, usePalette } from '../../theme';
import { clock, hm, type BudgetView, type SpendRow } from '../../lib/budget';
import { BAND_FRACTION } from '../../lib/budget/upright';
import { HR_BAND_EDGES, HR_BAND_OFFSETS, HR_MIN_COVERAGE, HOURS, minutesByHour, uprightHours } from '../../lib/budget/burn';
import { minutesOf } from '../../lib/budget/pace';
import { hrBoostFor } from '../../lib/budget/load';
import { getWaveform, useAppState } from '../../store/store';
import { loadWaveformId } from '../../lib/waveforms';
import type { OpenSheet } from '../forms';

/**
 * The chart's grades: under the line, then one per `HR_BAND_EDGES` band, so
 * the colours on the dots are the same bands the "Why" rows count minutes in.
 * Green / yellow / orange / red, straight out of the grade palette.
 */
const TRACE_CATS: ScoreCat[] = ['good', 'ok', 'bad', 'crash'];

function traceBands(lineBpm: number): (Band & { label: string })[] {
  const lo = Math.round(lineBpm);
  const maxes = [lo, ...HR_BAND_EDGES.slice(1).map((e) => lo + e), Infinity];
  return maxes.map((max, i) => ({
    max,
    cat: TRACE_CATS[i],
    label: i === 0 ? `Under ${lo}` : max === Infinity ? `${maxes[i - 1]}+` : `${maxes[i - 1]} to ${max}`,
  }));
}

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
 * The day's heart rate, one dot per stored sample, graded by the user's own
 * exertion line.
 *
 * Dots, not a line: this used to average the day into half-hour buckets, so a
 * "49m at 94 to 104 bpm" row sat over a trace that never left green — a short
 * climb averaged into the quiet around it. The minutes are counted from the
 * samples, so the chart draws the samples. Same scatter the overnight heart
 * rate uses, with its smoothing line off for the same reason.
 */
function DayTrace({ dk, lineBpm, onPick }: {
  dk: string;
  lineBpm: number | null;
  onPick: (p: { bpm: number; min: number } | null) => void;
}) {
  const p = usePalette();
  const curve = getWaveform(loadWaveformId(dk))?.sampledHr;
  if (!curve || curve.length < 4) return null;

  return (
    <View style={{ marginTop: 12 }}>
      <NightSeriesChart
        // `t` is seconds past midnight; the chart's clock counts from noon.
        bedAt={-720}
        points={curve.map((q) => ({ t: q.t, v: q.bpm }))}
        color={hexA(p.text, 0.45)}
        bands={lineBpm != null ? traceBands(lineBpm) : null}
        scatter
        trend={false}
        onSelect={(sel) => onPick(sel ? { bpm: Math.round(sel.v), min: Math.round(sel.t / 60) } : null)}
      />
    </View>
  );
}

/** A dot per series the chart draws, each naming itself. */
function Key({ items, unit }: { items: { label: string; color: string }[]; unit?: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 14, rowGap: 6, marginTop: 10, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: it.color }} />
          <Text style={{ fontSize: 11.5, color: p.textDim, fontVariant: ['tabular-nums'] }}>{it.label}</Text>
        </View>
      ))}
      {unit ? <Text style={{ fontSize: 11.5, color: p.textDim }}>{unit}</Text> : null}
    </View>
  );
}

/** A dot per grade the trace can draw, each naming its own range. */
function Legend({ lineBpm }: { lineBpm: number }) {
  return <Key items={traceBands(lineBpm).map((b) => ({ label: b.label, color: GRADE_COLORS[b.cat] }))} unit="bpm" />;
}

/** What the finger is on. Only ever shown while something is picked: a
 *  readout that falls back to the latest value reads as a claim about now. */
function ReadoutLine({ text, hint }: { text: React.ReactNode; hint: string }) {
  const p = usePalette();
  return (
    <View style={{ height: 20, justifyContent: 'center', marginTop: 6 }}>
      {text ? (
        <Text numberOfLines={1} style={{ fontSize: 12.5, color: hexA(p.text, 0.8) }}>{text}</Text>
      ) : (
        <Text style={{ fontSize: 12.5, color: p.textDim }}>{hint}</Text>
      )}
    </View>
  );
}

function Readout({ picked }: { picked: { bpm: number; min: number } | null }) {
  return (
    <ReadoutLine
      hint="Touch the trace for a reading"
      text={picked ? <><Text style={{ fontFamily: fonts.numHeavy }}>{picked.bpm}</Text>{` bpm at ${clock(picked.min)}`}</> : null}
    />
  );
}

type HourSeries = { label: string; noun: string; color: string; values: number[] };

const hourLabel = (h: number) => clock(h * 60).replace(':00', '');

/**
 * When the minutes behind a row happened: one bar per clock hour.
 *
 * Upright time and recovery time are questions of WHEN. The heart-rate trace
 * that used to sit here answered a different one, and read as though heart
 * rate were what the row charged. These are the minutes the row counted,
 * split by the hour they fell in, so the bars add up to the row.
 */
function HourBars({ series }: { series: HourSeries[] }) {
  const [sel, setSel] = React.useState<number | null>(null);
  if (!series.some((s) => s.values.some((v) => v > 0))) return null;
  const parts = sel == null ? [] : series
    .filter((s) => (s.values[sel] || 0) >= 1)
    .map((s) => `${hm(s.values[sel])} ${s.noun}`);
  return (
    <View style={{ marginTop: 12 }}>
      <StackedBars
        buckets={Array.from({ length: HOURS }, (_, h) => ({ label: h % 4 === 0 ? hourLabel(h) : '' }))}
        segments={series}
        height={150}
        hideHeader
        onSelect={setSel}
      />
      <ReadoutLine
        hint="Touch a bar for that hour"
        text={sel == null ? null : `${hourLabel(sel)} to ${hourLabel(sel + 1)}: ${parts.join(', ')}`}
      />
      <Key items={series} unit="minutes per hour" />
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
        {line ? <Legend lineBpm={line} /> : null}
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
  } else if (row.source === 'upright') {
    const estimated = load?.stillUprightMin != null && load?.standMin == null;
    sentence = estimated
      ? `Minutes your heart sat in your own standing band with no steps, plus minutes walking. Estimated, so say below if ${budget.past ? 'that day' : 'today'} was not like that.`
      : load?.standMin != null
        ? 'Standing and walking minutes, as your watch recorded them.'
        : 'Minutes holding steps, from your phone. Standing still is not counted without a heart-rate series.';
    // Measured walking in the stronger grey, estimated standing in the fainter
    // one on top of it; watch stand time is a single measured series.
    const hours = uprightHours(load);
    const series: HourSeries[] = [];
    if (hours?.stand) series.push({ label: 'Standing or walking', noun: 'upright', color: hexA(p.text, 0.75), values: hours.stand });
    if (hours?.walk) series.push({ label: 'Walking', noun: 'walking', color: hexA(p.text, 0.75), values: hours.walk });
    if (hours?.still) series.push({ label: 'Standing, estimated', noun: 'standing', color: hexA(p.text, 0.35), values: hours.still });
    body = <HourBars series={series} />;
    if (load?.walkingMin != null) whyRows.push({ label: `${hm(load.walkingMin)} walking`, value: hm(load.walkingMin * 0.2) });
    if (load?.stillUprightMin != null) whyRows.push({ label: `${hm(load.stillUprightMin)} standing, estimated`, value: hm(load.stillUprightMin * 0.2) });
    if (load?.standMin != null) whyRows.push({ label: `${hm(load.standMin)} standing or walking`, value: hm(load.standMin * 0.2) });
  } else if (row.source === 'activities' || row.source === 'credits') {
    sentence = row.source === 'credits'
      ? `Restorative entries give minutes back, up to a quarter of what the day ${budget.past ? 'cost' : 'has cost'}.`
      : 'Each logged activity, charged by how long it ran and how heavy that kind of thing tends to be.';
    const series: HourSeries[] = [];
    if (row.source === 'credits') {
      // Resting minutes count only when the series was trusted enough to be
      // credited at all (the same bar `buildBurn` applies).
      const trusted = load?.hrAboveMin != null && (load.hrCoverageMin || 0) >= HR_MIN_COVERAGE;
      const resting = trusted ? load?.hrBelowByHour ?? null : null;
      const acts = state.days[dk]?.activities || [];
      const logged = minutesByHour((row.members || []).flatMap((m) => {
        const start = minutesOf(acts.find((a) => String(a.id || '') === m.entryId)?.time);
        return start == null || m.minutes <= 0 ? [] : [{ startMin: start, endMin: start + m.minutes }];
      }), Infinity);
      if (resting) series.push({ label: 'Resting', noun: 'resting', color: SCORE_COLORS.good, values: resting });
      if (logged) series.push({ label: 'Logged rest', noun: 'logged', color: hexA(SCORE_COLORS.good, 0.45), values: logged });
    }
    body = (
      <View style={{ marginTop: 4 }}>
        {series.length ? <HourBars series={series} /> : null}
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
