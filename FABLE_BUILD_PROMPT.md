# Build Prompt — Autonomic (Expo / React Native native app)

> Paste everything below into a fresh coding session (Fable). It is a complete,
> self-contained build spec. The existing web app in **`docs/index.html`** of this
> same repo is the **functional + visual source of truth** — read it in full
> before you start. Reproduce its scoring exactly; improve its UI and add the new
> native capabilities described here.

---

## 0. Mission

Build **Autonomic** — a native iOS-first (Expo) app for tracking autonomic-nervous-system
recovery — to a **shippable MVP**. It is a rebuild of the existing offline-first PWA
(`docs/index.html`, ~7,150 lines, single file). You must:

1. **Port** every feature of the web app to React Native, faithfully preserving its
   data model and its entire scoring/grading framework (thresholds must match to the number).
2. **Clean up and perfect the UI** — same design language (iOS-native, red accent, light/dark),
   but tighter, more consistent, correctly sized, and genuinely polished.
3. **Add HealthKit** read + write.
4. **Add live HRV readings** captured over **5 minutes** from either a **Bluetooth chest strap
   (e.g. Polar H10)** or an **Apple Watch reading via HealthKit**, computing all HRV metrics
   on-device and saving the result as a reading.
5. Ship a **guided full-screen breathing experience** during breathing readings.
6. Make the **analytics/insights** views simple, correctly sized, and beautiful.

The bar is "I could put this in TestFlight and use it every day." No stubs, no TODO screens,
no placeholder data. Every button works.

---

## 1. Tech stack & project setup

- **Expo** with a **development build** (this app needs native modules — Expo Go will not work
  for BLE or HealthKit). Use `expo prebuild` / EAS dev client. Target **iOS** first; keep Android
  from crashing (BLE works on Android too; HealthKit is iOS-only — feature-flag it).
- **TypeScript**, strict mode.
- **expo-router** for navigation (typed routes). Bottom tab navigator for the 4 top-level tabs.
- **State/persistence:** the whole app state is one JSON object (see §4). Persist with
  a fast KV store — use **`react-native-mmkv`** (synchronous, fast) wrapped in a small
  `store.ts` with a `save()` that stamps `meta.lastUpdated`. Do **not** use AsyncStorage for
  the hot path. Keep an in-memory copy; write-through on every mutation via `save()`.
- **HealthKit:** `@kingstinct/react-native-healthkit` (or `react-native-health` if you prefer —
  pick one and use it consistently). Request read+write for the types in §9.
- **Bluetooth:** `react-native-ble-plx`. (Polar also has an official SDK, but BLE-PLX against the
  standard Heart Rate GATT service is enough and keeps it generic — see §8.)
- **Charts:** build the small charts by hand with **`react-native-svg`** (sparklines, power bar,
  tachogram, score gauge) — you have full control and it matches the web app's hand-drawn SVGs.
  For the breathing animation use **`react-native-reanimated`** (v3) + `react-native-svg`, driven
  on the UI thread so it never stutters.
- **Haptics:** `expo-haptics` for the breathing cues and key interactions.
- No backend. Everything is on-device and offline-first, exactly like the PWA.
- Keep dependencies minimal and mainstream. No experimental libraries.

Set up: reasonable folder structure (`app/` routes, `src/lib/hrv/`, `src/lib/scoring/`,
`src/lib/health/`, `src/lib/ble/`, `src/components/`, `src/theme/`, `src/store/`), ESLint +
Prettier + TypeScript configured and passing. A README with run instructions.

---

## 2. Read the source of truth first

Before writing code, read `docs/index.html` end to end. The parts you must mine:

- **`READING_TYPES`, `ACTIVITY_TYPES`, `MED_TYPES`, `SYMPTOM_TYPES`, `TRIGGER_TYPES`,
  `MEAL_TYPES`** (~line 1451–1785): every entry type, its label, icon, and field schema.
- **Scoring:** the `s*` helper functions (`sRMSSDu`, `sRMSSDs`, `sSDNN`, `sTotalPower`, `sVLF`,
  `sPNN50`, `sReadiness`, `sRestingHr`, `sQRS`, `sPR`, `sEctopic`, `sCoherence`, `sLfPeak`,
  `sLfHf`, `sHfPeak`, `sHR`, `sRrMode`, `sMxDMn`, `sAMo50`, `sCV`, `sRhythm`, `sSys`, `sDia`,
  `sBP`, `sSpo2`), plus `computeScores(r)`, `rowScoreCategory(r)`, `totalPower(r)`,
  `bmiFor` / `BMI_ZONES`. **Port these verbatim** — the thresholds are the product.
- **`BANDS`** registry + `restingHrBands`, `qtcBands(sex)`, `bandsFor(type,key)`,
  `catFromBands`, `expectedHf(style)`. Port verbatim.
- **`SCORE_COLORS`, `SCORE_RANK`, `worstCat`, `GRADE_PTS`, `GRADE_LABEL`, `SCORE_CATS`,
  `CAT_POINTS`, `scoreCat`.**
- **Day scoring:** `scoreSet`, `sleepGrade`, `activityGrade`, `sleepHours`, `dayCleanliness`,
  `streakInfo`/`streakTier`, `blueZone`, `renderDaySummary` (the hero score gauge + streak card).
- **Reading summaries:** `openReadingSummary`, `breathingSummary`, `unstructuredHrvSummary`,
  `bpSummary`, `ecgSummary`, `restingHrSummary`, `bloodO2Summary`, `genericReadingSummary`,
  plus `metricRow`, `buildSpark`, `metricHistory`, `scoreGauge`, `heroCard`, `sumCard`,
  the derived BP indexes (`bpMap`, `bpPP`, `bpKerdo`, `bpRobinson`, `bpKvas`, `bpBce`),
  and `HRV_EXPLAIN` (the per-metric explainer strings — reuse them).
- **Analysis + AI Insights** tabs (`renderAnalysis`, the report-card generators around
  line 6200–6960, correlation insights). Understand what they show so you can simplify them.
- **Theme + layout:** the CSS `:root` / `[data-theme]` variables (line 16–60), the tab bar,
  the bottom-sheet modal system, the day card, section list rows.

Everything about *what a metric means, how it's graded, and what color it turns* comes from
that file. Do not invent new thresholds. Where this prompt and the web app disagree on a number,
the web app wins.

---

## 3. Design system (port + refine)

Match the web app's language, then make it cleaner and more consistent.

- **Accent:** `#e03127` (red). Accent-soft `rgba(224,49,39,0.12)`.
- **Grade / score color scale** (used for every metric dot, sparkline zone, badge — keep exact):
  `great #38bdf8` · `good #4ade80` · `ok #eab308` · `bad #f97316` · `crash/concerning #ef4444`
  · `warning #a78bfa`.
- **Light theme:** bg `#f5f5f7`, surface `#ffffff`, surface-2 `#f0f0f3`, text `#1c1c1e`,
  text-dim `#6b6b70`, border `#e3e3e8`.
- **Dark theme:** bg `#000000`, surface `#1a1a1c`, surface-2 `#242427`, text `#f2f2f5`,
  text-dim `#9a9aa0`, border `#303034`.
- Radius 14 (cards) / 10 (controls). System font (SF Pro on iOS). Tabular-nums for all numbers.
- Respect the device light/dark setting by default, with a manual override in settings
  (`settings.theme`), same as the PWA.
- **Refinement mandate — this is where "the UI needs to be perfect":**
  - One consistent spacing scale (4/8/12/16/20/24). No ad-hoc margins.
  - One card component, one section-header component, one list-row component, one metric-row
    component, one segmented control, one stepper — reused everywhere. The web app has visual
    drift; unify it.
  - Correct type scale: a clear hierarchy (hero number, card title, row label, caption). Nothing
    should look oversized or cramped. The web app has a few oversized blocks — right-size them.
  - Safe-area aware everywhere. 44pt minimum tap targets. Momentum scrolling.
  - Bottom sheets: use a real native sheet (`@gorhom/bottom-sheet`) to replace the web app's
    hand-rolled stacked-sheet system. Detent ~90%, drag-to-dismiss, a fixed ✕ top-right, and a
    fixed blurred footer for the primary action when present. Sheets may stack (edit-over-summary).
  - Smooth 60fps transitions; subtle press states; haptics on primary actions.
  - Empty states for every list ("No readings yet — tap + to add one").

Deliver a `theme/` module (colors, spacing, typography, radii) and a small component library
in `components/`. Everything themable; verify both light and dark look intentional.

---

## 4. Data model (keep the PWA schema; extend for raw data)

Persist one object under a single key (`autonomic.journal.v1`). Keep the shape identical to the
PWA so data is conceptually portable, and add an **import/export JSON** feature that reads and
writes the exact same format (so the user can move data off the web app). Shape:

```jsonc
{
  "version": 1,
  "settings": { "theme": "light" | "dark" | "system" },
  "profile": { "sex", "birthday", "weight", "height" },   // feeds sex-adjusted QTc, BMI, age
  "meta": {
    "lastUpdated": "<ISO>",                                 // stamped by save() on EVERY mutation
    "lastImport": { "name": "file.json", "at": "<ISO>" }
  },
  "days": {
    "YYYY-MM-DD": {
      "sleep":      { "bed": "HH:MM", "wake": "HH:MM", "quality": "good"|"interrupted", "hrLow?", "hrHigh?" },
      "readings":   [ { "id", "type", "time", "note", ...typeFields } ],
      "activities": [ { "id", "type", "time", "note", ...fields } ],
      "meds":       [ { "id", "type", "time", "amount", "note" } ],
      "symptoms":   [ { "id", "type", "time", "note", ...fields } ],
      "food":       { "water": 0, "calories": 0, "meals": [...], "triggers": { "<type>": count } },
      "digestion":  { "bm": 0, "movements": [...] }
    }
  }
}
```

Rules (carry over exactly):
- **Every mutation goes through `save()`**, which stamps `meta.lastUpdated = new Date().toISOString()`.
  Never write the store directly. Show "Last updated …" + last imported filename in the menu/settings.
- Reading entries are typed by `type` keying into `READING_TYPES`. No user-defined types.
- On save, compute and store `r.scores = computeScores(r)` so rows can tint instantly.

**Extension for live readings:** an HRV reading captured live also stores the raw signal so
results can be recomputed and the tachogram redrawn:
```jsonc
{
  "id", "type": "breathHrv" | "hrv", "time", "period", "style?",
  "source": "polar" | "watch" | "manual",
  "rrRaw":  [ /* RR intervals in ms, artifact-flagged copy */ ],
  "rrClean":[ /* corrected RR used for math */ ],
  "durationSec": 300,
  "sampledHr": [ { t, bpm } ],   // for the HR waveform chart
  // ...plus every computed metric field the manual form has (sdnn, rmssd, pnn50,
  //    meanRr, mxdmn, mode, amo50, cv, vlowPower, lowPower, highPower, lfPeak,
  //    hfPeak, coherence, hr/avgHr), so it renders identically to a typed-in reading.
  "scores": { ... }
}
```
Keep manual entry for every reading type too (offline / no device). Live capture just fills the
same fields automatically.

---

## 5. Navigation & screens

Four bottom tabs (same as PWA): **Journal · Analysis · Milestones · Insights**. Plus a header
with a date stepper on Journal and a menu/settings entry (hamburger → Profile, theme, import/export,
"last updated", device connections).

### 5.1 Journal (home)
- **Date header**: ‹ Today › stepper; "Today" tinted accent.
- **Day summary card** (port `renderDaySummary`): a **circular score gauge** (port `scoreGauge`,
  135°→405°, 270° sweep) showing the composite day score with its category color, the category
  chip, an "vs AM" delta when there's a morning + later reading, an info button that opens the
  **score-explanation sheet** (`openScoreExplain`: what raised / firmed-up / hurt the score,
  headroom-ranked). Below it the **streak card** (`streakInfo`/`streakTier`: current streak,
  longest, clean-day criteria checklist).
- **Sections** (each a card with a header + "＋ Add"): **Sleep, Readings, Activities, Meds,
  Symptoms, Food & Drink, Triggers, Digestion.** Each lists the day's entries as rows; a row shows
  the type icon, label, time, a one-value summary (`readingRowValue`) tinted by `rowScoreCategory`,
  and taps into a read-only **summary sheet** with an **Edit** action.
- **＋ Add** opens a filterable picker of the programmatic types for that section; choosing one
  stacks the entry form (`openEntryForm`) built from the field schema (`number/select/time/check/
  text/textarea/divider`; auto-add Time + Notes when the type omits them). Indoor bike uses its
  bespoke form (`bikeForm`).
- Food & Drink (water cups stepper, meals, calories), Triggers, Digestion (bowel-movement form
  with Bristol-type fields) — port faithfully.

### 5.2 Analysis
- Segmented range control **Day · Week · Month · Year** (reuse one segmented control).
- A **3-per-row card grid** of categories that slides to a detail panel (port the sliding nav).
- **Simplify and right-size**: the web version is dense. Show, per range, clean trend charts
  (reuse the sparkline/line renderer at a larger size) for the key series — score, RMSSD, SDNN,
  total power, resting HR, BP, sleep hours — plus min/avg/max stat tiles. Consistent chart height,
  consistent axis treatment, grade-zone shading behind the line (from `BANDS`). No cramped 3-column
  text tables; prefer a few good charts + stat tiles. Follow the `dataviz` skill guidance for
  color, legend, and axis treatment; the categorical grade colors above are the palette.

### 5.3 Milestones
- Port the milestones/achievements view (streak tiers, best days, counts). Keep it visual and simple.

### 5.4 Insights (AI reports)
- Port the report-card catalog (Trigger Analysis, Cardiovascular, MCAS Pattern, Crash Pattern,
  Best Days, Long-COVID Recovery, Correlation Insights, etc. — see ~line 6200–6960). Each card
  summarizes computed findings over a selectable range (day/week/month) and can build a copyable
  prompt. Keep the on-device computation (Pearson correlations over ≥14 days, |r| ≥ 0.3, etc.).
- **Simplify the presentation**: one clean card per report, readable finding rows, a range selector,
  and a "copy prompt"/share action. Correct sizing and spacing — this tab currently feels heavy.

Every screen must be reachable, scrollable, and safe-area correct. Nothing dead-ends.

---

## 6. Reading types & scoring (port exactly)

Reproduce all reading types from `READING_TYPES`: **mood, hrv (Unstructured HRV), breathHrv
(Breathing HRV), bp, bloodO2, ecg, restingHr, orthostatic, weight** — with their exact field
schemas. Same for activities, meds, symptoms, triggers, meals.

Port the **entire scoring engine** unchanged:
- `computeScores(r)` per type, all `s*` helpers, `totalPower`, `worstCat`, `catFromBands`.
- The `BANDS` registry and `bandsFor(type,key)` / `restingHrBands(pos)` / `qtcBands(sex)`.
- `SCORE_COLORS` / `GRADE_LABEL`.
- Day composite: `scoreSet` (component weights, availability normalization, morning-vs-later
  delta), `sleepGrade`, `activityGrade`, `dayCleanliness`, `streakInfo`.
- Reading summaries: reproduce `breathingSummary`, `unstructuredHrvSummary`, `bpSummary`,
  `ecgSummary`, `restingHrSummary`, `bloodO2Summary`, `genericReadingSummary` as native screens —
  hero card (autonomic composite, colored by `overall`), Details, **Power** (distribution bar +
  peaks), Metrics — each metric row with its grade dot, value, explainer, and **sparkline with
  grade-zone bands** (`buildSpark` over `metricHistory(type, extractor, 30)`).

Put this in a pure, well-tested `src/lib/scoring/` module (no UI imports) and **write unit tests**
that assert a handful of known inputs produce the same category the web app produces. This is the
one place regressions are unacceptable.

---

## 7. ★ Live HRV reading — the headline feature

This is the biggest new capability. The web app only lets you *type in* HRV numbers from a
device. The native app must **capture a 5-minute reading and compute every metric itself.**

### 7.1 Entry flow
From **Readings → ＋ Add → HRV**, present a short setup sheet:

1. **Reading kind:** segmented **Unstructured** vs **Breathing**.
   - If **Breathing**, show a **breathing-pattern dropdown**: options **4/4, 4/5, 4/6 (recommended),
     5/5** (label 4/6 "Recommended"). The pattern = inhale/exhale seconds; it sets the target
     respiration rate and the `style` field, and drives `expectedHf(style)` grading of the HF peak.
   - Unstructured = quiet still reading, no pacing.
2. **Signal source:** **Bluetooth strap** or **Apple Watch (Apple Health)**.
   - Bluetooth: show a scan list of nearby HR devices; connect to the chosen one (remember it).
   - Apple Watch: instruct the user to start a Breathe/Mindfulness or workout session on the watch,
     or read the watch's beat-to-beat samples via HealthKit (see §7.4).
3. **Start** → go full screen.

### 7.2 Full-screen session UI (must look great)
- Immersive full-screen (hide tab bar + status clutter), background matches the app theme.
- **Countdown/elapsed ring** showing progress toward **5:00** (300 s). Big mm:ss.
- **Live HR** (current bpm) and a small live tachogram/beat indicator so the user sees it's working.
- **Signal-quality indicator**: if RR intervals are noisy / beats dropping, show a subtle
  "adjust the strap" hint. Count/flag artifacts live.
- **Breathing guide (breathing kind only) — the centerpiece.** Build a **vertical "volume-bar
  with lines" visualizer** that rises on inhale and falls on exhale, paced exactly to the chosen
  pattern (e.g. 4/6 = 4s up, 6s down):
  - Render as a stack of horizontal lines/segments (like a level meter) that **fill upward** as you
    inhale and **drain** as you exhale, with a smooth eased curve (not linear) matching a natural
    breath. Use Reanimated on the UI thread so it's perfectly smooth.
  - **Glow** intensifies as the bar fills (inhale) and softens on exhale — an accent-colored bloom /
    blur behind the bar. It should look alive and premium, on-brand with the app.
  - Show the words **"Breathe in"** / **"Breathe out"** synced to the phase, plus an optional subtle
    count. Add a **gentle haptic** tick at each phase change (inhale start / exhale start).
  - Keep it minimal and beautiful — dark, glowing, calm. This screen is a big part of the app's feel.
- A **Stop/Finish** control (and auto-finish at 5:00). Guard against accidental exit (confirm).
- For unstructured readings, replace the breather with a calm "stay still, breathe normally" state
  and the same HR + progress ring.

### 7.3 HRV computation pipeline (`src/lib/hrv/`) — build this for real
Input: the array of **RR intervals (ms)** collected during the 5 minutes (from BLE RR values or
HealthKit beat-to-beat). Implement, as a pure, tested module:

1. **Artifact detection & correction.** Flag RR intervals that deviate >20–30% from a moving
   median (ectopic/missed beats, movement, swallowing). Correct by interpolation; keep both `rrRaw`
   and `rrClean`. Report an artifact % and refuse to grade if quality is too poor (warn the user).
2. **Time-domain metrics** (on `rrClean`):
   - `meanRr` (ms), `hr`/`avgHr` = 60000 / meanRr,
   - `sdnn` = std-dev of RR,
   - `rmssd` = sqrt(mean of squared successive differences),
   - `pnn50` = % of successive differences > 50 ms,
   - `cv` = SDNN/meanRR × 100,
   - `mode` (most common RR bin) + `amo50` (% of RR in the modal bin, Baevsky) + `mxdmn`
     (max−min RR, in **seconds**) + Baevsky **stress index**; from these derive PNS/SNS-style
     indices if feasible (otherwise leave `pns/sns/stressIndex` blank — they grade only if present).
3. **Frequency-domain** (this is the important one). RR series is unevenly sampled, so either:
   - Resample the RR tachogram to 4 Hz (cubic-spline interpolation) then run an **FFT** with a
     Hann window and Welch averaging, **or**
   - Compute a **Lomb–Scargle periodogram** directly on the unevenly-sampled series.
   Then integrate power over the standard bands and find peak frequencies:
   - **VLF** 0.0033–0.04 Hz → `vlowPower` (ms²)
   - **LF** 0.04–0.15 Hz → `lowPower` (ms²), `lfPeak` = frequency of max LF power (Hz)
   - **HF** 0.15–0.40 Hz → `highPower` (ms²), `hfPeak` = frequency of max HF power (Hz)
   - `totalPower` = VLF+LF+HF; `lfhf` = LF/HF.
   Validate against a known RR dataset so the numbers land in physiologically sane ranges
   (a resting adult ≈ RMSSD 20–60 ms, total power ~1000–5000 ms²). Tune windowing until sane.
4. **Coherence** (breathing kind): a 0–10ish coherence score from the ratio of peak power in a
   narrow band around the target breathing frequency to surrounding power (HeartMath-style: the
   peak at the paced respiration frequency vs total). Grade with `sCoherence`.
5. Write **all** of the above into the reading's fields using the **same keys** the manual form
   uses, then run `computeScores(r)` — so a captured reading and a typed-in reading are
   indistinguishable downstream.

Keep this module framework-free and **unit-tested** with a fixture RR series checked into the repo.

### 7.4 Sources
- **BLE (`react-native-ble-plx`):** connect to the **Heart Rate Service `0x180D`**, subscribe to
  the **Heart Rate Measurement characteristic `0x2A37`**. Parse the flags byte: bit0 = HR format
  (uint8/uint16), bit4 = RR-interval present → RR values are 1/1024-second units, convert to ms.
  Polar H10 and most straps stream RR here. Handle multiple RR values per notification, reconnection,
  and low battery. Show live HR from the same packets.
- **Apple Watch / HealthKit:** the watch doesn't stream live RR to third-party apps continuously,
  so support the realistic path: user runs a **Mindfulness/Breathe or workout** session on the watch;
  you read **beat-to-beat samples** (`heartRateVariabilitySDNN` and, where available, the
  high-frequency `heartbeatSeries` RR data) from HealthKit after/at the end of the session, then run
  the same pipeline. If only summary HRV (SDNN) + HR are available from the watch, fill those fields
  and mark the reading `source:"watch"` with a note that frequency-domain metrics need beat-to-beat
  data. Design the flow so it's honest about what the watch can provide, but still produces a saved,
  graded reading.

### 7.5 Results screen (after the reading)
Immediately show a results view = the ported **`breathingSummary`** / **`unstructuredHrvSummary`**:
- **Hero autonomic score** (0–100 composite with the documented weights) colored by `overall`,
  with the verdict line.
- **Power section:** the **VLF/LF/HF distribution bar** (segments colored `#f59e0b` / `#6366f1` /
  `#22c55e`, each labeled with its %), total power, LF/HF, VLF/LF/HF powers, LF & HF peaks — each
  graded and with a sparkline vs history.
- **HR waveform chart:** render the **tachogram / HR-over-time** for this session (the "waves") —
  a line chart of instantaneous HR (or RR) across the 5 minutes, drawn with `react-native-svg`,
  matching the app's chart style. This satisfies "a HR readout chart showing the waves."
- **Metrics section:** RMSSD, pNN50, SDNN, HR, mean RR, MxDMn, mode, AMo50, CV — graded rows with
  explainers and sparklines.
- Buttons: **Save reading** (writes to today's `readings`, source + raw data included), optionally
  **Write to Apple Health** (SDNN/HRV + a mindful-minutes session), and **Discard**.

---

## 8. Bluetooth details

- Runtime permission flow (iOS `NSBluetoothAlwaysUsageDescription`, Android location/BT perms).
- Scan → list devices (name + RSSI), connect, remember last device for one-tap reconnect.
- Robust: handle disconnect mid-reading (pause timer, prompt to reconnect, keep collected RR),
  weak signal, and the strap not being worn yet.
- A **Devices** screen in settings: connection status, battery (`0x180F`/`0x2A19` if exposed),
  forget/reconnect.

## 9. Apple HealthKit integration

Add a `src/lib/health/` module with a clean interface, gated behind an explicit permission screen.

**Read** (import into the journal / prefill readings): resting HR, walking HR, heart rate,
**HRV (SDNN)**, respiratory rate, blood oxygen (SpO₂), blood pressure (systolic/diastolic),
body mass (weight) → profile, sleep analysis (bed/wake/quality → `sleep`), and beat-to-beat
data for the reading pipeline (§7.4). Offer a "Sync from Health" action that pulls the day's
relevant samples into that day's entries (dedupe by time; never silently overwrite manual edits).

**Write:** when the user saves a captured HRV reading, optionally write **HRV SDNN**, **resting/avg
HR**, and a **Mindfulness (mindful minutes) session** for the 5-minute reading back to Health.
Also allow writing logged **weight**, **blood pressure**, and **SpO₂** readings to Health. Always
user-initiated and clearly labeled.

Handle "permission denied" and "data unavailable" gracefully with real UI, not crashes. iOS-only:
hide/disable on Android.

---

## 10. Import / export & settings

- **Import/Export JSON** in the exact PWA format (so the user can move their existing data in).
  Import records `meta.lastImport` then `save()`. Use the system share sheet / document picker.
- **Profile** drawer: sex, birthday, weight, height (feeds QTc sex adjustment, BMI, age).
- **Theme**: system / light / dark.
- **Devices**: BLE connections (§8).
- **Apple Health**: permissions + sync (§9).
- Footer: "Last updated …" + last imported filename.

---

## 11. Quality bar / acceptance criteria

The build is done when all of these are true:

- [ ] App launches to a working development build on iOS; no red screens; no dead buttons.
- [ ] Every reading/activity/med/symptom/food/trigger/digestion type can be added, viewed
      (summary sheet), edited, and deleted; rows tint by grade; sparklines render with grade zones.
- [ ] Day score gauge, score-explanation sheet, and streak card match the web app's logic.
- [ ] Scoring unit tests pass and match web-app categories for the fixture inputs.
- [ ] A full **5-minute Bluetooth HRV reading** works end to end: connect strap → guided breathing
      (or unstructured) → live HR + progress → compute all metrics on-device → results screen with
      power bar, peaks, tachogram, graded metric rows → save → appears in Journal and Analysis.
- [ ] The **breathing visualizer** is smooth (60fps), glows on inhale, paces correctly to the
      chosen pattern, shows "Breathe in/out", and has haptic phase cues. It looks premium.
- [ ] HealthKit read (at least HRV/HR/sleep/weight import) and write (HRV + mindful session) work
      on a real device or are clearly, gracefully degraded in the simulator.
- [ ] Analysis and Insights tabs are simplified, correctly sized, and visually clean in both themes.
- [ ] Light and dark themes both look intentional and consistent; spacing/type unified across screens.
- [ ] Import a real PWA `export.json` and everything shows up correctly.
- [ ] README explains how to run (`eas build --profile development` / `expo run:ios`), how to pair a
      strap, and how to grant Health permissions. Lint + typecheck pass.

---

## 12. Constraints & non-goals

- **No backend, no accounts, offline-first** — same philosophy as the PWA. All data on-device.
- Don't touch `docs/` — it stays the reference web app. Build the native app in a new top-level
  folder (e.g. `app-native/` or `mobile/`).
- Keep the scoring framework **identical**; if you find a genuine bug in a threshold, leave it and
  note it in the README rather than silently diverging.
- Medical-adjacent but **not** a medical device — include a short disclaimer in settings/onboarding.
- Prefer clarity and reliability over cleverness. Ship something real.

---

## 13. Suggested build order

1. Project scaffold, theme, component library, store + `save()`, data model, import/export.
2. Port scoring engine (`src/lib/scoring/`) + unit tests.
3. Journal tab: day card, sections, add/edit/summary sheets for all types (manual entry first).
4. Reading summary screens with sparklines + grade zones.
5. Analysis + Milestones + Insights tabs (ported, simplified).
6. HRV pipeline (`src/lib/hrv/`) + tests against a fixture RR series.
7. BLE capture + live session UI + breathing visualizer.
8. Results screen wired to the pipeline; save flow.
9. HealthKit read/write.
10. Polish pass against §11, both themes, real device.

Build it to ship.

---

## Appendix A — exact constants to pin (verify against `docs/index.html`)

These are easy to get subtly wrong; copy them exactly. Everything else lives in the source file.

**Grade → points** (for composite scores):
```js
const CAT_POINTS = { great: 90, good: 75, ok: 55, bad: 38, crash: 18, concerning: 18, warning: 72 };
const GRADE_PTS  = { great: 95, good: 80, ok: 60, warning: 60, bad: 35, crash: 10, concerning: 10 };
const SCORE_RANK = { great: 0, good: 1, ok: 2, warning: 2, bad: 3, crash: 4, concerning: 4 };
```

**Autonomic composite weights** (weighted mean of `CAT_POINTS[category]` over the metrics that
have a category; then `round(Σ pts·w / Σ w)`; hero color/verdict come from
`worstCat([rmssd, pnn50, totalPower])`, *not* the number):
```js
// Breathing HRV:    { rmssd:25, pnn50:15, totalPower:15, lfPeak:20, hfPeak:15, lfhf:10 }
// Unstructured HRV: { rmssd:25, pnn50:20, totalPower:15, lfPeak:15, lfhf:10,  sdnn:15 }
```

**Standard HRV frequency bands** (the web app never encodes these because the device pre-binned
the power — *you* must, since you compute power yourself): VLF 0.0033–0.04 Hz, LF 0.04–0.15 Hz,
HF 0.15–0.40 Hz. `totalPower = VLF+LF+HF`; `lfhf = LF/HF`; distribution % = band/total.
Peak-position grading targets: LF peak target ~0.08–0.10 Hz; HF peak target per breathing style
via `expectedHf`: `4/4→[0.18,0.21] · 4/5→[0.17,0.20] · 4/6→[0.15,0.18] · 5/5→[0.16,0.18]`.

**Storage note:** the web app stores reading field values as **trimmed strings** and re-parses
with `parseFloat` at every scoring/render call (the cached `r.scores` is advisory). In the native
port you may store numbers, but keep scoring tolerant of both and always recompute `computeScores`
at render time rather than trusting the cached copy.

**Power-bar segment colors:** VLF `#f59e0b`, LF `#6366f1`, HF `#22c55e` (labels shown only when a
segment is ≥12% wide).

**`catFromBands(v, bands)`**: return the first band whose `v < b.max`, else the last band's cat.
Every `BANDS.*` list is `{max, cat}` ascending with a final `max: Infinity`.
