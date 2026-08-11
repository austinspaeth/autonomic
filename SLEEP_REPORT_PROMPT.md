# Sleep Report — design prompt

A build/design brief for the full-screen sleep report opened from the Journal's
"Last night" card. Written to be handed to a design pass (Claude, Figma, or a
build agent) as a self-contained spec. It is deliberately explicit about what
data genuinely exists, because the whole risk in this feature is designing
sections the app cannot honestly fill.

---

## The prompt

You are designing a **sleep report** for **Autonomic Journal**, a private,
offline-first iOS/Android app (Expo / React Native) for people tracking
autonomic recovery — dysautonomia, POTS, long COVID, ME/CFS. All data lives on
the device. The audience is chronically ill and often crashed: they read this at
7am, in bed, on a bad day. Calm, legible, no gamification, no exclamation marks,
no cheerleading. The app's existing surfaces grade honestly and never flatter.

### What exists today

The Journal tab has a **"Last night" card**: a grade chip (Great / Good / OK /
Bad / Crash, color-coded), hours asleep in a large numeral, `bed → wake` times,
an optional `· Interrupted` and `· HR 54–96 bpm`, a stacked stage bar with a
Deep / REM / Core / Awake legend, and — when something is off — a one-line note
under a divider ("Short duration and elevated overnight HR (68 bpm vs 58
typical).").

**Design the card so it is tappable, and design the full-screen report modal it
opens.** The card itself should change as little as possible — an affordance
that it opens, nothing more. The report is the deliverable.

### The data you may use — and only this

Per night, stored in the journal:

| Field | Notes |
| --- | --- |
| `bed`, `wake` | `HH:MM` local. Present for every logged night. |
| `quality` | `good` or `interrupted` only. |
| `hrLow`, `hrHigh` | Overnight heart-rate min/max, bpm. Often present, not always. |
| `stages` | Minutes: `{ deep, rem, core, awake }`. **Totals only, no timeline.** Only for nights a watch staged — manual entries and older sources have none. |

Derived, already implemented and available:

- **Sleep grade** — duration + interruption set a base grade; an elevated
  overnight low then demotes it (≥ 65 bpm costs a step, ≥ 75 costs two; a peak
  ≥ 110 costs one). This mechanism is currently invisible to the user.
- **Typical overnight low** — median `hrLow` across the user's last 30 nights,
  needs 3+ nights.
- **Protocol sleep target** — hours the user set themselves (default 7).
- **Daytime resting-HR baseline** — the app logs `restingHr` readings (captured
  in-app and imported from the health store), so a stable recent baseline is a
  median over the user's last few weeks of them.
- The full journal: next-morning HRV readings (RMSSD), the 0–100 daily
  autonomic score, symptoms, triggers, activities, meds, water.

Available with a modest capture change (design for it, but mark these sections
so they can ship second):

- **Overnight heart-rate curve** — the full HR trace across the night. The app
  already queries these samples and keeps only the min/max, and already renders
  workout HR traces with a downsample + chart component.
- **Wake intervals** — count, each one's start and length. Already computed
  internally, currently summed into a single `awake` number.
- **Stage timeline (hypnogram)** — the staged intervals, currently summed into
  the four totals.
- **Overnight respiratory rate** — average breaths/min for the night.

### Do not design these

- Toss-and-turn, snoring, room noise, sleep-environment audio. The app never
  puts a microphone on the night; this is a privacy line, not a backlog item.
- SpO2, wrist temperature, breathing-disturbance counts.
- Any "sleep need" model or algorithmic sleep-requirement forecast. Sleep debt
  is measured **against the user's own protocol target**, never against an
  inferred personal need.
- A "were these times right?" confirmation prompt. The app already has an edit
  path and a confirm-on-import sheet; a second nag is not wanted.
- Population norms of any kind. Every comparison is the user against their own
  recent baseline.

### Sections to design, in order

1. **Verdict.** Grade, hours asleep, `bed → wake`. Then the thing the card can't
   fit: *why it graded that way* — what set the base grade and what demoted it,
   named plainly ("8.1 hours, uninterrupted — but the overnight low never went
   below 71 bpm, which cost two steps"). This is the report's reason to exist for
   a user who only ever reads the top.

2. **Overnight heart rate.** The hero. The full night's HR curve, with the
   overnight low and high marked, and the user's own typical-low line for
   reference. Call out **time to settle** — how long after bed the rate reached
   its low — and distinguish a night that settled early and stayed down from one
   that never dropped. This is the report's visual anchor, and it sets up the
   section below it — treat the two as a pair.

3. **Nocturnal dip.** The report's most important single number, and the reason
   a user shows this screen to a doctor.

   Healthy autonomic function drops heart rate roughly 10–20% below daytime
   values overnight as control shifts to parasympathetic dominance. A dip under
   about 10% is *non-dipping* — a recognized marker of autonomic dysfunction.
   Expressed here as a percentage: the night's overnight low against the user's
   own daytime resting-HR baseline.

   Why it earns the space: "I sleep nine hours and wake up exhausted" is the most
   common complaint in this population and the most routinely dismissed. A
   non-dipping night is a mechanistic explanation for it — the nervous system
   never entered recovery mode. This section hands someone a number for
   unrefreshing sleep, which is the whole point of the app.

   Design it as: the percentage, large; a band showing where it falls (dipping /
   reduced / non-dipping / reverse); the two numbers it came from, shown plainly
   so the arithmetic is inspectable; and the user's dip across recent nights,
   because the *trend* is what matters — a rising overnight HR floor tends to
   precede illness and crashes by a day or two.

   Three constraints on this section specifically:
   - **It needs a denominator.** With no recent resting-HR readings there is no
     baseline and the section does not appear. It must also not appear built on
     one or two stray readings — design the "not enough resting-HR data yet"
     case as a short, non-alarming prompt toward logging one, not as an error.
   - **Show its own precision.** A first-pass dip uses `hrLow`, a single minimum
     that one artifact can drag; the refined version uses the night's sleeping
     mean or trough hour from the HR curve. The design needs a quiet way to say
     which one this is, without turning into a statistics lecture.
   - **Never diagnose.** "Non-dipping" is describable as a pattern in the user's
     own data and worth raising with a clinician. It is not a finding, a
     diagnosis, or a risk score, and no copy may imply one.

4. **Stages.** A timeline (hypnogram) rather than a bar, with each stage's share
   compared to the user's own 30-night average. Must degrade gracefully: many
   nights have no stage data at all, and this section simply is not there for
   them. Never show an empty chart frame.

5. **Wakefulness.** Number of wakeups, total time awake, longest, and where they
   fell in the night. Restraint here — brief stirrings are normal sleep and the
   design should not make a normal night look alarming.

6. **Schedule.** The last 14 nights as bed/wake bars with the user's rolling
   average band, and how much last night deviated. Bedtime consistency is the
   single most actionable lever this app can point at, so this section should
   feel useful rather than merely historical.

7. **Sleep balance.** Hours per night against the user's protocol target across
   14 days, with a running surplus/deficit. Framed as *their* goal, and phrased
   without guilt on a deficit.

8. **What this night did.** The differentiator no other sleep app can build:
   this night set against the next morning's HRV reading and the day's autonomic
   score — and, in aggregate, what the user's best-scoring days have in common in
   their sleep. Be careful about causal language: this shows association in the
   user's own data, and the copy must not imply proof.

9. **Respiratory rate.** Small. Nightly average with the user's own trend,
   surfaced only when it deviates from their baseline.

### Design constraints

- **Both themes.** Light and dark are both first-class. The existing stage
  palette is deep `#8b5cf6`, REM `#3d93ee`, core `#2f66d0`, awake `#71717a` —
  validated for color-vision separation, and identity is always carried by a
  label as well as color, never by color alone.
- **Grade colors** run Excellent `#2ee06a`, Good `#16a34a`, Moderate `#eab308`,
  Compromised `#f97316`, Bad `#ef4444`, Crash `#b91c1c`.
- **Native, not web.** Bottom-sheet card modal in an iOS-style stack, scrollable,
  one-thumb reachable, phone widths.
- **Every section degrades.** A night with only `bed`, `wake`, and `quality`
  must still produce a report that feels complete rather than broken. Sections
  vanish; they do not render empty states.
- **Real data only.** The Journal never shows demo data, so this report is never
  populated with samples — design the sparse case as a real case.
- Numerals are tabular; large figures use the app's heavy numeric face.

### Deliverable

Show the tappable card, then the full report modal at phone width, in both light
and dark. For each section, show it with full data **and** in its degraded form.
Annotate any place where the design implies data beyond the table above.

Three states are worth showing in full, because they are what most users
actually see: a watch-staged night with everything; a manually logged night with
only times and quality; and a night where the nocturnal dip has no resting-HR
baseline to stand on.

---

## Build notes (not part of the prompt)

**Ships first, no new capture.** Verdict, nocturnal dip (from `hrLow` and the
resting-HR baseline), stages as totals, schedule, sleep balance, next-day
impact. All pure over the existing journal, so it works retroactively across the
year of backfilled nights on day one.

**Ships second, needs capture changes.** The HR curve, hypnogram, wake
intervals, and respiratory rate all come from data the health store still holds
but the app currently discards on import. Two consequences: the report is rich
for new nights and thin for backfilled ones until a re-sweep exists, and the
nocturnal dip gets its refined denominator (sleeping mean or trough hour) only
in this phase.

**Downstream.** A rising overnight HR floor is an early crash signal, so the
per-night dip is a natural input to `detectDownturn` and the crash warning.
Out of scope for the report itself; worth not designing against.
