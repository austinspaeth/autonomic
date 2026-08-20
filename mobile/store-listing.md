# Store listing — v1.25.1

Copy-paste source for **App Store Connect** and the **Google Play Console**.
Character counts verified against each store's limits.

Console *configuration* (products, offers, price changes) is not here — that is
`STORE_SETUP.md`. This file is the words.

---

## Submission checklist — 1.25.1

What changed since the listings were last written (1.25.0): the live reading was
rebuilt (live HR / SDNN / beat-to-beat trace with signal quality on screen, and
a reading that can be minimized and keeps running), and a second warning
detector landed — `scoring/strain.ts` flags the markers that drift BEFORE the
daily score does. Neither appeared anywhere in the descriptions.

**App Store Connect** — needs a version submission, so it rides the 1.25.1 build:

- [ ] **Description** → replace wholesale with the block below (3,994/4,000).
      Adds the live-reading detail, minimize, and the early heads-up bullet;
      trims where needed to stay inside the limit.
- [ ] **What's New** → the 1.25 block below. It covers the 1.25 release as a
      whole. **If 1.25.0 already shipped to the App Store**, drop its last
      bullet (unlimited capture was 1.25.0's headline and has already been
      announced).
- [ ] **App Review notes** → unchanged from 1.25.0, still accurate. Re-paste the
      block below if the field was cleared.

Updatable any time, no review, so do it whenever:

- [ ] **Promotional text** (165/170) — reworded: leads with the live
      beat-to-beat reading rather than repeating the free/Pro split the
      description already carries.

**Google Play** — the store listing needs no binary, so it can go up before or
after the release:

- [ ] **Full description** → replace wholesale (3,975/4,000).
- [ ] **Release notes** → the 1.25 Play variant below (498/500).

**Unchanged, don't touch:** app name, subtitle, keywords, short description,
prices, privacy labels / data-safety answers (the app still collects nothing),
and the Health Connect justification at the end of this file (it was re-synced
with `READ_TYPES` in 1.25.0 and nothing in `src/lib/health/healthConnect.ts` has
moved since).

**Keywords: reviewed, no change.** The 98/100 string still covers the intent
that matters (long covid, HRV, POTS, dysautonomia, orthostatic, RMSSD, pacing,
chest strap) and 1.25 added no new search term worth the characters — "minimize"
and "early warning" are not things anyone searches the store for. Two notes for
whenever it IS reworked: any word already in the App Store *name* or *subtitle*
is indexed from there and is wasted here (on Play the app name is
"Autonomic Journal: HRV & POTS", so `hrv` and `pots` would be dead weight in an
equivalent field), and the terms most worth buying if space frees up are `cfs`,
`fatigue` and `vagus`.

**Not a listing change, but must be true before the build is live** — see
`STORE_SETUP.md`:

- [ ] **`annual_founder_first_year` is deleted (or inactive) in App Store
      Connect.** The founding-member card no longer uses an introductory offer:
      Apple applies one to every eligible subscriber from the ordinary paywall,
      so it could never be exclusive to the card. While it exists, every new
      yearly subscriber gets a discounted first year for nothing. See
      `STORE_SETUP.md` Part 7.
- [ ] Part 6's `com.autonomic.journal.yearly.promo` exists and is ACTIVE on both
      stores. It is now the product behind BOTH the annual offer card and the
      founding-member card, so a missing or inactive product breaks two
      surfaces, not one.
- [ ] Neither store has a free-trial intro offer configured. The app's 14-day
      window is local (`TRIAL_DAYS`, `src/lib/tier.ts`) and needs no store
      product; `hasTrial()` reads the live product, so with no offer the paywall
      correctly says "Upgrade to Pro" and promises no trial.
- [ ] `eas.json` has `autoIncrement: true`, so build number / versionCode look
      after themselves. Only `version` in `app.json` is hand-set (now 1.25.1).

**Screenshots — the one thing no grep can check.** The carousels predate
Insights, the sleep report and the rebuilt reading card. The scenes that produce
replacements live on the `screenshots` branch (`mobile/app/screenshots/`, dev
only): journal, breathing (+ a Play cut with no Apple Watch), measure, insights,
sleep, payoff. Shoot them on an iPhone 17 Pro Max simulator, which captures at
1320 × 2868 — the required 6.9" size. Audit anything still live for captions
reading "7-day free trial" (it is 14 days now) or a "1 / day" capture row (the
cap is gone).

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

Free to use, no account, no ads. Journal your recovery, score every day, take unlimited HRV readings with live beat-to-beat data. Pro adds POTS tests, Insights & AI.

## Keywords (98/100 chars)

long,covid,hrv,heart,rate,variability,pots,dysautonomia,orthostatic,watch,rmssd,pacing,chest,strap

Notes: single words instead of phrases (ASC recombines them, spaces waste
chars); added dysautonomia + watch; dropped vagal tone / sdnn / symptom. Remove
`hrv` if it's already in the app name or subtitle — those fields are indexed too.
Do **not** add "free" — Apple indexes the price separately and it wastes chars.

## What's New (1.25, both stores — 886/4,000 chars)

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

## Description (3,994/4,000 chars)

See your nervous system actually recover.

Autonomic turns a chest strap, your Apple Watch, or your finger over the camera into a full HRV lab in your pocket, then grades every reading against published research thresholds, so you know whether today was a good day or a warning sign.

Built for the long haul: long covid and post viral recovery, POTS and dysautonomia, ME/CFS, and anyone rebuilding their nervous system one day at a time.

Free to use, with no account, no ads or tracking. Every install starts with 14 days of full access, then keeps the core free forever.


LIVE 5-MINUTE HRV, DONE RIGHT

• Capture beat-to-beat RR intervals from a chest strap, Apple Watch, or your iPhone's camera with your finger
• A guided session with a 5:00 ring and paced breathing (4/6 resonance), showing live heart rate, SDNN and your beat-to-beat trace as the reading runs
• Minimize a reading and it keeps running while you use the rest of the app
• Every metric computed on-device: SDNN, RMSSD, pNN50, mean RR, PNS & SNS index, Baevsky stress index, VLF/LF/HF power, LF/HF, coherence, and more
• Honest signal quality: artifacts are flagged and corrected, and a noisy reading refuses to fake a score


EVERY NUMBER GRADED, NO BLACK BOX

• Every number scored great / good / ok / warning / crash against real thresholds
• One daily Autonomic Score that rolls up HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook for the day: what your body is ready for, from a full workout to a rest day
• An early heads-up when your own markers drift: slower heart-rate recovery, a higher resting or overnight heart rate, a bigger standing rise


POTS TESTING ON YOUR WRIST: THE APPLE WATCH APP

• A guided lie-and-stand test on your watch: rest, stand when it taps you, and watch your live delta against baseline
• Haptic alerts the moment your heart rate climbs 30+ bpm over baseline
• One tap on the watch complication starts a POTS Episode capture: baseline, the climb, and 60 seconds of recovery
• A live HR monitor for symptomatic moments, with a rolling average and spike alerts


BUILD YOUR PROTOCOL, KEEP YOUR STREAK

• Define your own "clean day": hydration, sleep hours, the meds to take, the triggers to avoid
• Clean days build a streak, with your longest run and a 30 day consistency rate


TRACK EVERYTHING THAT MOVES THE NEEDLE

• Water, meals and food triggers, meds and supplements, symptoms, activities, sleep, blood pressure, stand tests and digestion
• Tap a night for its full sleep report: stages, overnight heart rate and breathing, and how it compares with recent nights
• Add your own meds, supplements, activities, symptoms and triggers


FIND WHAT HELPS OR HURTS

• Insights: an on-device read of your own log that finds what is linked to what, and how sure it is
• Analysis across days, weeks and months, to see what moves your numbers
• Bring your own AI for a deeper read, or a report for your doctor


YOUR DATA NEVER LEAVES YOUR PHONE

• 100% offline-first: no account, no cloud, no tracking, no ads
• Stored on device; you own it and can export it anytime
• Reads HRV, resting HR, sleep, workouts and blood pressure from Apple Health, and writes back only what you ask


WHAT'S FREE, WHAT'S PRO

Free forever: unlimited live HRV captures, journaling (sleep, meds, symptoms, triggers, hydration, meals), manual readings, your daily Autonomic Score and outlook, the Apple Watch heart-rate monitor, 14 days of charts, and full export.

Autonomic Pro adds: week / month / year progress views, full historical metric analysis, on-device Insights, POTS stand testing and episode tracking, and AI doctor reports.

Pro is $7.99/month or $49.99/year, billed to your Apple ID and renewing automatically until cancelled. Cancel anytime in your App Store settings.


IMPORTANT: Autonomic is a personal journal and education tool, not a medical device. It does not diagnose, treat, or prevent any disease. Always discuss protocol or medication changes with your doctor.

## App Review notes (freemium submission)

> This version removes the hard paywall — the app is now fully usable without a
> purchase. On first launch it grants a 14-day local full-access window (no
> account, no store call), after which the core (journaling, daily score, manual
> readings, watch HR monitor, unlimited live HRV capture, 14 days of charts,
> export) remains free indefinitely.
>
> Autonomic Pro (com.autonomic.journal.monthly / .yearly, one subscription
> group) unlocks the full progress history, the Insights tab, POTS testing and
> AI reports. HRV capture itself is unlimited on the free tier. To reach the
> paywall: Insights tab, or Analysis tab → Week/Month/Year. "Restore purchase" is on the paywall card.
>
> No demo account is needed. HRV capture works without hardware via the camera
> (finger over the rear lens); a chest strap or Apple Watch is optional.

## Screenshot plan

Apple Watch screenshots are REQUIRED now that the bundle contains a watchOS
app. Capture on the largest watch simulator (Ultra 49mm or Series 10 46mm,
Cmd+S saves a correctly sized PNG); the largest size covers the smaller slots.

Watch carousel (in order):
1. Stand test, standing phase — big live delta (stage ~+34, orange/red) with countdown
2. POTS Episode picker (Stairs / Sit to stand / Lay to stand)
3. Episode 60s recovery screen with live delta
4. HR Monitor — big number + 2-min average + delta
5. Home screen with the three modes

iPhone carousel (first 3 show in search results):
1. Current hero (live HRV session) — keep
2. Watch panel: brand background, watch mockups (stand test + complication), caption "POTS testing on your wrist"
3. Handoff shot: phone reading-summary card when a watch test arrives (HR series chart, graded delta)
4+. Existing: Autonomic Score, protocol/streak, analysis, privacy

**Audit for trial copy.** Any screenshot caption reading "7-day free trial",
"subscription required" or similar must be recaptured — the free tier is the
hook now. Consider swapping one panel for the `FreeVsProCard` comparison grid.

---

# Google Play (Android)

Play has different fields and limits from ASC. Android has no Apple Watch, so
every watch line is cut and Apple Health becomes Health Connect. Play's full
description supports a *little* markdown-ish formatting but plain text with
blank-line breaks renders most reliably.

## App name (29/30 chars)

Autonomic Journal: HRV & POTS

## Short description (80/80 chars)

Free HRV, POTS & symptom journal for long covid recovery. Private and on-device.

## Full description (3,975/4,000 chars)

See your nervous system actually recover.

Autonomic turns a Bluetooth heart rate strap, or just your finger over your phone's camera, into a full HRV lab in your pocket, then grades every reading against published research thresholds, so you finally know whether today was a good day or a warning sign.

Built for the long haul: long covid and post viral recovery, POTS and dysautonomia, ME/CFS, and anyone rebuilding their autonomic nervous system one day at a time.

Free to use, with no account, no ads and no tracking. Every install starts with 14 days of full access, then keeps the core free forever.


LIVE 5-MINUTE HRV, DONE RIGHT

• Capture beat-to-beat RR intervals live from a Bluetooth chest strap, or with your phone's camera using your finger
• A guided session with a 5:00 ring and paced breathing (4/6 resonance), showing live heart rate, SDNN and your beat-to-beat trace as the reading runs
• Minimize a reading and it keeps running while you use the rest of the app
• Every metric computed on-device: SDNN, RMSSD, pNN50, mean RR, PNS & SNS index, Baevsky stress index, VLF/LF/HF power, LF/HF, coherence, and more
• Honest signal quality: artifacts are flagged and corrected, and a noisy reading refuses to fake a score


EVERY NUMBER GRADED, NO BLACK BOX

• Every number is scored great / good / ok / warning / crash against real thresholds
• One daily Autonomic Score that rolls up HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook for the day: what your body is ready for, from a full workout to a rest day
• An early heads-up when your own markers drift: slower heart-rate recovery, a higher resting or overnight heart rate, a bigger standing rise


BUILD YOUR PROTOCOL, KEEP YOUR STREAK

• Define your own "clean day": a hydration target, sleep hours, the meds and supplements to take, the triggers to avoid
• Every day is matched against your protocol automatically
• Clean days build a streak, with your longest run and a 30 day consistency rate


TRACK EVERYTHING THAT MOVES THE NEEDLE

• Water, meals and food triggers, medications and supplements, symptoms, activities, sleep, blood pressure and orthostatic stand tests
• Digestion and bowel movements too: the whole picture, not just heart rate
• Tap a night for its full sleep report: stages, overnight heart rate and breathing, and how it compares with your recent nights
• Add your own meds, supplements, activities, symptoms and triggers


FIND WHAT HELPS OR HURTS

• Insights: an on-device read of your own log that finds what is genuinely linked to what, ranks it, and shows the days behind every claim
• Analysis across days, weeks and months, to see what moves your numbers
• Milestones so recovery actually adds up
• Optional: bring your own AI for a deeper read, or a report for your doctor


YOUR DATA NEVER LEAVES YOUR PHONE

• 100% offline-first: no account, no cloud, no tracking, no ads
• Everything is stored on device; you own it and can export it anytime
• Reads HRV, resting HR, sleep, workouts and blood pressure from Health Connect, and writes back what you log, only when you ask


WHAT'S FREE, WHAT'S PRO

Free forever: unlimited live HRV captures, journaling (sleep, meds, symptoms, triggers, hydration, meals, activities), manual readings (blood pressure, resting heart rate, episodes), your daily Autonomic Score and outlook, 14 days of progress charts, and backup and export.

Autonomic Pro adds: week / month / year progress views, full historical metric analysis, on-device Insights, POTS stand testing and episode tracking, and AI doctor reports.

Pro is $7.99 per month or $49.99 per year, billed through Google Play. Subscriptions renew automatically until cancelled; manage or cancel anytime in Google Play → Subscriptions.


IMPORTANT: Autonomic is a personal journal and education tool, not a medical device. It does not diagnose, treat, or prevent any disease. Always discuss protocol, medication, or supplement changes with your doctor.

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
