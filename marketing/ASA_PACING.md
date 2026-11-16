# Paid search for the pacing budget (1.28)

Companion docs: `MARKETING_PLAN.md` (§5 and the channel table set the budget and
the kill rules this inherits) · `COMPETITOR_INTEL.md` (§2 Visible) ·
`../mobile/store-listing.md` (the organic keyword field, already rewritten for
1.28).

**What this doc is:** the Apple Search Ads ad groups to add now that the pacing
budget has shipped, plus the negatives that stop the money leaking, plus the one
lifecycle gap the release opened. It is a paste-into-the-console list, not
strategy.

---

## 0. Why this is a new campaign and not a few more keywords

Everything ASA runs today is aimed at the **measurement** pool: POTS,
dysautonomia, orthostatic, HRV, and the competitor brands. Pacing is a different
pool with a different vocabulary. The person who types `pem tracker` is not
looking for a heart rate app and will never type `hrv journal`; they have been
told by a support group to pace, and they are looking for a way to do it.

That pool is **Visible's home turf** (`COMPETITOR_INTEL.md` §2: long COVID /
ME-CFS first, 250,000+ users, VC-funded, outcome-stat ads). Two consequences run
through every list below:

1. **Do not lead with the category word.** `pacing app` is the term Visible has
   the most reason to defend and the most money to defend it with. It goes in,
   but at a capped bid and with no expectation.
2. **Buy the symptom vocabulary instead.** `post exertional malaise`,
   `energy envelope`, `crash tracker` are what patients actually type, carry
   near-perfect intent, and are cheap precisely because they look like low
   volume on a keyword tool. This is the same shape as the organic POTS terms
   the plan says are "free because nobody noticed".

---

## 1. Ad group: PACING & PEM (new)

Exact match. This is the release's own ad group.

```
pacing app
activity pacing
pacing chronic illness
pem
pem tracker
post exertional malaise
post exertional malaise tracker
energy envelope
energy envelope tracker
pacing for long covid
pacing for me cfs
crash tracker
symptom crash tracker
heart rate pacing
anaerobic threshold pacing
energy tracker chronic illness
```

**Starting bids:** the plan's niche band, $0.50–2.00 CPT. Cap `pacing app` and
`activity pacing` at the bottom of it — if they clear at $2 they are being
defended and are not worth winning. The long-tail four (`post exertional
malaise`, `energy envelope`, `crash tracker`, `pacing chronic illness`) are the
ones to fund properly; they are the group's whole thesis.

## 2. Ad group: ME/CFS & LONG COVID (new)

Exact match. Adjacent demand the pacing feature now gives us a real answer for.
Before 1.28 these would have been a bait-and-switch; they aren't now.

```
me cfs
me cfs app
me cfs tracker
chronic fatigue app
chronic fatigue tracker
chronic fatigue syndrome app
long covid app
long covid tracker
long covid symptom tracker
fatigue tracker
spoonie app
spoon theory app
```

`spoonie` / `spoon theory` are the community's own words and are almost never
bid on. They convert or they don't, cheaply — keep them separate enough to read.

## 3. Ad group: COMPETITOR & ORPHAN (extend the existing one)

The plan already lists `welltory`, `visible app`, `bearable`. Pacing earns four
more, exact match only:

```
visible pacing
visible armband
visible long covid
stasis app
```

Plus the orphan harvest already in the plan (`cardiogram`, `elite hrv`) — those
users are actively looking for a home and pacing is now a reason to be it.

**Standing rule from the plan, unchanged: never name a competitor in ad
creative.** Bidding the brand is fine; a comparison page is the landing surface.

## 3a. Five more ad groups, ranked by what they're likely to return

Pacing is the release, but it isn't the only pool the app can honestly answer
and isn't the only one sitting undefended. These are in descending order of
expected value, not of volume — the top two are the ones to open next.

### A. Orthostatic testing at home — the best pool in this document

```
nasa lean test
poor mans tilt table test
tilt table test at home
stand test pots
standing test heart rate
orthostatic vitals
orthostatic intolerance
orthostatic hypotension app
heart rate when standing up
```

`nasa lean test` and `poor mans tilt table test` are what the POTS and ME
communities actually call the thing, they are typed by someone mid-diagnosis
with nowhere to record the result, and the app does exactly this on a watch or a
strap. Nobody is bidding on them because they don't look like app queries. This
is the closest thing here to free money.

### B. Device owners — Welltory's proven pool

```
polar h10 app
polar h10 hrv
polar h10 hrv app
garmin hrv app
hrv app for garmin
apple watch hrv app
hrv app for apple watch
chest strap hrv app
hrv monitor app
```

`COMPETITOR_INTEL.md` §1 records Welltory running programmatic device landing
pages (`/devices/garmin-hrv-app`, `/devices/apple-watch-hrv-app`). They built
those because the pool converts: somebody who owns an H10 has already bought the
hardware and is looking for software. Autonomic supports all three sources and
1.26 widened Garmin substantially, so the claim is true.

### C. No wearable required — the camera

```
hrv app without watch
measure hrv with phone
hrv camera app
heart rate variability app iphone
hrv app no chest strap
```

The counter-position to Visible, whose own users call the free tier "pretty
useless without the armband" (`COMPETITOR_INTEL.md` §2) — and to every HRV app
that assumes a wearable. Cheap, and the landing story is one screenshot.

### D. Nervous system & vagus — high volume, soft intent

```
vagus nerve app
vagal tone
vagal tone app
nervous system regulation app
dysregulated nervous system
nervous system reset
polyvagal app
hrv biofeedback
resonance breathing
coherent breathing
```

Bigger pool, vaguer intent, more wellness tourists — so cap bids low and judge
it purely on cost-per-trial. `hrv biofeedback` and `resonance breathing` are the
two with real intent, and the 4/6 paced session answers them literally.

### E. Comorbid & adjacent conditions

```
mcas
mcas tracker
eds app
ehlers danlos app
hypermobility tracker
chronic illness tracker
chronic illness symptom tracker
symptom tracker for doctor
```

`mcas` and `eds` are already nominated in the plan's organic keyword field and
the comorbidity overlap with POTS is large. `symptom tracker for doctor` is
worth its own line because the doctor report is a Pro feature and that query is
somebody with an appointment booked.

### F. Brand defence — do this regardless

```
autonomic
autonomic app
autonomic journal
autonomic tracker
```

`WEEK_1.md` §1.4 already makes this case: near-zero cost because nobody else
bids your name, and it pins the #1 slot above the unrelated apps that currently
outrank you on your own word while organic catches up.

## 4. Discovery

Keep one Discovery / search-match campaign at ~10% of spend, as the plan says.
Its job is to surface the phrasings this list got wrong — patients name things in
ways no keyword tool predicts. Harvest anything that converts into the exact
groups above weekly, then negative it out of Discovery so the two campaigns stop
bidding against each other.

---

## 5. Negatives — the part that actually saves money

**`pacing` is three unrelated words in English and two of them are expensive.**
Add these as campaign-level negatives before spending a cent:

```
pacer
pacer app
pacer pedometer
pacemaker
cardiac pacing
pacing wire
step counter
pedometer
running pace
marathon pace
pace calculator
race pace
running pace tracker
metronome
music pacing
```

The three that will do real damage if left out:

- **`pacer`** — a very large free pedometer app. Broad or search match on
  anything containing "pac" drags in its traffic, and those users bounce.
- **`pacemaker`** — high volume, cardiac device intent, completely wrong, and it
  is the one where an install would be actively bad for us.
- **running pace** — the fitness meaning of the word, and it is the meaning with
  the advertising budget behind it.

Also negative `free`, `hack`, `mod` as a matter of course.

**Add the `pacer` block as EXACT negatives, not broad, and scope them to the
pacing campaign.** A broad negative on `pacer` also blocks `breathing pacer`,
and a broad `pedometer` or `step counter` collides with nothing today but will
the moment the step-based pool in §3a is worth testing. Exact negatives kill the
pedometer traffic without taking the adjacent terms with them.

---

## 6. Custom product page — the highest-leverage item here

The 1.28 screenshot plan (`../mobile/store-listing.md`) produces three new phone
shots: the Outlook card with the pacing strip in its gold state, the pacing
sheet with "Where Budget Went", and the two widgets on a home screen.

**Those three are a custom product page, and it should be attached to ad groups
1 and 2.** A user who searched `post exertional malaise` and lands on a hero of a
five-minute breathing session with a chest strap has to do the translation
themselves; most won't. The plan's own note holds — condition-matched
screenshots lift tap-through materially — and CPPs are free.

Keyword-linked **organic** CPPs are worth building from the same three shots for
`pacing`, `pem` and `fatigue`, since those are the words the 1.28 keyword field
just bought.

---

## 7. What changes in the organic fields

The keyword field is already rewritten for 1.28 (`chest,strap` out,
`pem,fatigue` in). Two open items, in order of value:

1. **The iOS subtitle.** `WEEK_1.md` §1.2 has it as empty and queued for "the
   next point release"; 1.28 IS a version submission, which is the only moment
   it can change. It is the second-highest-weighted indexed field in the store
   and no ad keyword in this document is worth as much as filling it. If it is
   still empty, this is the submission — and pacing now has a claim on the
   words: `Pacing, HRV & POTS tracker` indexes `pacing` at subtitle weight and
   frees `pacing` back out of the 100-char field.
2. **The next swap, when space frees.** The listing's standing note nominates
   `cfs`, `vagus`, `energy`. With pacing shipped, **`cfs` is the one to buy**,
   and `rmssd` is the candidate to drop: RMSSD is typed by people already sold
   on HRV, where CFS is typed by the audience this release was built for.
   That is a judgement call on a live listing — worth testing, not worth
   asserting.

---

## 8. Measurement, and what the app cannot tell you

Read the ad groups to **trial and paid**, never to installs (plan §4.3).

Two blind spots to know about before reading any of it:

- **The app's own pings cannot see a returning subscriber.** `/ping/sub` fires
  once per install *ever*, so a lapsed subscriber who resubscribes moves nothing.
  App Store Connect and the Play Console are the only source for that, and the
  `/master` churn ledger is hand-typed (`MASTER_DASHBOARD.md`).
- **A cancellation is not churn until the paid period ends.** Auto-renew off
  leaves the subscriber fully entitled until their renewal date, and reversing it
  inside that window is a reactivation with no new money attached. The dashboard
  books churn on the cancellation date, which will overstate it for exactly as
  long as it takes someone to change their mind. When one reverses, clear the
  `cancelled` date on that row rather than adding a second purchase — a new row
  double-counts the payer. **Proceeds are what tell the two apart**: a reversed
  cancel bills at the original renewal date, a resubscribe after expiry bills
  immediately. A reactivation with money attached is the second kind, and it is
  the better one — somebody lost access, felt it, and paid again.

**The date to compare is the EXPIRY, not the cancellation.** They can be a month
apart, and everything below keys off the expiry.

What the app *can* tell you is which offer did it: an `oac` ping with the annual
letter on the day of a reactivation means the half-price annual card closed it,
at the promo price, renewing at the promo price.

---

## 9. The win-back gap this release exposes

Worth knowing before spending on re-acquisition: **a lapsed subscriber gets one
half-price annual card, ever, and only if they have an unspent milestone.**

`src/lib/upsell/annual.ts` raises the offer at 30 / 90 / 180 / 365 calendar days
since **install**, and the card returns early unless the tier is actually free —
so milestones are not consumed while somebody is paying. The practical effect is
good by accident: a subscriber who lapses finds the highest unspent milestone due
on their next launch and meets a half-price year straight away.

The gap is what happens after that. `startOffer` spends every milestone at or
below the one awarded, the milestones stop at 365, and the clock is days since
install rather than days since lapse. So:

- A subscriber who lapses a second time gets nothing.
- A user who was free through their first year before ever subscribing has spent
  all four and gets nothing on lapsing.
- There is no offer anywhere that is triggered by *lapsing*.

That is not a bug — nothing promises one — but it means the cheapest win-back
surface the app has is already spent for a meaningful share of the people it
would work on, and paid re-acquisition is being asked to do a job a card could
do for free. If reactivations turn out to be a repeating pattern rather than a
coincidence, a lapse-triggered offer is a new module beside `annual.ts` and
`founder.ts` with its own trigger, per the rule in `CLAUDE.md` — not a fifth
milestone bolted onto this one.

---

## 10. 1.28 manufactures a seven-day cancel-to-return loop. Watch for it.

`src/lib/pacingTrial.ts` stamps its seven-day window at **the first launch where
the tier is actually free** — which for a lapsing subscriber is the day they
lapse. So from 1.28 onward the shape of a churned user is:

> expire → seven days of the pacing budget, free → it locks → decide.

**A reactivation exactly seven days after an expiry is that window closing**, not
a coincidence, and it is the one gap length with a mechanical cause. Any other
gap is a person.

Two consequences for reading the numbers over the next fortnight:

1. **The first wave arrives in a clump.** Free installs get the window on the
   launch that brings them the build, so everybody who updates in the same few
   days expires in the same few days. Expect a step up in pacing paywall hits
   about a week after the release goes live, and do not read it as the feature
   failing — it is the trial cohort landing together. It decays into a trickle
   as updates spread out.
2. **The counter that shows it is `pay` letter `B`.** The pacing paywall surface
   sends `B`, capped once per install per Eastern day, so a spike in `pay/B`
   seven days after release is the window closing en masse. **This only works if
   the ping lambda is deployed** — `B` is a new letter and a decoder that
   predates it drops the ping outright rather than degrading, which looks
   identical to nobody hitting the wall. That item is still unticked in
   `../mobile/store-listing.md`.

Worth stating plainly because it cuts the other way too: a reactivation that
happens *before* 1.28 is live on a store cannot be this. Check the release date
against the expiry before crediting the feature with a win it wasn't there for.
