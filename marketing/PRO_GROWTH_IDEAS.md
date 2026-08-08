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

### E. Passive orthostatic detection (Apple Watch)

Watch HR spikes on standing are detectable passively. "6 orthostatic events detected today,
avg +34 bpm." Novel, watch-only, and it feeds the doctor report. Uses the HR pipeline you
already have.

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

Enormous for POTS — symptoms track the luteal phase for a large share of patients. Cycle ×
symptom × HRV heat map, plus "your bad days cluster days 24–28." 100% on-device, and almost
nobody in the dysautonomia space does it properly.

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

Watch/Health Connect users already get the one-year backfill. Turn that into an instant
Pro report on day 1: "Here's what your last year looked like." Converts during the trial,
before they've logged anything themselves. Highest-leverage trial-window feature on this
list.

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

### S. The Ewing autonomic battery

Guided **deep-breathing E/I ratio**, **Valsalva ratio**, and **30:15 ratio** tests alongside
the existing stand test. These are the actual clinical autonomic function tests. Your RR
pipeline can already compute them. Nothing consumer does this, and it feeds §1.2 directly.

### T. Nocturnal autonomic recovery

You already pull sleep stages + overnight HR. Compute **nocturnal HR dip %** (non-dipping is
a real dysautonomia signal nobody surfaces), deep-sleep-vs-next-day-score correlation, and a
nightly recovery score.

### U. Research-grade export

RR intervals as Kubios-compatible `.txt`, CSV/FHIR export, Apple Health write-back. Tiny
audience — but the ones who want it are the ones who post in forums.

---

## 1.6 Structural / packaging features

### V. The pacing-budget widget & watch complication
Keep basic widgets free (they drive retention — gating them would backfire). Make the
**Protocol / energy-envelope** widget Pro, since it depends on a Pro computation. Same for
a watch complication.

### W. Multi-profile / caregiver mode
Parents tracking a teen with POTS are a real, underserved segment. One subscription,
multiple profiles, and a per-profile report. Also justifies a higher-priced "Family" tier.

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

Rewrite it as a **rotating, data-personalized single line**:

> "31 days logged — your month view is ready." →
> "6 crash days this month. See what they had in common." →
> "Your HRV is trending up. See how far." →

Collapse it by default after the first week. Drop the LOCKED badge. One personalized line
outperforms four generic bullets, and it stops feeling like a permanent ad in their journal.

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
