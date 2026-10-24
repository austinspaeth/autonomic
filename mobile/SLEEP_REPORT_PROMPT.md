
---

## Build prompt

Hand this to a build agent together with the design. The design governs layout,
hierarchy, and copy; the notes below govern which components, tokens, and data
paths it must be built out of.

---

You are implementing the **sleep report** in **Autonomic Journal**
(`mobile/`, Expo / React Native, expo-router). A design is attached — follow it
for layout and copy. This brief tells you what to build it *out of*.

### Scope

The Journal's "Last night" card already exists (`SleepGrade` in
`src/features/JournalSections.tsx`). **Do not redesign it.** Make it open a
report; the only change to the card itself is the tap affordance.

Build the report modal it opens.

### Follow the existing report pattern exactly

This app already has this exact feature for workouts — mirror it rather than
inventing a second pattern:

- `WorkoutSummarySheet` in `src/features/forms.tsx` is the sheet shell: a
  `ScrollView`, a 21px/700 title and a dim subtitle both padded `paddingRight:
  100` to clear the floating edit+close pill, the body, then a 24px tail spacer.
- `WorkoutSummary` in `src/components/summary.tsx` is the body: a stack of
  `<Section>` blocks, each opened by `<SectionHead title desc help />`, with
  `<MetricRow>` for label/value rows.
- Open it from the card with `openSheet`, passing the edit action so the pencil
  still reaches the sleep editor:
  `openSheet(() => <SleepReportSheet dk={dk} />, { action: { icon: 'edit', onPress: … } })`.

`Section` and `SectionHead` are currently private to `summary.tsx`. Export them
(or lift them into `src/components/ui.tsx`) rather than copying them — two
divergent section headers is the failure mode here.

### Use the existing design system for every metric

- **Components.** `Card`, `SectionHeader`, `MetricRow`, `Row`, `RowValue`,
  `Pill`, `Chip`, `ProgressBar`, `Muted`, `HelpDot`, `Button`, `Segmented` from
  `src/components/ui.tsx`; `Ghost`/`TextGhost` for any loading state.
- **Charts.** `src/components/charts.tsx` already has what this report needs:
  `WorkoutHrChart` for the overnight HR curve, `LineChart` for the dip and
  respiratory trends, `StackedBars` for sleep balance, `Bars` and `Sparkline`
  for the smaller series. Extend one of these before writing a new chart, and if
  a genuinely new shape is needed (the hypnogram), build it in `charts.tsx` in
  the same idiom — same props vocabulary, same blur handling via
  `useChartsBlur`, same zone/band treatment.
- **Tokens.** `usePalette()` for every color (`p.text`, `p.textDim`,
  `p.surface`, `p.surface2`, `p.border`), `radius.card`, `fonts.numHeavy` with
  `fontVariant: ['tabular-nums']` for figures. `SCORE_COLORS` and `GRADE_LABEL`
  from `src/lib/scoring/index.ts` for grades. Reuse the stage palette already in
  `JournalSections.tsx` (`STAGE_COLORS`/`STAGE_ORDER`/`STAGE_LABEL`) — lift it
  to a shared module rather than duplicating the hex values.
- **No new color, spacing, or type scale.** If the design implies one, use the
  nearest existing token and say so in the PR.

### Where the logic goes

Pure computation belongs in a new `src/lib/sleep/` module with unit tests under
`src/lib/sleep/__tests__/`, following `src/lib/health/sleepSummary.ts` as the
model: no store imports, no native imports, so jest exercises it directly. The
report component reads state and renders; it does not compute.

Reuse what exists instead of reimplementing: `sleepHours`, `sleepGrade`,
`stagesForWindow` (`src/lib/scoring/day.ts`), `resolveProtocol` for the sleep
target, and `trustedReadings`/`isTrustedReading` (`src/lib/hrvQuality.ts`)
anywhere next-morning HRV is used — an untrusted imported HRV reading must not
appear in this report either.

### Nocturnal dip — the one piece of new math

Dip percent is the night's overnight low against the user's own daytime
resting-HR baseline:

- **Baseline:** median of recent `restingHr` journal readings. Require a
  minimum count before showing anything (a baseline built on one or two
  readings is worse than no section). `restingHr` entries carry a `position`
  field — decide and document how positions are handled; standing readings are
  not a resting baseline.
- **Bands:** roughly ≥10% dipping, 5–10% reduced, 0–5% non-dipping, <0 reverse.
  Put the thresholds in the pure module as named constants, not inline.
- **Precision:** phase 1 uses stored `hrLow`, which a single artifact can drag.
  When the overnight HR series exists, prefer the sleeping mean or the lowest
  rolling window. The computation must report which basis it used so the UI can
  say so.
- **Absent, not empty:** no sufficient baseline ⇒ the section does not render.
- **Never diagnose.** Copy describes a pattern in the user's own data. It is not
  a finding, a diagnosis, or a risk score.

### Ship in two passes

**Pass 1 — no capture changes, works on all backfilled nights.** Verdict with
the grade explained, nocturnal dip from `hrLow`, stage totals, schedule
consistency, sleep balance vs the protocol target, next-day impact. Pure over
the existing journal.

**Pass 2 — capture changes.** `readSleep` in `src/lib/health/index.ts` (and the
Health Connect twin in `healthConnect.ts`) currently queries every overnight
heart-rate sample and keeps only min/max; `summarizeSleep` builds the awake and
staged intervals and then sums them away. Keep them. Series data goes to the
**waveform sidecar** (`storeWaveform`/`getWaveform` in `src/lib/waveforms.ts`),
never into the journal — an inline array in persisted state trips a dev warning.
Respiratory rate over the night window is a small addition to the same read.

Do not start pass 2 until pass 1 is merged and rendering.

### House rules that will fail review if missed

- Every mutation goes through `save()` / `ensureDay` / `mutate` in
  `src/store/store.ts`. Never write MMKV directly.
- This report adds **no network calls**. The app makes exactly one, and it is
  not this.
- Both themes are first-class. Check the report in light and dark.
- Every section must vanish cleanly when its data is missing — a night with only
  `bed`, `wake`, and `quality` must still read as a complete report. No empty
  chart frames, no "–" grids.
- The Journal never shows demo data, so this report is real-data-only. Do not
  wire it to `demoState()`.
- `npm test` and `npm run lint` pass. New pure logic ships with tests.
- If the release crosses a minor version, add a line to `src/lib/whatsNew.ts` —
  but only if Austin has named this as an announced change.

### Deliverable

Pass 1, as a PR: the card made tappable, the report sheet, the pure sleep module
with tests, and screenshots in both themes showing a fully staged night, a
times-only night, and a night with no resting-HR baseline for the dip.
