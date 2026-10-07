/* Forecast, made for a phone: every assumption is a slider that starts at the
 * value read off this account's own data ("current pace"), and every number
 * re-computes as it moves. The model is lib/forecast.ts, a port of the web's
 * mix model, with the same bear / optimistic band.
 *
 * Sliders are heavy to re-run on every pixel, so the projection follows the
 * finger at a light throttle and settles exactly on release. */
import Slider from '@react-native-community/slider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Chips } from '../components/charts';
import { MetricTiles, type MetricSpec } from '../components/MetricTiles';
import { Lines, StackedBars } from '../components/series';
import { Card, Divider, Segmented } from '../components/ui';
import { useData } from '../lib/data';
import { addDays, easternDay } from '../lib/dates';
import { actuals, paceLevers, scenarios, type Levers } from '../lib/forecast';
import { int, money } from '../lib/format';
import { ledger } from '../lib/sales';
import { buildBase, type StoreFilter } from '../lib/store';
import { C, num } from '../theme';

type Horizon = '6' | '12' | '24' | '36';
type Metric = 'cash' | 'mrr' | 'payers';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;

type Control = {
  key: keyof Levers;
  label: string;
  min: (base: number) => number;
  max: (base: number) => number;
  step: number;
  fmt: (v: number) => string;
  note?: string;
};

export function ForecastView({ platform }: { platform: StoreFilter }) {
  const { snap } = useData();
  const cur = snap?.load?.settings?.currency || '$';
  const $ = (n: number) => money(n, cur);
  const [horizon, setHorizon] = useState<Horizon>('12');
  const [metric, setMetric] = useState<Metric>('cash');

  const base = useMemo(() => buildBase(snap ?? null, platform), [snap, platform]);
  const a = useMemo(() => {
    const l = ledger(snap?.load?.sales, snap?.load?.churn, platform);
    // The model starts from the last day the store reports cover: an
    // unreported day is not a day with no installs.
    const end = base.lastReported && base.lastReported < easternDay() ? base.lastReported : addDays(easternDay(), -1);
    return actuals(base, l, end);
  }, [snap, platform, base]);
  const pace = useMemo(() => paceLevers(a), [a]);
  const [levers, setLevers] = useState<Levers>(pace);
  const [live, setLive] = useState<Levers>(pace);
  useEffect(() => {
    setLevers(pace);
    setLive(pace);
  }, [pace]);

  const result = useMemo(() => scenarios(base, a, live, Number(horizon)), [base, a, live, horizon]);
  const e = result.expected;
  const lo = result.bear;
  const hi = result.optimistic;
  const lastBear = lo.months[lo.months.length - 1];
  const lastHigh = hi.months[hi.months.length - 1];

  const CONTROLS: Control[] = [
    { key: 'installs', label: 'New installs / day', min: () => 0, max: (b) => Math.max(50, Math.ceil((b * 4) / 10) * 10), step: 1, fmt: (v) => int(v) },
    { key: 'growth', label: 'Install growth / month', min: () => -50, max: () => 100, step: 0.5, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`, note: `held flat · your last 28 days vs the 28 before: ${a.growth > 0 ? '+' : ''}${a.growth.toFixed(1)}%` },
    { key: 'conv', label: 'Convert rate at the wall', min: () => 0, max: (b) => Math.max(20, Math.ceil(b * 3)), step: 0.05, fmt: (v) => `${v.toFixed(2)}%` },
    { key: 'monthlyPrice', label: 'Monthly plan price', min: () => 0, max: (b) => Math.max(20, Math.ceil(b * 3)), step: 0.5, fmt: $, note: a.hasPlans ? undefined : 'no monthly plan sold yet · assumption' },
    { key: 'annualPrice', label: 'Annual plan price', min: () => 0, max: (b) => Math.max(100, Math.ceil(b * 3)), step: 1, fmt: $, note: a.hasPlans ? undefined : 'no annual plan sold yet · assumption' },
    { key: 'annualShare', label: 'Share who choose annual', min: () => 0, max: () => 100, step: 1, fmt: (v) => `${v.toFixed(0)}%` },
    {
      key: 'churn',
      label: 'Monthly churn',
      min: () => 0,
      max: () => 40,
      step: 0.25,
      fmt: (v) => `${v.toFixed(2)}%`,
      note: a.churn === null ? 'nothing churned yet · assumption' : a.churnSource === 'entered' ? 'from churn you entered by hand' : undefined,
    },
    { key: 'spread', label: 'Scenario spread', min: () => 5, max: () => 80, step: 5, fmt: (v) => `±${v.toFixed(0)}%`, note: 'width of the bear / optimistic band' },
  ];

  const changed = (Object.keys(pace) as (keyof Levers)[]).filter((k) => levers[k] !== pace[k]).length;

  const specs: MetricSpec[] = [
    {
      key: 'mrr',
      label: `MRR in ${horizon} months`,
      value: $(e.endMrr),
      change: a.startMrr ? { value: e.endMrr, base: a.startMrr } : null,
      note: `From ${$(a.startMrr)} today. Bear to optimistic: ${$(lastBear?.mrr ?? 0)} – ${$(lastHigh?.mrr ?? 0)}.`,
      comparisons: [
        { label: 'Today', value: $(a.startMrr) },
        { label: 'ARR then', value: $(e.endMrr * 12) },
        { label: 'Levels off around', value: e.plateauMrr === null ? '–' : $(e.plateauMrr) },
      ],
    },
    {
      key: 'cash',
      label: 'Cash collected',
      value: $(e.totalBookings),
      note: `New purchases plus renewals, before the store cut. Bear to optimistic: ${$(lo.totalBookings)} – ${$(hi.totalBookings)}.`,
      comparisons: [{ label: 'Next 30 days', value: $(e.bookingsNext30) }],
    },
    {
      key: 'payers',
      label: 'Paying users then',
      value: int(e.endPayers),
      note: `Bear to optimistic: ${int(lo.endPayers)} – ${int(hi.endPayers)}.`,
    },
    {
      key: 'installs',
      label: 'Installs',
      value: int(e.totalInstalls),
      comparisons: [{ label: 'New paying users', value: int(e.totalConv) }],
    },
  ];

  const series = metric === 'cash' ? (m: (typeof e.months)[number]) => m.cumBookings : metric === 'mrr' ? (m: (typeof e.months)[number]) => m.mrr : (m: (typeof e.months)[number]) => m.payers;
  const fmt = metric === 'payers' ? int : $;

  return (
    <>
      <Card>
        <View style={s.headRow}>
          <Text style={s.cardTitle}>Assumptions</Text>
          <Pressable
            disabled={!changed}
            onPress={() => {
              Haptics.selectionAsync();
              setLevers(pace);
              setLive(pace);
            }}
            style={({ pressed }) => [s.reset, (!changed || pressed) && { opacity: 0.45 }]}
          >
            <Text style={s.resetText}>{changed ? `Current pace · ${changed} changed` : 'Current pace'}</Text>
          </Pressable>
        </View>
        <Segmented
          options={[
            { key: '6', label: '6 mo' },
            { key: '12', label: '1 yr' },
            { key: '24', label: '2 yr' },
            { key: '36', label: '3 yr' },
          ]}
          value={horizon}
          onChange={setHorizon}
        />
        {CONTROLS.map((c) => (
          <Lever
            key={c.key}
            c={c}
            value={live[c.key] as number}
            base={pace[c.key] as number}
            onLive={(v) => setLive((l) => ({ ...l, [c.key]: v }))}
            onDone={(v) => {
              setLevers((l) => ({ ...l, [c.key]: v }));
              setLive((l) => ({ ...l, [c.key]: v }));
            }}
            onReset={() => {
              setLevers((l) => ({ ...l, [c.key]: pace[c.key] }));
              setLive((l) => ({ ...l, [c.key]: pace[c.key] }));
            }}
          />
        ))}
      </Card>

      <MetricTiles specs={specs} />

      <Card>
        <Chips
          options={[
            { key: 'cash', label: 'Cash collected' },
            { key: 'mrr', label: 'MRR' },
            { key: 'payers', label: 'Paying users' },
          ]}
          value={metric}
          onChange={setMetric}
        />
        <Lines
          title={metric === 'cash' ? 'Cash collected, to date' : metric === 'mrr' ? 'Monthly recurring revenue' : 'Paying users'}
          xs={e.months.map((m) => monthLabel(m.key))}
          series={[
            { key: 'hi', label: 'Optimistic', color: '#199e70', dashed: true, values: hi.months.map(series) },
            { key: 'e', label: 'Expected', color: C.series, values: e.months.map(series) },
            { key: 'lo', label: 'Bear', color: '#e66767', dashed: true, values: lo.months.map(series) },
          ]}
          format={fmt}
          summary={fmt(series(e.months[e.months.length - 1] ?? ({} as any)) || 0)}
        />
      </Card>

      <Card>
        <StackedBars
          title="Cash in per month"
          keys={[
            { key: 'fresh', label: 'New purchases', color: C.series },
            { key: 'renew', label: 'Renewals', color: '#5ac8fa' },
          ]}
          rows={e.months.map((m) => ({ x: m.key, values: { fresh: m.freshCash, renew: m.renewCash } }))}
          xLabel={monthLabel}
          format={$}
        />
      </Card>

      <Card>
        <StackedBars
          title="Paying users"
          keys={[
            { key: 'monthly', label: 'Monthly', color: '#2563eb' },
            { key: 'annual', label: 'Annual', color: '#199e70' },
          ]}
          rows={e.months.map((m) => ({ x: m.key, values: { monthly: m.monthlyPayers, annual: m.annualPayers } }))}
          xLabel={monthLabel}
          format={int}
        />
      </Card>

      <Card title="Month by month">
        {e.months.map((m, i) => (
          <View key={m.key}>
            {i ? <Divider /> : null}
            <View style={s.row}>
              <Text style={s.rowLabel}>{monthLabel(m.key)}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.rowValue, num]}>{$(m.bookings)}</Text>
                <Text style={s.rowSub}>
                  MRR {$(m.mrr)} · {int(m.payers)} paying · {int(m.installs)} installs
                </Text>
              </View>
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

/** One assumption: label, live value, the measured value with a reset, and the slider. */
function Lever({
  c,
  value,
  base,
  onLive,
  onDone,
  onReset,
}: {
  c: Control;
  value: number;
  base: number;
  onLive: (v: number) => void;
  onDone: (v: number) => void;
  onReset: () => void;
}) {
  const last = useRef(0);
  const min = c.min(base);
  const max = Math.max(c.max(base), value);
  const moved = Math.abs(value - base) > c.step / 2;
  return (
    <View style={s.lever}>
      <View style={s.leverHead}>
        <Text style={s.leverLabel}>{c.label}</Text>
        <Text style={[s.leverValue, num, moved && { color: C.series }]}>{c.fmt(value)}</Text>
      </View>
      <Slider
        minimumValue={min}
        maximumValue={max}
        step={c.step}
        value={value}
        minimumTrackTintColor={C.series}
        maximumTrackTintColor="rgba(255,255,255,0.12)"
        thumbTintColor="#ffffff"
        onValueChange={(v) => {
          const now = Date.now();
          if (now - last.current > 60) {
            last.current = now;
            onLive(v);
          }
        }}
        onSlidingComplete={(v) => {
          Haptics.selectionAsync();
          onDone(v);
        }}
      />
      <View style={s.leverFoot}>
        <Text style={s.leverNote} numberOfLines={2}>
          {c.note ?? `from your data: ${c.fmt(base)}`}
        </Text>
        {moved ? (
          <Pressable hitSlop={8} onPress={onReset}>
            <Text style={s.leverReset}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  reset: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  resetText: { color: C.text, fontSize: 12, fontWeight: '600' },
  lever: { gap: 2, marginTop: 6 },
  leverHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  leverLabel: { color: C.dim, fontSize: 14, fontWeight: '600' },
  leverValue: { color: C.text, fontSize: 16, fontWeight: '700' },
  leverFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  leverNote: { color: C.muted, fontSize: 11, flex: 1 },
  leverReset: { color: C.series, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 },
  rowLabel: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowValue: { color: C.text, fontSize: 15, fontWeight: '700' },
  rowSub: { color: C.muted, fontSize: 11, marginTop: 1 },
});
