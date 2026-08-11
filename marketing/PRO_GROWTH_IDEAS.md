# Pro features & post-trial conversion — an idea bank

**Written:** August 2026 · **Companions:** `MARKETING_PLAN.md` (§3 pricing, §10 funnel), `COMPETITOR_INTEL.md`

This doc is deliberately a *menu*, not a plan. It answers two questions:

1. What could Pro do that would make someone want it badly enough to pay?
2. How do we get a free user who's 14+ days in to convert without nagging them?

Nothing here is a commitment. §5 is my opinionated shortlist if you only do a few.

---

## 0. Where the line actually sits today

Worth being precise, because most of the good ideas are about *moving* this line, not
adding to it.

**Free forever**
- All journaling: sleep, meds, symptoms, triggers, hydration, meals, digestion
- Manual readings (BP, resting HR, orthostatic episode entry)
- Daily autonomic score + Outlook card, protocol/clean-day streak
- **1 live HRV capture per day** (`HRV_FREE_PER_DAY`, `src/lib/gating.ts`)
- Analysis **Day view only — "Last 14 days · daily"** (`src/lib/analysis/buckets.ts:16`)
- Milestones tab (ungated today)
- Health/Health Connect import + the one-time year backfill, widgets, reminders,
  crash alert, backups & export

**Pro**
- Unlimited live HRV
- Analysis Week / Month / Year
- POTS stand tests + live episode capture
- All AI insight prompts and doctor reports (the raw data-only prompt stays free),
  plus every per-reading "Get AI Insights on this…" button

**Trial:** local 7-day full-access window stamped at first launch (`src/lib/tier.ts`),
independent of the store-side 7-day intro offer.

> ⚠️ **A phone-only subscriber cannot use POTS testing at all.** `StandTestSession.tsx:232`
> and `OrthostaticSession.tsx:209` are both `disabled={!strap.connected}` — the POTS sessions
> are Bluetooth-chest-strap-only. HRV capture has a proper `SourcePicker` (strap / watch /
> camera); the POTS sessions never got one. So a user with no watch and no strap pays for a
> headline paywall benefit and hits *"Connecting to strap…"* forever. **Giving the stand test
> the camera source it's missing is the highest-priority fix in this document** — the PPG
> pipeline (`src/lib/ppg/`), the grading (`src/lib/pots/live.ts`) and the session UI all
> already exist. A hardware-free orthostatic test graded against the ≥30 bpm criterion is also
> something nobody else ships.

**The single most important number in this doc:** the free Analysis view shows the
**last 14 days**. Which means *the day a free user crosses day 15, the app starts hiding
data they created themselves.* That is the moment. Everything in §3 is built around it.

---

# Part 1 — Pro feature ideas

Grouped by the job the user is hiring the feature to do. For this audience the jobs are,
in rough order of willingness-to-pay:

> **"Don't let me crash."** → **"Prove to my doctor I'm not making this up."** →
> **"Tell me what's actually helping."** → **"Show me I'm getting better."**

Free journaling serves none of these on its own. It just collects the raw material.
That gap *is* the Pro pitch.

## 1.0 What separates a killer feature from a good one

Four tests. A killer feature passes all four:

1. **Used daily** (or near enough to build a habit)
2. **Pays off on day 1**, not day 30
3. **Unavailable anywhere else**
4. **Changes what you do**, not just what you know

Running the candidates through it is clarifying, and it demotes some obvious favourites:

| | Verdict |
|---|---|
| Doctor report (§1.2) | Used ~3× a year. Highest willingness-to-pay here, but it's a **purchase reason**, not a killer feature. Both are worth having — don't confuse them. |
| Trigger discovery (§1.3) | Fails test 2. Brilliant at day 60, invisible at day 2. |
| Ewing battery (§1.5) | Fails 1 and 4. A credibility feature for the report, not a wedge. |
| Passive watch monitoring (§1.1 G) | Fails 3 by construction — most users have no watch. |
| **Episode capture (§1.1 E)** | **Passes all four.** |
| **Pacing budget (§1.1 B)** | **Passes all four.** |

The recurring trap: nearly every analysis feature has a **cold-start problem** — it needs 30
days of logging before it says anything, which is well past the trial window where the buying
decision happens. Only two things on this list dodge it: episode capture (immediate, from the
first tap) and "your year before the app" (§1.4 Q).

---

## 1.1 "Don't let me crash" — the highest-value job

### A. Crash forecast (forward-looking), not just the crash alert (reactive)

You already ship `detectDownturn` + a same-day crash notification for free. The Pro
version looks **forward**: a 24–72h risk read with named drivers.

> **Crash risk: elevated.** HRV down 18% over 3 days · two nights under 6h ·
> yesterday's workout hit Z3 for 22 min. Your last 4 crashes all followed this pattern.

This is the thing this community would pay for above everything else. It's pure on-device
math over data you already hold, and it's a *daily* reason to open the app.

### B. Pacing budget / energy envelope — a live "spoon meter"

Compute a daily capacity allowance from morning HRV + last night's sleep + recent load,
then **deplete it live** as activities get logged. Show it as a ring: "You're at 78% of
today's envelope."

This is Visible's core loop — and Visible charges $160/yr *and* requires their armband.
You can do it software-only. It turns Pro from "more charts" into a thing that changes
what the user does at 2pm. It also earns its own home-screen widget (see §1.6), which is
the best retention surface you have.

### C. Flare forensics — retrospective root-cause on every crash

When a crash day lands, run a 72h lookback and rank every logged variable by deviation
from that user's own non-crash baseline.

> Before your last 6 crashes: sleep < 6h in 5/6 · high-histamine meal in 4/6 ·
> standing delta > 35 in 4/6.

Turns the worst days into the most valuable data. Nothing on the market does this.

### D. Pre-event planner

"You logged an appointment/wedding/flight on Saturday." → a pre-load plan (salt/fluid/rest
schedule from their own best-day pattern) and a predicted state. Very concrete life value,
very hard to get anywhere else.

### E. Episode capture — the 60-second camera reading taken *during* symptoms ⭐⭐

**The strongest killer-feature candidate on this list, and it needs no hardware.**

Someone feels an episode starting: widget button or lock screen → finger on the rear camera →
60 seconds → timestamped HR, rise from baseline, posture and symptoms in two taps.

What that delivers is the thing this population is most starved of: **objective evidence of a
subjective experience.** "HR 128 standing, +42 over baseline, 2:14pm" is instantly validating
in a way no chart is. It's phone-only. It's frequent — symptomatic people have several a day.
And it accumulates into *"47 documented episodes over 3 months, mean rise +38 bpm"*, which is
simultaneously the episode counter, the recovery trend, and the strongest page in the doctor
report.

Run it against the four tests in §1.7a and it passes all of them, which almost nothing else here does.

*Engineering caveat, honestly:* peripheral vasoconstriction during presyncope is the worst case
for camera PPG — the finger goes pale exactly when the signal is needed. Design it to capture
**rate reliably and treat HRV as best-effort**. For documenting an episode, rate is what
matters, and rate is the easy part.

### F. Time-to-symptom-onset ⭐

Two taps: "upright" → "symptoms started." That's the whole feature.

Trended, it *is* the recovery curve, and it moves visibly weeks before HRV does. *"Three weeks
ago you lasted 4 minutes. Yesterday: 19."* Costs almost nothing to build, works for every user
with no hardware at all, and it's the number both doctors and disability assessors actually ask
for. This is the "am I getting better" answer for someone with only a phone.

### G. Passive orthostatic detection (Apple Watch) — an accelerant, not the feature

Watch HR spikes on standing are detectable passively: "6 orthostatic events detected today,
avg +34 bpm."

**The metric is right; the mechanism can't be the wedge.** Episode burden per day is genuinely
one of the best things to track — it's how patients describe their own lives ("I had five
today"), it's what doctors ask, and its trend over months is a clearer recovery signal than HRV
will ever be. But passive detection has two problems. False positives — stairs, heat, caffeine,
a startle — and if the app says 14 when the user felt 3, trust is gone, which in this community
is the whole product. Fixing that needs a confirmation prompt, which turns passive magic into a
notification chore. And it's watch-gated.

**The principle worth generalizing: make the metric universal, make the sensor an accelerant.**
Episode burden should be first-class and one-tap for everyone (§1.1 E), with watch owners
getting help filling it in. Then the trend chart, the report line and the correlations work for
100% of users instead of the minority with hardware.

---

## 1.2 "Prove it to my doctor" — the highest-conversion job

`MARKETING_PLAN.md` already calls the doctor report the killer wedge. Today it's a
*prompt you paste into an AI*. That's a clipboard feature, not a product. Two upgrades:

### F. A real PDF clinical summary pack

Generated on-device, printable, looks like it came from a clinic:
- Orthostatic table: supine → stand HR/BP deltas across every test, with the ≥30 bpm
  (≥40 adolescent) POTS criterion flagged, dates, and a distribution
- Symptom burden over time, by type and severity
- Medication timeline overlaid on symptom/score change
- Sleep + HRV trend with reference bands
- A one-page cover summary a rushed cardiologist can read in 40 seconds

Sell it as **"walk in with evidence."** Qaly proves people pay $180/yr for exactly this
kind of credibility.

### G. Disability / insurance documentation mode

A different, more brutal document: bad-day count per month, **hours upright**, functional
capacity trend, missed-activity log, symptom-free days. Assessors ask for exactly these
and nobody produces them. This is a high-stakes, high-willingness-to-pay use case, and it
is *not* served by anything on the market.

### H. Appointment prep

"Your neurologist appointment is Tuesday. Here are the 3 things your data says to raise,
and the 2 questions to ask." Plus a post-visit capture so the next report shows what
changed since.

### I. Clinical reference context (no backend, no other users)

"Your standing delta of 38 bpm is in the range consistent with POTS criteria." Baked-in
reference bands give the "where do I stand" feeling with zero server and zero privacy
compromise. (Careful with claim wording — see §6.)

---

## 1.3 "What's actually helping me?" — the most defensible job

### J. Trigger & helper discovery engine ⭐

Automated lagged-correlation across everything logged — meds, trigger foods, activities,
sleep timing, hydration, cycle phase — against next-day score / HRV / symptom load.
Output a ranked, confidence-scored list:

> **Helping you:** electrolytes (+0.8 score, n=41, high confidence) · 8h+ sleep · compression
> **Hurting you:** alcohol (−1.4 next-day score, n=12) · heat exposure · <5h sleep

This is what people *believe* they're journaling for and never actually compute. It's pure
on-device stats, and — critically — **it gets better the more data you have**, which is the
exact flywheel you want tied to a subscription.

### K. N-of-1 experiment mode ⭐ (the outside-the-box one)

> "Test magnesium glycinate for 3 weeks. We'll run on/off blocks and tell you if it worked."

Pre-registered, block-randomized, with a real statistical readout at the end and a shareable
result card. This is genuine clinical-grade self-experimentation, entirely on-device, and it
is *exactly* the app's brand. It also generates content: "I ran an experiment on myself and
here's what it said" is a Reddit post that markets itself.

### L. Medication effectiveness & titration tracker

Per-med before/after readouts:

> Since starting ivabradine (day 12): resting HR −11 · standing delta −14 ·
> bad days 9/mo → 4/mo · new symptoms since start: fatigue (+3/wk)

Dose-vs-response when doses are logged. Answers "is this drug working?" — a question
patients and doctors are both bad at answering.

### M. Cycle-phase overlay

Cycle position as a layer under every other metric: cycle day on the day summary, a phase band
behind the Analysis charts, a "symptoms by cycle day" view.

**Why it matters here.** Estrogen and progesterone act directly on the things already broken in
POTS — vascular tone, plasma volume, heart rate. Plasma volume falls in the late luteal phase;
progesterone is a vasodilator and raises core temperature. The wearable literature is consistent
that resting HR rises a few bpm and RMSSD drops in the luteal phase in *healthy* women. In a
population whose baseline is already marginal, that shift is the difference between a functional
week and a bedbound one, and perimenstrual flares are among the most commonly reported patterns
in POTS communities.

**But lead with the stronger argument:** cycle phase is a **confounder in everything else you
show**. If HRV reliably drops 15% every luteal phase, week-over-week trends carry a monthly
sawtooth that reads as "I'm getting worse" — and the trigger-discovery engine (§1.3 J) will
silently attribute that sawtooth to whatever the user happened to eat or do that week. This
isn't a nice extra layer; **it's noise removal that makes every other Pro analysis more correct.**

**What it takes.** Nothing exists today — the `period` field in the registry is morning/evening,
unrelated. Needs a small cycle model (period start dates → derived cycle day), a one-tap "period
started" entry, and optionally a Health read (HealthKit menstrual flow, Health Connect
`MenstruationPeriod`) so users already logging in Apple Health get it free.

**The catch.** Irregular cycles are extremely common here — illness disrupts them and the
hEDS/PCOS overlap is significant. So don't predict phase from a calendar: label by **cycle day
since last period**, which is backward-looking and therefore always accurate. And a large share
of users are on hormonal contraception, post-menopausal, or male — this must be an opt-in
overlay that is completely invisible if unused.

### N. Weather / barometric overlay

Barometric pressure and heat are the two most-cited environmental triggers in these
communities. Auto-log them and correlate. *Caveat:* this is the one idea here that needs a
network call. It can be a direct client → public weather API hit with coarse location, no
backend of ours — but it does put a hole in "nothing ever leaves your phone," so the copy
and the opt-in have to be careful.

---

## 1.4 "Am I getting better?" — the renewal job

### O. Recovery trajectory ⭐

Someone 18 months into long COVID **cannot feel** month-over-month improvement. A view that
says, with their own numbers:

> **You are 34% better than you were 6 months ago.**
> Score 4.1 → 5.5 · bad days 14/mo → 6/mo · HRV +19%

is emotionally enormous and is the single best renewal argument the data can make. You
already gate the Year view — but "Year view" is a *feature name*. **"Am I actually getting
better?"** is a *reason to pay*. Same code, different framing.

### P. Baseline vs now, side by side

Your worst month vs this month, in one screen. Plus "recovery milestones" — first
symptom-free day, first week without a crash, first month with HRV above baseline.
(Milestones is currently free and ungated; the *long-horizon* comparisons could sit above
the line.)

### Q. "Your year before the app"

When someone connects Health you already sweep 365 days (`readHistory`, `HISTORY_DAYS`,
`HistoryBundle`). Right now that lands silently in the journal. Turn it into a generated report
they see immediately: twelve months of resting HR, sleep, workout load and HRV, with downturn
periods marked.

**Why it matters strategically.** This is the only feature in this document that delivers full
Pro value **on day 1 with zero user effort**. Everything else in Part 1 has the cold-start
problem from §1.0 — 30 days of logging before it says anything, which is well past the trial.
This one is instantly rich at the exact moment the buying decision happens. That property is
rare enough to be worth a lot on its own.

The emotional payload is unusually high too. Someone sick for two years with no record of it
gets handed one; long COVID users can frequently see the precise week they were infected
sitting in their resting HR. That's a screenshot that ends up in a Facebook group.

**What it takes.** The pipeline exists. The work is the narrative/report layer and its placement
in the trial flow.

**Two honest catches.** **Android gets substantially less** — Health Connect has no
beat-to-beat series, so the backfill imports zero historical HRV there; the Android report is
sleep, RHR and workouts only, and the copy has to be scoped per-platform rather than promising
the same thing. And it only fires for people who *have* a year of history, so a new iPhone user
with an empty Health app gets an empty report. Needs a graceful "not enough history yet" path
or it becomes a bad first impression instead of a great one.

---

## 1.5 HRV depth — turn a *limit* into *capability*

"Unlimited captures" is a removed restriction, not a feature. People don't get excited about
the absence of a cap. Give Pro things the free tier genuinely cannot do:

### R. HRV biofeedback / resonance-frequency training ⭐

Find the user's resonant breathing rate (test 4.5 / 5.0 / 5.5 / 6.0 / 6.5 bpm, measure
coherence at each), then a **guided daily trainer** with live coherence feedback, session
history, and streaks.

This is a **therapy, not a chart** — the best-evidenced non-drug intervention for autonomic
dysregulation. It's daily, it's sticky, it's habit-forming, and you already have coherence in
the HRV pipeline and breath styling in `src/lib/breathStyle.ts`. Of everything on this list,
this is the one most likely to make someone say "I use this every morning."

### S. The Ewing battery — build two of three, drop Valsalva

The standard bedside autonomic assessment (Ewing & Clarke, 1985), still used in autonomic labs:

- **E/I ratio (deep breathing)** — breathe at 6/min for a minute; mean longest RR on expiration
  over mean shortest on inspiration. Measures vagal integrity. Roughly >1.21 in young adults.
- **30:15 ratio (standing)** — longest RR around beat 30 after standing over shortest around
  beat 15. Captures reflex tachycardia and vagal rebound. Roughly >1.04.
- **Valsalva ratio** — forced expiration against 40 mmHg for 15s; longest RR after release over
  shortest during strain.

**Why it's clinically interesting.** It separates *"my heart rate goes up when I stand"* from
*"my autonomic reflexes are impaired."* Normal E/I in a POTS patient means intact vagal function
— the hyperadrenergic or hypovolemic phenotype. Reduced E/I points to a neuropathic phenotype.
That distinction changes treatment, which is more than almost any consumer metric can claim.

**Correction to an earlier note in this doc:** the HRV pipeline produces the clean RR series
these need (`correctArtifacts`, `parseHeartRateMeasurement`), but the ratio math is *not*
implemented. That part is small. The real problems are elsewhere:

- **30:15 is nearly free if the camera stand test gets built** — same session, one extra
  beat-indexed computation. A second clinical number from a session the user already performed.
- **E/I is nearly free too** — paced breathing at 6/min is exactly what the `breathHrv` session
  already does. The raw data may already be collected and the ratio thrown away.
- **Drop Valsalva.** It needs a calibrated 40 mmHg expiratory pressure; without a manometer the
  ratio isn't imprecise, it's uninterpretable. And Valsalva can provoke syncope — shipping
  "blow as hard as you can for 15 seconds" to a population defined by fainting is a real safety
  and liability question, not a nitpick.

So: two-thirds is a free byproduct of sessions already planned; the remaining third is the part
that's genuinely problematic. Report credibility, not a wedge — see §1.0.

### T. Nocturnal HR dip — the best value-to-effort item in this document

**What it is.** Healthy autonomic function drops HR and BP 10–20% below daytime values
overnight as control shifts to parasympathetic dominance. Under ~10% is "non-dipping" — a
recognized marker of autonomic dysfunction and an independent cardiovascular risk predictor in
the BP literature.

**Why it matters here.** "I sleep nine hours and wake up exhausted" is among the most universal
complaints in this population and the most routinely dismissed. Non-dipping HR is a
*mechanistic explanation*: the nervous system never entered recovery mode. Handing someone a
number for unrefreshing sleep is precisely the "prove it's real" wedge — and it applies to
sleep, which is every night, for every user.

It's also **predictive**: a rising overnight HR floor typically precedes illness and crashes by
a day or two (the basis of Whoop's and Oura's illness detection), so it feeds the crash
forecast in §1.1 A directly.

**What it takes — the good news.** `sleep.hrLow` / `sleep.hrHigh` are already persisted per
night, and resting HR already arrives via `readImports`. A first-pass dip percentage is
computable **today, from data already on disk** — no new permissions, no native work, no new
capture flow. A refined version uses the overnight HR series `readSleep` already returns.

**The catch.** `hrLow` is a single minimum, so one artifact drags it — prefer the sleeping mean
or trough hour once using the series. It needs a stable daytime resting-HR baseline as the
denominator, so users with no resting HR readings get nothing. Health Connect coverage varies
by device.

### U. Research-grade export

RR intervals as Kubios-compatible `.txt`, CSV/FHIR export, Apple Health write-back. Tiny
audience — but the ones who want it are the ones who post in forums.

---

## 1.6 Structural / packaging features

### V. The pacing-budget widget & watch complication
Keep basic widgets free (they drive retention — gating them would backfire). Make the
**Protocol / energy-envelope** widget Pro, since it depends on a Pro computation. Same for
a watch complication.

### W. Multi-profile / caregiver mode — right demand, wrong time

**Why the demand is real.** Adolescent POTS is a large, underserved segment and the *parent* is
the one who logs, researches, buys and posts in the support groups. Severe ME/CFS patients often
can't use a phone at all, so the caregiver *is* the user. High willingness to pay, no good tool.
It would also justify a Family tier at ~$79–99/yr, raising the ARPU ceiling and making $49.99
look modest.

**Why I'd still say no for now.** The architecture assumes one subject in more places than is
obvious: `STORAGE_KEY = 'autonomic.journal.v1'` (one MMKV key), `state.profile` (singular), the
waveform sidecar (one instance keyed by entry id), widgets (one payload), reminders (one stable
id), plus the crash watcher, review eligibility, Health-import dedup and the permanent declined
list — all single-subject. Every "one stable id" invariant in `CLAUDE.md` becomes "one per
profile." That's weeks of work touching nearly every stateful module, and a permanent tax on
everything built afterward.

There's also a hard constraint that namespacing can't fix: **a parent's phone holds the
parent's HealthKit data.** A child's profile can't import from it at all, so the highest-value
half of the app doesn't work for the second profile regardless.

**The 80% version is free.** What a family actually lacks is (a) one subscription covering two
installs and (b) eventually a combined view. Solve (a) **today** by enabling **Family Sharing**
for the subscription in App Store Connect and the Play Console — a settings toggle, zero code.
That captures most of the willingness-to-pay with none of the architecture. Build real
multi-profile later, if the support emails demand it.

### X. Data longevity as a promise
Automatic encrypted backups to *their own* iCloud/Drive, version history, restore-from-any-day.
No backend needed. Someone with 3 years of health data is terrified of losing it — this is a
cheap line item with high perceived value, and it doubles down on the anti-Welltory position
("we never delete your history — and we'll help you keep it forever").

### Y. Low-energy logging ("bad day mode")
On a crash day, a person physically cannot fill out forms. One big button + a voice note,
parsed into structured entries via **on-device** speech recognition (free on iOS). Framing
matters: sell it as a capability, not as withheld accessibility. Arguably belongs in free —
but "speak your day, get structured entries" is a legitimately premium capability.

### Z. In-app AI (the one that needs a backend)
Today Insights generates a prompt to paste elsewhere. Two paths:

- **Backendless (cheap, do this now):** one-tap handoff into the ChatGPT/Claude app with the
  prompt pre-filled, then a "paste the answer back" capture that saves it into a **timeline
  of past insights** with follow-up prompt chains. Turns a clipboard into a product.
- **With a thin proxy (expensive, but flagship):** "ask your data anything" in-app chat. This
  is the single biggest Pro differentiator available — and the only idea here that breaks
  the no-backend architecture and adds per-user marginal cost. Costs can be bounded (N
  queries/month, cached prompts), but it's a real strategic decision, not a feature.

---

## 1.7 What I would *not* gate

- **Widgets, reminders, and the crash alert.** These are retention infrastructure. A user
  who stops opening the app never converts.
- **Export and backup.** "Your data is always yours" is load-bearing for the brand. Charging
  for the exit is exactly the Welltory move you're positioned against.
- **Basic journaling, forever.** Already right.
- **The 1/day HRV capture.** Also right — it's the daily habit. (But see §3.4 for a smarter
  way to handle the second capture.)

---

# Part 2 — Converting free users past day 14

## 2.0 The principle

**The best upsell is a moment, not a placement.**

This audience is energy-limited. Every interruption is a tax paid in a currency they don't
have. So the model isn't "show the offer more" — it's "show the offer *exactly once, at the
moment it's obviously relevant, about their own data.*"

You already built the machinery for precisely this discipline: `src/lib/review/eligibility.ts`
decides when to ask for a store review using "calm moment" rules (not on a bad day, not during
a downturn, not the day the crash alert fired, not in a paywall session). **Build the mirror
image of it** — `src/lib/upsell/eligibility.ts` — and route every proactive upsell through it.
That single piece of architecture is worth more than any individual tactic below.

---

## 2.1 The day-15 moment: show their data, don't show a lock ⭐

This is the highest-leverage change in the whole document.

Today, crossing day 15 means the Day view silently clips to 14 days and Week/Month/Year show
a lock glyph. A lock says *"the app is crippled."* Instead:

**Render the full chart with their real data, and fade/blur the portion beyond 14 days**, with
one quiet line under it:

> You have **31 days** of data. See all of it. →

Same for the Week/Month/Year segments: instead of a lock icon, render the *actual chart built
from their actual history*, dimmed. Seeing your own hidden history is dramatically more
motivating than a padlock, and it's honest — the data is theirs, you're showing them it exists.

## 2.2 Show the answer, hide the specifics

The strongest version of §2.1 applied to the analysis features. Compute a Pro insight for free
and show only its **headline**:

> We found **3 things** that consistently precede your crashes.
> Your **top helper** shows up on 78% of your good days.

Tap → paywall. A curiosity gap about *their own body* beats any feature list ever written.
Do this on the trigger-discovery engine (§1.3 J) and flare forensics (§1.1 C) especially.

## 2.3 Milestone-earned offers, never timer-based

Tie every ask to something they achieved:

| Trigger | The line |
|---|---|
| 30 days logged | "You've built a month of data. Here's what Pro can now see in it." |
| 14-day protocol streak | "Two weeks clean. Want to see what it's doing to your numbers?" |
| First measurable improvement | "Your 30-day HRV is up 12%. See the full trajectory." |
| 5th stand test logged | "Your orthostatic pattern is now documentable. Build the report." |
| 10th crash day | "Ten crashes logged. Want to know what they had in common?" |

Congratulate first, offer second. This also lands exactly when they feel most invested.

## 2.4 Pain-moment targeting

Raise the offer where they're already feeling the gap:
- Right after logging a **crash day** → "Want to know what preceded it?" *(but not on the day
  the crash alert fired — respect the eligibility rules)*
- The night before a logged **appointment** → "Bring a report."
- After their **second HRV capture attempt** in a day — but see §3.4; make the *first* denial
  generous, not a wall.

## 2.5 Earned trial extension — a gift, not a nag ⭐

> "You've logged 20 days. Have another 7 days of Pro, on us."

This is the single most counter-intuitive high-performer available to you. It converts
*behaviour* into *exposure*, at the point where they finally have enough data for Pro to look
impressive — which the original day-1 trial did not. A user who tastes Pro with 30 days of
their own history converts far better than one who tasted it with 3 days of an empty journal.

And a gift is the emotional opposite of a nag. In a community that talks to each other, that
matters.

## 2.6 Don't cliff at trial end — taper

Day 8 (trial expiry) is when the app abruptly gets *worse*, and it's the biggest uninstall
risk in the funnel. Instead of a hard cliff, keep **one** Pro capability alive permanently as a
taste — e.g. the Week view stays unlocked, or **one AI report per month**.

That monthly free report becomes a scheduled, non-intrusive, value-first reminder of what
they're missing, delivered as a gift rather than an ad. It's the best re-engagement mechanic
on this list because it *never reads as marketing*.

## 2.7 Make the existing upsell card smarter, not louder

`ProUpsellCard` in `src/features/DaySummary.tsx` today is a static 4-bullet feature list,
always expanded, on every day summary, with a **"LOCKED"** badge. Three problems: it's
permanent (so it trains blindness), it's generic (says nothing about *them*), and the badge
frames the app as broken.

Rewrite it as a **single personalized line**. But one rule governs the whole idea:

> **Every line must resolve to a view that exists today.**

A line like *"6 crash days this month — see what they had in common"* points at flare forensics
(§1.1 C), which isn't built. Landing a user on a paywall for a view that doesn't exist is worse
than the generic bullets — that's how you earn refunds. Only three destinations are reachable
right now (Analysis Week/Month/Year, the Insights reports, unlimited HRV capture), so only
claims that land there may be made. POTS testing is reachable *only with a strap* — never point
a phone-only user at it.

That leaves three honest triggers, all computable today:

1. **History horizon** → Analysis Month. `engagedDayCount(days) > 14`.
   *"You have 31 days logged. Your Day view shows 14."*
2. **Report ready** → Insights month report. `entryCount(days, last30Keys)` over a threshold.
   *"240 entries this month. Turn them into a doctor-visit summary."*
3. **Trend visible** → Analysis Month. A qualifying 30-vs-30 improvement.
   *"Your resting HR is down 6 bpm since last month."*

The third is the strongest, because it's a **reward rather than a nag** — and it leads to the
bigger realization below.

Drop the LOCKED badge. With one line there's nothing to expand, so the accordion goes too.

**The Trend card should render for every tier, not just free users.** A card that only appears
when you haven't paid is an advertisement, and people learn to ignore advertisements. The same
card shown to everyone is a *feature*: free and Pro see the identical headline, and the tier
changes only where the tap lands (free → the locked Month view and its faded data; Pro → the
same view, unlocked). **The fact is never rationed; only the ask is** — which means the card
itself doesn't pass through the upsell gate, only its optional upgrade sub-line does.

Two rules keep it honest: it reports **improvements only** — decline is `DownturnWarning`'s job
and telling a chronically ill user their HRV fell is an actual crash trigger — and it stays
silent during a downturn even when some metric improved.

Building it also forces a cleanup worth doing on its own: **three places already answer "is this
metric moving?" and they disagree.** `weekTrend` (`widgets.ts:101`) fires on any non-zero
percent change against a trailing-week *mean*, while `detectDownturn` / `detectUpturn` require
4 scored days of 8 plus a real magnitude — so a widget can show ▲ on noise while the app shows a
downturn warning for the same day. And `downturn.ts` / `upturn.ts` duplicate each other outright
(both `WINDOW = 8`, `MIN_SCORED = 4`). Full spec, including the consolidated `src/lib/trends/`
registry, in **`TRENDS_MODULE_PROMPT.md`** at the repo root.

**And when no trigger matches, show nothing.** No generic fallback. The card only renders for
`tier === 'free'` today, so it never appears during the trial; it first becomes possible on day
8, when the user has ≤7 days of data and trigger 1 can't fire. That leaves roughly days 8–14
quiet — which is correct, not a gap. Day 8 is when the app just got *worse* for them, the exact
uninstall risk §2.6 is about. Staying silent until there's something true and specific to say is
the better trade. Net effect: today a brand-new free user carries a permanent LOCKED ad in their
journal before the app has demonstrated anything; after this, the first thing they ever see is a
true statement about their own data.

## 2.8 Frequency discipline — the actual mechanism of "non-intrusive"

Codify these as rules in the eligibility module:

1. **Never more than one upsell surface visible at a time.** (Today the upsell card, the
   locked segments, and the HRV lock can all be on screen at once.)
2. **At most one *proactive* prompt per 10 days.** Passive surfaces (a dimmed chart) don't count.
3. **Never on a bad/crash day, never during a downturn, never the day the crash alert fired.**
   Reuse the review-eligibility logic verbatim.
4. **Never in the same session as the review prompt.** (`notePaywallSeen()` already handles
   one direction — make it bidirectional.)
5. **Dismissal must mean something.** Two dismissals of a given surface → retire it for 30 days
   and rotate to a different one. Nothing erodes trust like an X button that does nothing.
6. **Never interstitial. Never full-screen on launch. Never a timed modal.**

Rules 1 and 5 alone will make the app feel meaningfully calmer while *increasing* the
conversion rate of the prompts that do fire.

**The distinction that makes this work — and the one that's easy to get wrong.** There are two
kinds of upsell surface needing opposite treatment:

- **Reactive** — the user tapped a locked thing. Week/Month/Year segments, the Insights cards,
  the second HRV capture, the Settings row. These must **never** be rate-limited or suppressed.
  The user asked. Gating them breaks the app: someone taps "Month" and nothing happens. Every
  existing `usePaywall()` call site is already correct and stays exactly as it is.
- **Proactive** — the app raises an offer unprompted. Today there is exactly **one**:
  `ProUpsellCard` (`DaySummary.tsx:206`). This is the only category the gate governs.

Passive state — a dimmed segment, a faded chart — is neither: honest UI, always visible, never
counted.

The review prompt is 100% proactive, so it has no equivalent split; this is the one place the
mirror isn't symmetric, and it's the part to get right. Note also that `'improvement'` (pitching
Pro on a good day) competes with `detectUpturn` for *the same day* — the two systems want the
same scarce resource, the user's goodwill when they feel better. **The review ask should win**
(OS-quota-limited, far rarer). Today they can't see each other, so a free user on a good day can
get both — fix by adding `noteReviewAsked()` as the reverse of the existing `notePaywallSeen()`.

A full implementation spec lives in **`UPSELL_ELIGIBILITY_PROMPT.md`** at the repo root.

## 2.9 Value-first notifications

A monthly **"Your month in review"** notification (free, real content) that opens a genuinely
useful summary with one Pro line at the bottom. Also: statistically-meaningful trend alerts —
"your resting HR has trended up 8 days; this preceded 3 of your last 4 crashes." That's a
health warning that happens to demonstrate what Pro does.

## 2.10 Win-back and lifecycle

- Lapsed free users at 30/90 days: offer code + "your data is still here, exactly as you left it."
- Monthly → annual upgrade prompt after 3 consecutive months.
- Month-11 "your year in recovery" report as the renewal argument (already in
  `MARKETING_PLAN.md` §10 — worth building the report itself, not just the notification).

## 2.11 Referral inside the community

"Give a friend a month of Pro." Costs almost nothing, spreads inside exactly the support
groups that are your primary channel. Reward the referrer only (App Store compliant).

---

# Part 3 — Packaging & pricing levers

**3.1 The trial length is mismatched with the product.** Recovery is measured in months.
A 7-day trial asks people to judge a longitudinal analysis tool before it has anything
longitudinal to analyze. Options, in order of my preference:

1. Keep 7 days at install **+ the earned second trial at day 20** (§2.5) — best of both,
   no store changes needed for the local window.
2. Move to a **30-day trial**. Higher exposure, but a much longer unpaid period and
   store-side trials of that length have weaker conversion per-start.
3. **Intro offer instead of a trial** — 3 months at 50% off. Better matched to a condition
   whose signal takes months to appear, and Apple/Google both support it natively.

**3.2 Hardship pricing.** Already in `MARKETING_PLAN.md` §3.3 — I'd push it harder. A large
share of this audience can't work. A "pay what you can" or regional/hardship tier converts
people who would otherwise convert at *zero*, and in these communities the goodwill is a
marketing asset in its own right. Offer codes make it operable today with no code changes.

**3.3 A higher tier is plausible.** If §1.2 (clinical pack) and §1.3 (experiments) get built,
there is a credible **$99/yr "Clinical"** tier: PDF pack, disability documentation, N-of-1
experiments, multi-profile. Some fraction of users have a genuinely high-stakes need and
will pay 2× without hesitation. A higher anchor also makes $49.99 look cheap.

**3.4 Soften the HRV limit into a conversion event.** Right now the second capture is a flat
wall. Better: grant the second capture **once**, free, with a note — "Extra capture, on us.
Pro gets unlimited." They experience the value *before* the ask. A wall the first time
teaches them not to try again; a gift teaches them what they're missing.

**3.5 Annual-first copy.** You already default to yearly. Say *why*: "Recovery is measured in
months. Track a year." That's a reason, not a discount.

---

# Part 4 — Instrumentation (the uncomfortable bit)

There's no analytics, by design. But you're currently flying blind on the funnel, and every
recommendation above is a hypothesis you can't currently test.

Minimum viable, without compromising the privacy position:

1. **Local-only attribution.** In the existing plaintext `autonomic.flags` MMKV, record which
   surface raised the paywall most recently before a purchase. Then surface it in the existing
   support-diagnostics dump (`collectApp.ts`) — which already carries no health data. You'll
   learn which surfaces convert from the users who write in.
2. **Store-side conversion by source.** Apple **Custom Product Pages** and Google's equivalent
   give per-source conversion data with zero SDK. Make one per major channel.
3. **App Store Connect / Play Console** already give you trial→paid, churn, and refund rates
   for free. Read them weekly (it's already in `MARKETING_PLAN.md` §12).
4. If you ever accept a single aggregate ping, make it **one** — a counted, non-identifying
   funnel step, opt-in, documented in the privacy policy. But the first three get you most of
   the way, and staying at zero is a defensible brand choice.

---

# Part 5 — If you only do five things

Ranked by (impact × confidence) ÷ effort:

0. **Give the POTS stand test a camera source** (§0). Not on the original list because it isn't
   a new feature — it's a headline Pro benefit that phone-only subscribers currently cannot use
   at all. Fix before adding anything.
1. **§2.1 — Replace locks with faded real data.** Small change, biggest single lever, and it
   lands exactly at the day-15 moment you asked about. Do this first.
2. **§2.7 + §2.8 — Personalize the upsell card, add the eligibility engine.** Makes the app
   *quieter* and converts better. Reuses architecture you already have in `src/lib/review/`.
3. **§1.3 J — Trigger & helper discovery.** The most compelling on-device feature available,
   and it strengthens with data (retention flywheel). Pair it with §2.2 "show the headline,
   hide the specifics" and it sells itself.
4. **§1.2 F — The PDF clinical pack.** Your marketing plan already names the doctor report as
   the killer wedge; right now it's a clipboard prompt. Making it a real document is the
   difference between a feature and a reason to subscribe.
5. **§2.5 — The earned second trial at day 20.** Cheapest experiment on this list, directly
   targets the exact cohort you asked about, and it's a gift rather than a nag.

Then, as bigger bets: **§1.1 B (pacing budget)** — the Visible loop without the hardware —
and **§1.5 R (HRV biofeedback)** — the one feature that turns Pro from analysis into therapy.

---

# Part 6 — Watch-outs

- **Medical claims.** "Crash forecast," "risk," and anything resembling diagnosis attracts App
  Store §1.4.1 scrutiny and FTC health-claim exposure. Frame everything as *patterns in your
  own data*, never as prediction or diagnosis. "Your recent pattern resembles the days before
  past crashes" ✅ / "You will crash tomorrow" ❌. The POTS criterion in the report should be
  presented as *the published threshold*, with the number next to it — never as "you have POTS."
- **The privacy position is the moat.** Weather (§1.3 N) and in-app AI (§1.6 Z) both put holes
  in "nothing leaves your phone." Both may still be worth it — but the copy has to change
  honestly and the opt-in has to be explicit, or you lose the one thing no competitor can copy.
- **Don't gate the habit.** Every gate that reduces daily opens reduces conversion. Gate depth
  and documents; never the loop.
- **Feature-list paywalls don't convert; moments do.** Almost every idea in Part 2 is a way of
  replacing a list with a moment about the user's own body.
