# Store listing — v1.33.0

Copy-paste source for **App Store Connect** and the **Google Play Console**.
Character counts verified against each store's limits.

Console *configuration* (products, offers, price changes) is not here — that is
`STORE_SETUP.md`. This file is the words.

---

## Submission checklist — 1.33.0

The live App Store name and subtitle have been "Autonomic: HRV & POTS Tracker" /
"Pacing for Long COVID & ME/CFS" since the pacing release; this file carried
the older name until 1.33, so the name/subtitle block below is the record, not a
change. What changes with 1.33: the **keyword field** (rebuilt around the
subtitle, see the keyword block) and **What's New**. Native build: the Android
back-button plugin, three-button-navigation fixes and the Halloween assets ride
the binary, so this is a version submission on both stores.

- [ ] **Keywords** → replace with the 1.33 field (99/100).
- [ ] **What's New** → the 1.33 block below, both stores.
- [ ] **Name / Subtitle / Promotional text / Description / Review notes** → unchanged.
- [ ] `FORCE_TIER` null, `FORCE_ANNUAL_OFFER` null, `FORCE_FOUNDER_OFFER` false,
      `PREVIEW_PAYWALL` false in the shipped commit (verified 2026-10-11).

## Submission checklist — 1.28.0 (previous)

What changed since the listings were last written (1.25.1): **the pacing budget**
(1.28), the redesigned Outlook card and free POTS captures (1.27), and wider
Garmin watch support (1.26). None of it is in the live listings, and the pacing
budget is the first feature since Insights that is worth rewriting the top of
the description for, so both descriptions below are rewritten rather than
patched.

**Check what actually shipped before pasting the release notes.** The notes
below cover 1.26 through 1.28 as one release, which is right if the store is
still on 1.25.x. If 1.26 or 1.27 went out, delete the bullets that already
went with them.

**App Store Connect** — needs a version submission, so it rides the 1.28.0 build:

- [ ] **Description** → replace wholesale with the block below (3,905/4,000).
      **The Terms of Use / Privacy Policy lines at the end are not optional and
      never get trimmed for space.** 1.25.1 was rejected (Guideline 3.1.2) by
      Apple's automated metadata check because a wholesale description paste
      dropped them: the app sells auto-renewable subscriptions, so a functional
      EULA link must be in the App Description itself. In-app links on the
      paywall and in Settings do not satisfy the check, and neither does the
      Privacy Policy URL field. Trim a bullet instead.
- [ ] **Keywords** → replace (98/100). `chest,strap` out, `pem,fatigue` in — see
      the note under the keyword block. Keywords only change with a version
      submission, and this is the submission.
- [ ] **What's New** → the 1.28 block below.
- [ ] **Promotional text** (165/170) — rewritten around the budget. Updatable any
      time without review, so it can go up the moment the copy is agreed.
- [ ] **App Information → License Agreement** → unchanged: `mobile/EULA.md` as a
      Custom License Agreement for all countries, `[LEGAL NAME]` /
      `[MAILING ADDRESS]` / `[PHONE]` filled in.
- [ ] **App Review notes** → the block below, updated for the pacing budget (a
      reviewer on a fresh install sees the budget live, because it is inside the
      14-day trial, and the note says so).
- [ ] **Screenshots** → see the plan at the end of this section. Three new
      phone shots and one new watch shot; this is the part with real work in it.

**Google Play** — the listing needs no binary, so it can go up before or after:

- [ ] **Short description** → replace (80/80). Names pacing, keeps ME/CFS,
      carries no price or promotional wording (Play rejected a previous line for
      the word "Free").
- [ ] **Full description** → replace wholesale (3,905/4,000).
- [ ] **Release notes** → the 1.28 Play variant below (497/500).
- [ ] **Feature graphic** → optional, but the current one predates the budget.

**Unchanged, don't touch:** app name, subtitle, prices, privacy labels /
data-safety answers (the app still collects nothing), and the Health Connect
justification at the end of this file. **Steps changed nothing there**: the
pacing budget reads steps through the existing HealthKit / Health Connect
grants, `READ_TYPES` in `src/lib/health/healthConnect.ts` already covered them,
and nothing is written back that was not written back before.

**Two claims in this copy are load-bearing and must stay true in the app** (they
are the same boundary `CLAUDE.md` says five places state, so moving one moves
all of them):

- **The pacing budget is Pro, and has no free window of its own.** It is
  included in the 14-day install trial and locks with everything else when the
  trial ends (`src/store/pacingAccess.ts`). It used to carry a separate free
  week; nothing here may promise one again.
- **Nothing here promises unlimited capture as a Pro benefit.** Capture is free
  on every tier; Pro is what the app makes of the readings.

**Not a listing change, but must be true before the build is live** — see
`STORE_SETUP.md`:

- [ ] **`annual_founder_first_year` is deleted (or inactive) in App Store
      Connect.** While it exists, every new yearly subscriber gets a discounted
      first year for nothing. See `STORE_SETUP.md` Part 7.
- [ ] Part 7's `com.autonomic.journal.yearly.founder` exists and is ACTIVE on
      both stores. It is the product behind BOTH the annual offer card and the
      founding-member card. Part 6's `com.autonomic.journal.yearly.promo` is no
      longer sold by anything but stays ACTIVE for its existing subscribers.
- [ ] Neither store has a free-trial intro offer configured. The app's 14-day
      window is local (`TRIAL_DAYS`, `src/lib/tier.ts`).
- [ ] **The ping lambda is deployed.** The pacing paywall surface sends a new
      letter (`'pacing'` → `B`) and the ping tail carries tier + version; a
      decoder that predates them does not degrade, it drops the ping.
- [ ] `eas.json` has `autoIncrement: true`. Only `version` in `app.json` is
      hand-set (now 1.28.0).

---

On the App Store, promotional text can be updated anytime without review; the
description, keywords, and screenshots only change with a version submission.
On Google Play, the full description, short description and graphics can be
updated anytime (they go through a short content review, no binary needed).

> **Ship order matters.** Push the freemium build to both stores *before*
> retiring the introductory free-trial offers — see `STORE_SETUP.md`. Until the
> offers are ended, the paywall's own CTA still reads "Start N-day free trial"
> (it's driven by `hasTrial()` in `src/store/iap.ts`, which reads the live store
> product), so listing copy and in-app copy stay consistent either way.

---

# App Store (iOS + watchOS)

## Promotional text (165/170 chars)

For long covid, POTS and dysautonomia. Take a 5-minute HRV reading, then let it set your pacing budget for the day, in minutes of effort, fitted to your own history.

## Name (29/30 chars)

Autonomic: HRV & POTS Tracker

## Subtitle (30/30 chars)

Pacing for Long COVID & ME/CFS

Both live since the pacing release. Together they already index autonomic, hrv,
pots, tracker, pacing, long, covid, me and cfs, so none of those may appear in
the keyword field.

## Keywords (99/100 chars)

heart,rate,variability,dysautonomia,orthostatic,tachycardia,watch,rmssd,symptom,fatigue,polar,dizzy

Rebuilt for 1.33 around the subtitle. The field before it
(`orthostatic,pem,fatigue,energy,spoons,crash,heart,rate,variability,tachycardia,symptom,pacing,vagus`)
repeated `pacing` from the subtitle, had dropped `dysautonomia`, `watch` and
`rmssd`, and spent 31 characters on ME/CFS community words (`spoons`, `crash`,
`energy`, `vagus`, `pem`) that are weak or ambiguous as store searches. Search
traffic fell after it went live.

Why each word: `heart,rate` completes "heart rate variability" with `hrv` in
the name and covers every "pots heart rate" search; `dysautonomia`,
`orthostatic`, `tachycardia` are the diagnosis words the converting user types;
`watch` catches Apple Watch searches without the trademark; `rmssd` is the
HRV-literate buyer's word and nobody else bids on it; `symptom` covers
"symptoms" (Apple indexes plurals); `fatigue` and `dizzy` catch the
symptom-first searcher; `polar` buys Polar H10 owners, the highest-intent HRV
buyer. `garmin` was considered and left out while the Garmin path is unreliable.

Standing notes: single words, not phrases (ASC recombines them and spaces waste
chars); any word already in the App Store *name* or *subtitle* is indexed from
there and is wasted here; do **not** add "free", Apple indexes the price
separately. Next in line if space frees up: `strap`, `vagus`, `garmin` (once
the watch path is solid).

## What's New (1.33, both stores — 385/4,000 chars)

NEW: Enter a POTS stand test or episode by hand, with a guided walkthrough. No strap or watch needed.

Choose imperial or metric units in your Profile.

Insights now compares your best weeks with your hardest ones.

Triggers can carry a time and a note.

Easier input fields throughout the app.

Camera reading improvements.

And many smaller changes based on your feedback. Thank you!

Play's 500-character limit fits the same text unchanged.

## What's New (1.28, App Store — 1,165/4,000 chars) — previous

NEW: your daily pacing budget.

Your readings set a budget for today in minutes of effort, fitted to your own history rather than to a textbook number. It counts the whole day, not just what you log: workouts, steps, time on your feet, and the minutes your heart spends above your own exertion line. Legs up and breathwork buy minutes back.

A pace marker on your Outlook card shows where you are in the day, so what is left means something at 9am and at 6pm. It tells you how often its estimate held, week by week, so you can judge it for yourself. And on a day it reads as a downturn it publishes no number at all, because a small budget on a bad day is still an invitation to spend it.

It is on your Journal, in two new home screen widgets, and on your Apple Watch.

Also in this release:
• A redesigned Autonomic Outlook card: your score now shows how it is trending against your own recent days
• POTS stand tests and episode captures are now part of the free plan. Reading the graded result stays part of Pro
• Wider Garmin watch support: the companion app now runs on a much wider range of Garmin watches
• Faster Progress and Insights, and fixes throughout

### Play Store variant (1.28, Android, 497/500 chars)

NEW: your daily pacing budget. Your readings set a budget for today in minutes of effort, fitted to your own history. It counts the whole day: workouts, steps, time on your feet, and minutes above your own exertion line. Legs up and breathwork buy minutes back, and a pace marker shows where you are in the day. On your Journal and in two new home screen widgets.

Also: a redesigned Outlook card, POTS stand tests and episodes free on every plan, wider Garmin watch support, and fixes throughout.

## What's New (1.25, both stores) — previous

A new live reading. Heart rate, SDNN and your beat-to-beat trace update as the reading runs, with signal quality on screen so you know it is working.

You can now minimize a reading. It keeps running while you use the rest of the app, and the breathing pace never loses its place.

The app also watches for the drift that usually comes before a crash: slower heart-rate recovery after activity, a higher resting or overnight heart rate, a bigger standing rise. When two of them move together, the Journal says so.

Also in this release:
• Insights holds on to a finding while the evidence holds, instead of dropping it overnight
• One row per supplement or trigger, with everything it moved behind it
• A new card for what has been tested and moved nothing at all
• Early signals on younger journals, held to a higher bar and labelled as such
• HRV capture is unlimited on the free plan

### Play Store variant (1.25, Android, 498/500 chars)

A new live reading: heart rate, SDNN and your beat-to-beat trace update as it runs, with signal quality on screen.

You can now minimize a reading. It keeps running while you use the rest of the app.

The app also watches for the drift that comes before a crash: slower heart-rate recovery, a higher resting or overnight heart rate, a bigger standing rise. When two move together, the Journal says so.

Insights also keeps a finding while the evidence holds, and adds a card for what moved nothing.

## What's New (1.25.0) — previous

HRV capture is now unlimited on the free plan. The old one-a-day cap is gone, so
you can read your nervous system as often as you like: before and after a walk,
either side of a bad night, or whenever something feels off. Nothing else
changed about what is free.

Autonomic Pro is still there for what the app makes of those readings: your full
history, Insights, POTS testing and AI reports.

## What's New (1.19.1, iOS) — previous

Your HRV numbers just got more honest. Short HRV samples from Apple Health, like
the watch's passing background reading, are no longer averaged in with a real
seated capture, so your trends reflect the readings you actually took. Nothing
is deleted, and past entries are cleaned up automatically.

Also in this release:
• Delete an imported entry and Health will not offer it back again
• Fix your bed and wake times and the hours asleep update with them
• POTS episodes now grade on the biggest heart-rate rise in the whole capture
• More reliable HRV frequency bands on 5 minute captures
• Health imports no longer come up empty over a permission we never asked for
• The "new health data" pill can no longer get stuck checking
• Progress readouts show their units, with the date alongside ("56 bpm on 7/27")
• Blood pressure tiles report the range average instead of repeating the latest reading
• Medication doses accept units again ("400mg", "1 scoop")
• Fixes for keyboards covering sheets and Progress jumping to the wrong section

### Play Store variant (1.19.1, Android, 493/500 chars)

Your HRV numbers just got more honest. Short HRV samples from Health Connect are
no longer averaged in with a real seated capture, so your trends reflect the
readings you took.

Also:
• Delete an imported entry and it stays gone
• Fix bed and wake times and hours asleep update too
• POTS episodes grade on the biggest heart-rate rise
• Health imports no longer come up empty over a missing permission
• Medication doses accept units again
• Keyboard and Progress scrolling fixes

## Description (3,905/4,000 chars)

See your nervous system actually recover.

Autonomic turns a chest strap, your Apple Watch, or your finger over the camera into a full HRV lab, grades every reading against published thresholds, and turns what it learns into a daily pacing budget fitted to you.

Built for the long haul: long covid and post viral recovery, POTS and dysautonomia, ME/CFS, and anyone rebuilding their nervous system.

Free to use, no account, no ads, no tracking. 14 days of full access on install, then the core stays free forever.


NEW: YOUR DAILY PACING BUDGET

• A budget for today in minutes of effort, fitted to your own readings and history, never a textbook number
• It counts the whole day, not just what you log: workouts, steps, time on your feet, and minutes above your own exertion line
• Legs up and breathwork buy minutes back
• A pace marker shows where you are in the day, so what is left means something at 9am and at 6pm
• It goes quiet when it should: on a day that reads as a downturn, no number is published at all
• It tells you how often its estimate held, week by week, and it is on your widgets and your Apple Watch too


LIVE 5-MINUTE HRV, DONE RIGHT

• Capture beat-to-beat RR intervals from a chest strap, Apple Watch, Garmin, or your finger on the camera
• A guided 5:00 session with paced breathing (4/6 resonance), live heart rate, SDNN and your beat-to-beat trace as it runs
• Every metric computed on-device: SDNN, RMSSD, pNN50, PNS & SNS index, Baevsky stress index, LF/HF, coherence and more
• Artifacts are flagged and corrected, and a noisy reading refuses to fake a score


EVERY NUMBER GRADED, NO BLACK BOX

• Every number scored great / good / ok / warning / crash against real thresholds
• One daily Autonomic Score that rolls up HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook: what your body is ready for, from a full workout to a rest day
• An early heads-up when your own markers drift: slower heart-rate recovery, a higher resting or overnight heart rate, a bigger standing rise


POTS TESTING ON YOUR WRIST: THE APPLE WATCH APP

• A guided lie-and-stand test: rest, stand when it taps you, and watch your live delta against baseline
• One tap from the watch face captures a POTS Episode: baseline, the climb, and 60 seconds of recovery


TRACK EVERYTHING, KEEP YOUR STREAK

• Water, meals and food triggers, meds and supplements, symptoms, activities, sleep, blood pressure, stand tests and digestion
• Define your own "clean day" (hydration, sleep, meds, triggers) and build a streak, with your longest run and a 30 day consistency rate
• Tap a night for its full sleep report: stages, overnight heart rate and breathing, and how it compares with recent nights


FIND WHAT HELPS OR HURTS

• Insights: an on-device read of your own log that finds what is linked to what, and how sure it is


YOUR DATA NEVER LEAVES YOUR PHONE

• 100% offline-first: no account, no cloud, no ads. You own your data and can export it anytime
• Reads HRV, resting HR, sleep, workouts and blood pressure from Apple Health, and writes back only what you ask


WHAT'S FREE, WHAT'S PRO

Free forever: unlimited live HRV captures, POTS stand tests and episodes, journaling, manual readings, your daily score and outlook, the Apple Watch HR monitor, 14 days of charts and full export.

Autonomic Pro adds the pacing budget, week / month / year progress, full historical analysis, Insights, POTS results and AI doctor reports. It is $7.99/month or $49.99/year, billed to your Apple ID and renewing automatically until cancelled. Cancel anytime in your App Store settings.

Terms of Use: https://autonomic.care/terms-of-service/
Privacy Policy: https://autonomic.care/privacy-policy/


IMPORTANT: Autonomic is a personal journal and education tool, not a medical device. It does not diagnose or treat any disease. Always discuss protocol or medication changes with your doctor.

## App Review notes (freemium submission)

> The app is fully usable without a purchase. On first launch it grants a 14-day
> local full-access window (no account, no store call), after which the core
> (journaling, daily score, manual readings, watch HR monitor, unlimited live
> HRV capture, POTS stand tests and episode captures, 14 days of charts, export)
> remains free indefinitely.
>
> Autonomic Pro (com.autonomic.journal.monthly / .yearly, one subscription
> group) unlocks the full progress history, the Insights tab, the graded POTS
> result, the AI reports and the daily pacing budget. HRV capture itself is
> unlimited on the free tier, as are the Apple Watch and chest-strap POTS
> captures — the graded RESULT is what Pro opens. To reach the paywall: Insights
> tab, or Analysis tab → Week/Month/Year. "Restore purchase" is on the paywall
> card.
>
> New in this version, and worth knowing for review: the **pacing budget** on the
> Journal's Outlook card. It is a Pro feature, included in the 14-day local
> full-access window, so a fresh install sees it working rather than locked. It
> estimates how much activity the day can absorb, in
> minutes of effort, from the user's own logged activity, steps and heart rate,
> and it is presented as a personal journal estimate, not medical advice or an
> activity prescription.
>
> No demo account is needed. HRV capture works without hardware via the camera
> (finger over the rear lens); a chest strap, Apple Watch or Garmin watch is
> optional.

## Screenshot plan

The scenes that produce these live on the `screenshots` branch
(`mobile/app/screenshots/`, dev only): journal, breathing (+ a Play cut with no
Apple Watch), measure, insights, sleep, plan, trust, payoff, understand, live.
**There is no pacing scene yet** — that is the one piece of new work here.
Shoot the phone shots on an iPhone 17 Pro Max simulator, which captures at
1320 × 2868 (the required 6.9" size).

**Three new phone shots, and they carry this release:**

1. **The Outlook card with the pacing strip, mid-afternoon.** Shoot the AHEAD
   (gold) state, not green and not over: gold is the only one where the pace
   marker is doing visible work, and the fill sitting past the mark is the whole
   idea in one picture. Caption: "Your day, in minutes of effort." Never shoot
   the red/over state as a hero — the first thing a stranger sees should not be
   the app telling somebody off.
2. **The pacing sheet.** Budget bar with the marker, "1h 41m spent of 2h 10m",
   the three tiles, and "Where Budget Went" below with three or four real rows
   (a workout, steps, time on your feet). Caption: "It counts the whole day,
   not just what you log."
3. **The widgets.** The small Pacing and the medium PacingDetail on a home
   screen, over the brand background. Caption: "On your home screen." This is
   also the shot that says the feature is not something you have to open the app
   for.

Then the existing carousel, reordered so the new work is above the fold (the
first three tiles are what show in search results):

4. Live HRV session (current hero — it stays, it is what the app IS)
5. Autonomic Score / Outlook
6. Insights
7. Sleep report
8. Watch panel: watch mockups, caption "POTS testing on your wrist"
9. Privacy

**Apple Watch screenshots are REQUIRED** now that the bundle contains a watchOS
app. Capture on the largest watch simulator (Ultra 49mm or Series 10 46mm,
Cmd+S saves a correctly sized PNG); the largest size covers the smaller slots.

Watch carousel (in order — the pacing view is new and goes FIRST, because it is
the only wrist screen you look at without having decided to test something):

1. **Pacing on the wrist** — the bar with its marker and the Spent / Budget
   tiles. Shoot it in the same gold state as the phone hero so the two read as
   one feature.
2. Stand test, standing phase — big live delta (stage ~+34, orange/red) with countdown
3. POTS Episode picker (Stairs / Sit to stand / Lay to stand)
4. Episode 60s recovery screen with live delta
5. HR Monitor — big number + 2-min average + delta
6. Home screen with the three modes

**Play phone shots** are the same list minus the Apple Watch panel, with the
Play cut of the breathing scene (no watch in frame). The feature graphic
(1024×500) predates the budget; if it is being redone, the pacing bar is the
one graphic element in this app that reads at that size.

**Audit anything still live** for captions reading "7-day free trial" (it is 14
days now), a "1 / day" capture row (the cap is gone), or a locked POTS capture
(captures are free on every tier since 1.27).

---

# Google Play (Android)

Play has different fields and limits from ASC. Android has no Apple Watch, so
every watch line is cut and Apple Health becomes Health Connect. Play's full
description supports a *little* markdown-ish formatting but plain text with
blank-line breaks renders most reliably.

## App name (29/30 chars)

Autonomic Journal: HRV & POTS

## Short description (80/80 chars)

HRV, POTS and pacing journal for long covid, ME/CFS and dysautonomia. On-device.

Play's metadata policy bars promotional or price wording from the listing
fields — the previous version was rejected for the word "Free" — and the word is
not needed anyway: Play labels the app Free on the install button and the
subscription price is stated in the full description, which is where Play wants
it. This line trades "symptom journal" for "pacing" and "ME/CFS", the two terms
this release is worth being found for.

## Full description (3,905/4,000 chars)

See your nervous system actually recover.

Autonomic turns a Bluetooth heart rate strap, or just your finger over your phone's camera, into a full HRV lab, grades every reading against published thresholds, and turns what it learns into a daily pacing budget fitted to you.

Built for the long haul: long covid and post viral recovery, POTS and dysautonomia, ME/CFS, and anyone rebuilding their nervous system.

Free to use, no account, no ads, no tracking. 14 days of full access on install, then the core stays free forever.


NEW: YOUR DAILY PACING BUDGET

• A budget for today in minutes of effort, fitted to your own readings and history, never a textbook number
• It counts the whole day, not just what you log: workouts, steps, time on your feet, and minutes above your own exertion line
• Legs up and breathwork buy minutes back
• A pace marker shows where you are in the day, so what is left means something at 9am and at 6pm
• It goes quiet when it should: on a day that reads as a downturn, no number is published at all
• It tells you how often its estimate held, week by week, and it is on your home screen widgets too


LIVE 5-MINUTE HRV, DONE RIGHT

• Capture beat-to-beat RR intervals from a Bluetooth chest strap, your Garmin watch, or your phone's camera using your finger
• A guided 5:00 session with paced breathing (4/6 resonance), live heart rate, SDNN and your beat-to-beat trace as it runs
• Every metric computed on-device: SDNN, RMSSD, pNN50, PNS & SNS index, Baevsky stress index, LF/HF, coherence and more
• Artifacts are flagged and corrected, and a noisy reading refuses to fake a score


EVERY NUMBER GRADED, NO BLACK BOX

• Every number scored great / good / ok / warning / crash against real thresholds
• One daily Autonomic Score that rolls up HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook: what your body is ready for, from a full workout to a rest day
• An early heads-up when your own markers drift: slower heart-rate recovery, a higher resting or overnight heart rate, a bigger standing rise


POTS AND ORTHOSTATIC TESTING

• A guided lie-and-stand test with a chest strap: rest, stand when it tells you, and watch your live delta against baseline
• Capture a POTS Episode the moment one starts: baseline, the climb, and 60 seconds of recovery


TRACK EVERYTHING, KEEP YOUR STREAK

• Water, meals and food triggers, meds and supplements, symptoms, activities, sleep, blood pressure, stand tests and digestion
• Define your own "clean day" (hydration, sleep, meds, triggers) and build a streak, with your longest run and a 30 day consistency rate
• Tap a night for its full sleep report: stages, overnight heart rate and breathing, and how it compares with recent nights
• Milestones, so recovery actually adds up


FIND WHAT HELPS OR HURTS

• Insights: an on-device read of your own log that finds what is linked to what, and how sure it is


YOUR DATA NEVER LEAVES YOUR PHONE

• 100% offline-first: no account, no cloud, no ads. You own your data and can export it anytime
• Reads HRV, resting HR, sleep, workouts and blood pressure from Health Connect, and writes back only what you ask


WHAT'S FREE, WHAT'S PRO

Free forever: unlimited live HRV captures, POTS stand tests and episodes from a chest strap, journaling, manual readings, your daily Autonomic Score and outlook, 14 days of progress charts, and backup and export.

Autonomic Pro adds the pacing budget, week / month / year progress, full historical analysis, Insights, POTS results and AI doctor reports. It is $7.99 per month or $49.99 per year, billed through Google Play. Subscriptions renew automatically until cancelled; manage or cancel anytime in Google Play > Subscriptions.

IMPORTANT: Autonomic is a personal journal and education tool, not a medical device. It does not diagnose or treat any disease. Always discuss protocol or medication changes with your doctor.

## Play graphics checklist

| Asset | Spec | Required |
| --- | --- | --- |
| App icon | 512×512 PNG, 32-bit, no alpha | Yes |
| Feature graphic | 1024×500 PNG/JPG, no alpha | Yes |
| Phone screenshots | 2–8, min 320px, max 3840px, 16:9 or 9:16 | Yes (min 2) |
| 7" tablet | 1–8 | Only if you declare tablet support |
| 10" tablet | 1–8 | Only if you declare tablet support |

The feature graphic has no iOS equivalent — it must be made fresh. Reuse the
brand background and the wordmark; no screenshot content, Play crops it hard.

## Play Data safety answers (mirrors the iOS privacy labels)

- **Does your app collect or share any user data?** → **No.**
- Data is encrypted in transit: N/A (nothing leaves the device).
- Users can request data deletion: N/A (no account; Settings → Erase journal).
- Health data is processed on-device only and never transmitted.

If Play flags the Health Connect permissions, the justification is: HRV, heart
rate, resting heart rate, respiratory rate, blood pressure, weight, sleep
sessions, exercise sessions and distance are **read** to display and grade in
the user's own on-device journal (heart rate and respiratory rate supply the
overnight and workout traces; exercise and distance import a workout with the
distance it covered). HRV, heart rate, resting heart rate and blood pressure are
**written back** when the user explicitly saves a reading; everything else is
read-only. No transmission, no ads, no analytics, no third-party sharing.

(Read/write split is `READ_TYPES` / `WRITE_TYPES` in
`src/lib/health/healthConnect.ts` — keep this paragraph in sync with them, since
requesting a write permission you don't justify is a Play review rejection.)

---

# United Kingdom — English (U.K.) / en-GB

A second localization on both stores, aimed at how UK users search. People in the
UK already find the app through the en-US fallback, and **adding an en-GB
localization likely replaces that fallback in the UK storefront rather than
adding to it**, which is why the core terms (`hrv`, `pots`, `long covid`,
`pacing`) are all still here. Check App Store Connect → App Analytics (source
type by territory) and Play Console's search terms for the UK before and after.

What is different from en-US, and why:

- **ME/CFS leads.** UK patients mostly say "ME", and the 2021 NICE guideline
  made **pacing / energy management** standard NHS language, so both are in the
  name, subtitle or keywords.
- **"PoTS"**, as PoTS UK and the NHS write it (search is case-insensitive, this
  is for the reader). UK spelling: artefacts, post-viral.
- **Prices in £**: fill `£X.XX` from the UK price shown in App Store Connect →
  Subscriptions → Pricing (and Play's GBP price). Never convert by hand; the
  store's own figure includes VAT.
- "your doctor" → "your GP or specialist".
- **Every release now needs en-GB What's New too**; App Store Connect asks for
  it per localization. Reuse the en-US text, respelled.
- Screenshots fall back to the en-US set if none are uploaded for en-GB.
  UK-specific shots would show hPa rather than inHg, once the app does.

## App Store (en-GB)

### Name (29/30)

Autonomic: HRV, PoTS & Pacing

Trades "Journal" (low search value) for "Pacing". The conservative alternative
is the en-US name unchanged.

### Subtitle (27/30)

ME/CFS & long covid tracker

### Keywords (97/100)

dysautonomia,energy,management,fatigue,pem,heart,rate,variability,orthostatic,rmssd,watch,symptom

Nothing already in the name or subtitle (autonomic, hrv, pots, pacing, me, cfs,
long, covid, tracker) is repeated.

### Promotional text (159/170)

For long covid, ME/CFS and PoTS. Take a 5-minute HRV reading, then let it set your pacing budget for the day, in minutes of effort, fitted to your own history.

### Description (3,925/4,000)

The Terms of Use / Privacy Policy lines are required here too (Guideline 3.1.2).

See your nervous system actually recover.

Autonomic turns a chest strap, your Apple Watch, or your finger over the camera into a full HRV lab, grades every reading against published thresholds, and turns what it learns into a daily pacing budget fitted to you.

Built for the long haul: ME/CFS, long covid and post-viral recovery, PoTS and dysautonomia, and anyone rebuilding their nervous system.

Free to use, no account, no ads, no tracking. 14 days of full access on install, then the core stays free forever.


PACING AND ENERGY MANAGEMENT, IN MINUTES

• A budget for today in minutes of effort, fitted to your own readings and history, never a textbook number
• It counts the whole day, not just what you log: workouts, steps, time on your feet, and minutes above your own exertion line
• Legs up and breathwork buy minutes back
• A pace marker shows where you are in the day, so what is left means something at 9am and at 6pm
• It goes quiet when it should: on a day that reads as a downturn, no number is published at all
• It tells you how often its estimate held, week by week, and it is on your widgets and your Apple Watch too


LIVE 5-MINUTE HRV, DONE RIGHT

• Capture beat-to-beat RR intervals from a chest strap, Apple Watch, Garmin, or your finger on the camera
• A guided 5:00 session with paced breathing (4/6 resonance), live heart rate, SDNN and your beat-to-beat trace as it runs
• Every metric computed on-device: SDNN, RMSSD, pNN50, PNS & SNS index, Baevsky stress index, LF/HF, coherence and more
• Artefacts are flagged and corrected, and a noisy reading refuses to fake a score


EVERY NUMBER GRADED, NO BLACK BOX

• Every number scored great / good / ok / warning / crash against real thresholds
• One daily Autonomic Score that rolls up HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook: what your body is ready for, from a full workout to a rest day
• An early heads-up when your own markers drift: slower heart-rate recovery, a higher resting or overnight heart rate, a bigger standing rise


PoTS TESTING ON YOUR WRIST: THE APPLE WATCH APP

• A guided lie-and-stand test: rest, stand when it taps you, and watch your live delta against baseline
• One tap from the watch face captures a PoTS Episode: baseline, the climb, and 60 seconds of recovery


TRACK EVERYTHING, KEEP YOUR STREAK

• Water, meals and food triggers, meds and supplements, symptoms, activities, sleep, blood pressure, stand tests and digestion
• Define your own "clean day" (hydration, sleep, meds, triggers) and build a streak, with your longest run and a 30 day consistency rate
• Tap a night for its full sleep report: stages, overnight heart rate and breathing, and how it compares with recent nights


FIND WHAT HELPS OR HURTS

• Insights: an on-device read of your own log that finds what is linked to what, and how sure it is


YOUR DATA NEVER LEAVES YOUR PHONE

• 100% offline-first: no account, no cloud, no ads. You own your data and can export it anytime
• Reads HRV, resting HR, sleep, workouts and blood pressure from Apple Health, and writes back only what you ask


WHAT'S FREE, WHAT'S PRO

Free forever: unlimited live HRV captures, PoTS stand tests and episodes, journaling, manual readings, your daily score and outlook, the Apple Watch HR monitor, 14 days of charts and full export.

Autonomic Pro adds the pacing budget, week / month / year progress, full historical analysis, Insights, PoTS results and AI doctor reports. It is £X.XX/month or £X.XX/year, billed to your Apple ID and renewing automatically until cancelled. Cancel anytime in your App Store settings.

Terms of Use: https://autonomic.care/terms-of-service/
Privacy Policy: https://autonomic.care/privacy-policy/


IMPORTANT: Autonomic is a personal journal and education tool, not a medical device. It does not diagnose or treat any disease. Always discuss protocol or medication changes with your GP or specialist.

## Google Play (en-GB translation)

Store presence → Main store listing → Manage translations → English (United
Kingdom).

### App name (29/30)

Autonomic: HRV, PoTS & Pacing

### Short description (77/80)

HRV and pacing for ME/CFS, long covid and PoTS. Energy management, on-device.

### Full description (3,925/4,000)

See your nervous system actually recover.

Autonomic turns a Bluetooth heart rate strap, or just your finger over your phone's camera into a full HRV lab, grades every reading against published thresholds, and turns what it learns into a daily pacing budget fitted to you.

Built for the long haul: ME/CFS, long covid and post-viral recovery, PoTS and dysautonomia, and anyone rebuilding their nervous system.

Free to use, no account, no ads, no tracking. 14 days of full access on install, then the core stays free forever.


PACING AND ENERGY MANAGEMENT, IN MINUTES

• A budget for today in minutes of effort, fitted to your own readings and history, never a textbook number
• It counts the whole day, not just what you log: workouts, steps, time on your feet, and minutes above your own exertion line
• Legs up and breathwork buy minutes back
• A pace marker shows where you are in the day, so what is left means something at 9am and at 6pm
• It goes quiet when it should: on a day that reads as a downturn, no number is published at all
• It tells you how often its estimate held, week by week, and it is on your home screen widgets too


LIVE 5-MINUTE HRV, DONE RIGHT

• Capture beat-to-beat RR intervals from a Bluetooth chest strap, your Garmin watch, or your phone's camera using your finger
• A guided 5:00 session with paced breathing (4/6 resonance), live heart rate, SDNN and your beat-to-beat trace as it runs
• Every metric computed on-device: SDNN, RMSSD, pNN50, PNS & SNS index, Baevsky stress index, LF/HF, coherence and more
• Artefacts are flagged and corrected, and a noisy reading refuses to fake a score


EVERY NUMBER GRADED, NO BLACK BOX

• Every number scored great / good / ok / warning / crash against real thresholds
• One daily Autonomic Score that rolls up HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook: what your body is ready for, from a full workout to a rest day
• An early heads-up when your own markers drift: slower heart-rate recovery, a higher resting or overnight heart rate, a bigger standing rise


PoTS AND ORTHOSTATIC TESTING

• A guided lie-and-stand test with a chest strap: rest, stand when it tells you, and watch your live delta against baseline
• Capture a PoTS Episode the moment one starts: baseline, the climb, and 60 seconds of recovery


TRACK EVERYTHING, KEEP YOUR STREAK

• Water, meals and food triggers, meds and supplements, symptoms, activities, sleep, blood pressure, stand tests and digestion
• Define your own "clean day" (hydration, sleep, meds, triggers) and build a streak, with your longest run and a 30 day consistency rate
• Tap a night for its full sleep report: stages, overnight heart rate and breathing, and how it compares with recent nights
• Milestones, so recovery actually adds up


FIND WHAT HELPS OR HURTS

• Insights: an on-device read of your own log that finds what is linked to what, and how sure it is


YOUR DATA NEVER LEAVES YOUR PHONE

• 100% offline-first: no account, no cloud, no ads. You own your data and can export it anytime
• Reads HRV, resting HR, sleep, workouts and blood pressure from Health Connect, and writes back only what you ask


WHAT'S FREE, WHAT'S PRO

Free forever: unlimited live HRV captures, PoTS stand tests and episodes from a chest strap, journaling, manual readings, your daily Autonomic Score and outlook, 14 days of progress charts, and backup and export.

Autonomic Pro adds the pacing budget, week / month / year progress, full historical analysis, Insights, PoTS results and AI doctor reports. It is £X.XX per month or £X.XX per year, billed through Google Play. Subscriptions renew automatically until cancelled; manage or cancel anytime in Google Play > Subscriptions.


IMPORTANT: Autonomic is a personal journal and education tool, not a medical device. It does not diagnose or treat any disease. Always discuss protocol or medication changes with your GP or specialist.
