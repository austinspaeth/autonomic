# Build prompt — Autonomic Balance chart (PNS vs SNS)

Hand this to an implementer working in `mobile/`. It is self-contained; read the
files it names before writing code.

## Goal

Add a new chart to the HRV reading summary that shows **PNS index** and **SNS
index** over time as two lines, with the **area between them filled by a
color that encodes autonomic balance** (green = parasympathetic dominance /
recovered, amber = neutral, red = sympathetic dominance / stressed). The fill
color varies **along the time axis** via an SVG gradient, so you can see balance
drift good→bad across the reading history at a glance.

## Domain background (read this — it changes the color mapping)

PNS and SNS are **Kubios-style z-score composites centered on 0** (see
`src/lib/hrv/index.ts:132-135`):

```
pns = (z(meanRR) + z(rmssd) + z(sd1)) / 3       // vagal markers ↑ → PNS ↑
sns = (z(hr)    + z(stressIndex) − z(rmssd)) / 3 // stress ↑, rmssd ↓ → SNS ↑
```

RMSSD appears in both with opposite signs, so they are roughly mirror images
around 0. **They are NOT meant to converge.** "Equal" (both near 0, lines
crossing) is the *neutral/average* state. Good autonomic recovery is PNS well
above SNS (PNS positive, SNS negative); the bad state is the **crossover** where
SNS climbs above PNS.

So the quantity to color the fill by is the **signed gap `g = pns − sns`**:

| gap `g = pns − sns` | balance | color |
| --- | --- | --- |
| `g ≥ 1.5`  | strong parasympathetic dominance | great (green) |
| `0.5 ≤ g < 1.5` | recovered | good |
| `−0.5 ≤ g < 0.5` | neutral / crossing | ok (amber) |
| `−1.5 ≤ g < −0.5` | sympathetic lean | bad (orange) |
| `g < −1.5` | sympathetic dominance | concerning (red) |

Encode this as a small tunable band array and resolve colors through the
existing `GRADE_COLORS[cat]` map so it matches the rest of the app's grading.
Example:

```ts
// gap g = pns - sns, higher is better (mirror of BANDS.sns direction)
const BALANCE_BANDS: Band[] = [
  { max: -1.5, cat: 'concerning' },
  { max: -0.5, cat: 'bad' },
  { max: 0.5,  cat: 'ok' },
  { max: 1.5,  cat: 'good' },
  { max: Infinity, cat: 'great' },
];
```

(These thresholds are a starting point — mirror the spirit of `BANDS.pns` /
`BANDS.sns` in `src/lib/scoring/index.ts:137-138`; tune against real data.)

## Where things live

- **Charts** are hand-drawn with `react-native-svg` (v15, already installed — do
  NOT add a charting dependency) in `src/components/charts.tsx`. All charts use a
  fixed `viewBox="0 0 320 H"` with `preserveAspectRatio="none"` and helpers
  `smoothPath(pts)` (Catmull-Rom → cubic bezier) and `usePalette()`.
- **The closest existing pattern is `BpDumbbell`** (`charts.tsx:557-640`): it
  already builds per-segment vertical `<LinearGradient>`s in `<Defs>` and colors
  endpoints via `catFromBands(v, BANDS.x)` → `GRADE_COLORS`. Model the new
  component on it. `Sparkline` (`charts.tsx:74`) shows the offset-stop gradient
  pattern (`stops.map(...)` → `<Stop offset={o} stopColor={c} />`).
- **The card** that renders PNS/SNS is the "Balance" `Section` in
  `src/components/summary.tsx:275-294` (inside `HrvSummaryBody`). Insert the new
  chart there, above the existing `PNS index` / `SNS index` / `Stress index`
  `MetricRow`s (keep the rows — the chart is a visual summary above them).
- **History data**: `metricHistory(days, type, extractor, limit)`
  (`src/lib/scoring/day.ts:377`) returns `{ v, date }[]` oldest→newest for a
  reading field. Use `numEx('pns')` and `numEx('sns')` as extractors (same as the
  existing `spark(...)` calls at `summary.tsx:281,286`). `type` is
  `'hrv' | 'breathHrv'` and is already in scope in `HrvSummaryBody`.
- `GRADE_COLORS`, `catFromBands`, `BANDS`, `Band`, `ScoreCat` are already
  imported in `charts.tsx`.

## The chart component

Add `export function BalanceChart(...)` to `charts.tsx`. Contract:

```ts
export function BalanceChart({ pns, sns, height = 150 }: {
  pns: { v: number; date: string }[];  // aligned index-for-index with sns
  sns: { v: number; date: string }[];
  height?: number;
}) { ... }
```

Rendering:

1. Bail (`return null`) if fewer than 2 aligned points.
2. Y-scale spans the min/max of **all** pns and sns values (plus a ~5% cushion),
   like `Sparkline`/`LineChart` do. X is evenly spaced by index. Draw a faint
   dashed **zero line** (`y = 0`) — the neutral axis is meaningful here.
3. **Two smoothed lines** via `smoothPath`: PNS in **blue**, SNS in **purple**.
   Match the colors already used for these metrics elsewhere in the app — pull
   exact hexes from `usePalette()` / the theme rather than hard-coding new ones;
   if there is no established PNS/SNS color, use the app accent (blue) for PNS
   and an indigo/purple (the LF series uses `#6366f1`) for SNS. Confirm the pair
   reads clearly in both light and dark themes.
4. **Filled band between the lines**: build one closed `<Path>` — trace the PNS
   polyline left→right, then the SNS polyline right→left, then `Z`. Fill it with
   a single **horizontal** `<LinearGradient>` (`x1=0 y1=0 x2=1 y2=0`,
   `gradientUnits="objectBoundingBox"` or a userSpace gradient spanning the plot
   width). Emit **one `<Stop>` per time sample**: `offset` = that sample's
   x-fraction `i/(n-1)`, `stopColor` = `GRADE_COLORS[catFromBands(pns[i].v -
   sns[i].v, BALANCE_BANDS)]`. Because a horizontal gradient colors purely by
   x-position, each moment gets the color of *its own* balance, and the gradient
   interpolates the transitions between samples for free. Give the fill modest
   opacity (~0.35–0.5) so the two lines stay legible on top; draw the fill first,
   lines second.
5. **Crossover** needs no special-casing: the closed polygon pinches to a point
   where the lines meet and reopens on the other side, and the fill color passes
   through the neutral amber band right at the crossing — which is the correct
   visual story. Verify it renders cleanly (no fill artifact) with a series that
   crosses.
6. Give the gradient a unique `id` per instance (follow the `sparkId`/`lcId`/
   `bpId` module-counter pattern already in the file) so multiple charts on one
   screen don't collide.

Interaction (drag-to-read cursor, zones toggle) is **out of scope for v1** —
match the static look of `Tachogram`. A later pass can add a drag readout
mirroring `LineChart`/`Sparkline` if wanted.

## Wiring in summary.tsx

In `HrvSummaryBody`, inside the `Balance` `Section` (`summary.tsx:275`), before
the `MetricRow`s, compute the two histories and render the chart when both have
≥2 points:

```tsx
const pnsHist = metricHistory(days, type, numEx('pns'));
const snsHist = metricHistory(days, type, numEx('sns'));
// ... inside the Section, above the MetricRows:
{pnsHist.length >= 2 && snsHist.length >= 2
  ? <View style={{ marginTop: 12 }}><BalanceChart pns={pnsHist} sns={snsHist} /></View>
  : null}
```

`metricHistory` returns pns and sns points in the same day/time order, so equal
lengths means they align index-for-index. If a reading logs one index but not the
other the lengths can differ — guard by aligning on `date`+order or simply
requiring `pnsHist.length === snsHist.length` and truncating to the shorter, and
note the assumption in a comment. Import `BalanceChart` from `../components/charts`
and (if not already) `metricHistory` / `numEx`.

Add a one-line help/explainer string for the chart consistent with the existing
`HRV_HELP.balance` copy. **Follow the app copy style: no em dashes, short
subtexts** (see the project's copy-style note).

## Constraints & acceptance

- No new dependencies; `react-native-svg` only.
- `cd mobile && npm run lint && npm test` pass.
- `npm run ios` — open an HRV reading with ≥2 historical readings and confirm:
  the two lines render in the right colors, the band fills green when PNS is on
  top and red when SNS crosses above, the color transitions smoothly across
  time, and it looks right in **both light and dark** themes.
- Charts with a single reading (no history) hide gracefully (no crash, no empty
  box).
