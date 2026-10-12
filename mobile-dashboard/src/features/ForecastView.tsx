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
import { SymbolView } from 'expo-symbols';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Chips } from '../components/charts';
import { MetricTiles, type MetricSpec } from '../components/MetricTiles';
import { Lines, StackedBars } from '../components/series';
import { Card } from '../components/ui';
import { useData } from '../lib/data';
import { addDays, easternDay } from '../lib/dates';
import { actuals, paceLevers, scenarios, type Levers } from '../lib/forecast';
import { clearLeverOverrides, setLeverOverride, useLeverOverrides } from '../lib/forecastLevers';
import { int, money } from '../lib/format';
import { ledger } from '../lib/sales';
import { buildBase, type StoreFilter } from '../lib/store';
import { C, num } from '../theme';

export type Horizon = '6' | '12' | '24' | '36' | '60';
export const HORIZONS: { key: Horizon; label: string }[] = [
  { key: '6', label: '6M' },
  { key: '12', label: '1Y' },
  { key: '24', label: '2Y' },
  { key: '36', label: '3Y' },
  { key: '60', label: '5Y' },
];
type Metric = 'arr' | 'mrr' | 'cash';

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

/** The store and the horizon come from the floating filter bar, as every other view's filters do. */
export function ForecastView({ platform, horizon }: { platform: StoreFilter; horizon: Horizon }) {
  const { snap } = useData();
  const cur = snap?.load?.settings?.currency || '$';
  const $ = (n: number) => money(n, cur);
  const [metric, setMetric] = useState<Metric>('arr');
  /* The assumptions card: shut on arrival. `t` runs 0 to 1 on a stiff spring
     damped just short of critical, so it opens fast with barely any give. */
  const [open, setOpen] = useState(false);
  const [shut, setShut] = useState(0);
  const [tall, setTall] = useState(0);
  const sized = shut > 0 && tall > 0;
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSpring(open ? 1 : 0, { stiffness: 520, damping: 40, mass: 1 });
  }, [open, t]);
  const frame = useAnimatedStyle(() => (sized ? { height: shut + (tall - shut) * t.value } : {}));
  const summaryFade = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.max(0, t.value * 2)) }));
  const leversFade = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, t.value * 2 - 1)) }));

  const base = useMemo(() => buildBase(snap ?? null, platform), [snap, platform]);
  const a = useMemo(() => {
    const l = ledger(snap?.load?.sales, snap?.load?.churn, platform);
    // The model starts from the last day the store reports cover: an
    // unreported day is not a day with no installs.
    const end = base.lastReported && base.lastReported < easternDay() ? base.lastReported : addDays(easternDay(), -1);
    return actuals(base, l, end);
  }, [snap, platform, base]);
  const pace = useMemo(() => paceLevers(a), [a]);
  /* The levers are the measured pace with whatever was set by hand laid over
     it, and what was set by hand is kept (lib/forecastLevers), so nothing here
     goes back on its own. `drag` is a slider mid-move, not yet let go. */
  const held = useLeverOverrides();
  const levers = useMemo<Levers>(() => ({ ...pace, ...held }), [pace, held]);
  const [drag, setDrag] = useState<Partial<Levers>>({});
  const live = useMemo<Levers>(() => ({ ...levers, ...drag }), [levers, drag]);

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
    {
      key: 'annualRenew',
      label: 'Annual plans renewing',
      min: () => 0,
      max: () => 100,
      step: 1,
      fmt: (v) => `${v.toFixed(0)}%`,
      note: live.annualRenew === null ? 'following monthly churn: twelve months of it' : 'set by hand · reset to follow monthly churn',
    },
    { key: 'spread', label: 'Scenario spread', min: () => 5, max: () => 80, step: 5, fmt: (v) => `±${v.toFixed(0)}%`, note: 'width of the bear / optimistic band' },
  ];

  /* The annual renewal rate is null until it is set by hand: until then it
     follows the churn slider (twelve months of it), and so does its thumb. */
  const followChurn = (l: Levers) => Math.pow(1 - l.churn / 100, 12) * 100;
  const valueOf = (l: Levers, k: keyof Levers) => (k === 'annualRenew' ? (l.annualRenew ?? followChurn(l)) : (l[k] as number));
  const baseOf = (k: keyof Levers) => (k === 'annualRenew' ? followChurn(live) : (pace[k] as number));

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
      key: 'arr',
      label: 'ARR then',
      value: $(e.endMrr * 12),
      change: a.startMrr ? { value: e.endMrr * 12, base: a.startMrr * 12 } : null,
      note: `MRR times twelve at the end of the forecast. Bear to optimistic: ${$((lastBear?.mrr ?? 0) * 12)} – ${$((lastHigh?.mrr ?? 0) * 12)}.`,
      comparisons: [
        { label: 'Today', value: $(a.startMrr * 12) },
        { label: 'Levels off around', value: e.plateauMrr === null ? '–' : $(e.plateauMrr * 12) },
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
      key: 'perInstall',
      label: 'Cash per install',
      value: e.totalInstalls ? $(e.totalBookings / e.totalInstalls) : '–',
      note: 'Everything collected over the forecast, divided by every install in it. What an install is worth before the store cut, and the most you could pay for one.',
      comparisons: [
        { label: 'Cash collected', value: $(e.totalBookings) },
        { label: 'Installs', value: int(e.totalInstalls) },
        { label: 'Cash per new paying user', value: e.totalConv ? $(e.totalBookings / e.totalConv) : '–' },
        {
          label: 'Bear to optimistic',
          value: lo.totalInstalls && hi.totalInstalls ? `${$(lo.totalBookings / lo.totalInstalls)} – ${$(hi.totalBookings / hi.totalInstalls)}` : '–',
        },
      ],
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

  type M = (typeof e.months)[number];
  const series = metric === 'cash' ? (m: M) => m.cumBookings : metric === 'mrr' ? (m: M) => m.mrr : (m: M) => m.mrr * 12;
  const fmt = $;

  return (
    <>
      <Card>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setOpen(!open);
          }}
          style={s.headRow}
        >
          <Text style={s.cardTitle}>Assumptions</Text>
          <View style={s.headRight}>
            <Pressable
              disabled={!changed}
              hitSlop={8}
              onPress={() => {
                Haptics.selectionAsync();
                clearLeverOverrides();
                setDrag({});
              }}
              style={({ pressed }) => [s.reset, (!changed || pressed) && { opacity: 0.45 }]}
            >
              <Text style={s.resetText}>{changed ? `Current pace · ${changed} changed` : 'Current pace'}</Text>
            </Pressable>
            <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={13} weight="semibold" tintColor={C.dim} />
          </View>
        </Pressable>
        {/* Closed, the card is a list of what the forecast assumes; open, the
            same list as sliders. Both are laid out and measured, and the card
            moves between their two heights, so nothing below it jumps. */}
        <Animated.View style={[{ overflow: 'hidden' }, frame]}>
          <Animated.View
            pointerEvents={open ? 'none' : 'auto'}
            onLayout={(ev) => setShut(ev.nativeEvent.layout.height)}
            style={[sized ? s.layer : null, summaryFade]}
          >
            <Pressable onPress={() => setOpen(true)} style={s.summary}>
              {CONTROLS.map((c) => {
                const v = valueOf(live, c.key);
                const moved = Math.abs(v - baseOf(c.key)) > c.step / 2;
                return (
                  <View key={c.key} style={s.sumRow}>
                    <Text style={s.sumLabel}>{c.label}</Text>
                    <Text style={[s.sumValue, num, moved && { color: C.series }]}>{c.fmt(v)}</Text>
                  </View>
                );
              })}
            </Pressable>
          </Animated.View>
          <Animated.View pointerEvents={open ? 'auto' : 'none'} onLayout={(ev) => setTall(ev.nativeEvent.layout.height)} style={[s.layer, s.levers, leversFade]}>
            {CONTROLS.map((c) => (
              <Lever
                key={c.key}
                c={c}
                value={valueOf(live, c.key)}
                base={baseOf(c.key)}
                onLive={(v) => setDrag((d) => ({ ...d, [c.key]: v }))}
                onDone={(v) => {
                  setLeverOverride(c.key, v);
                  setDrag({});
                }}
                onReset={() => {
                  setLeverOverride(c.key, undefined);
                  setDrag({});
                }}
              />
            ))}
          </Animated.View>
        </Animated.View>
      </Card>

      <MetricTiles specs={specs} />

      <Card>
        <Chips
          options={[
            { key: 'arr', label: 'ARR' },
            { key: 'mrr', label: 'MRR' },
            { key: 'cash', label: 'Cash collected' },
          ]}
          value={metric}
          onChange={setMetric}
        />
        <Lines
          title={metric === 'cash' ? 'Cash collected, to date' : metric === 'mrr' ? 'Monthly recurring revenue' : 'Annual recurring revenue'}
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
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  layer: { position: 'absolute', top: 0, left: 0, right: 0 },
  levers: { gap: 10 },
  summary: { gap: 7, paddingTop: 2 },
  sumRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  sumLabel: { color: C.dim, fontSize: 14, flexShrink: 1 },
  sumValue: { color: C.text, fontSize: 14, fontWeight: '600' },
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
});
