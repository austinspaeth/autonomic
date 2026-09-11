# Store listing — v1.28.0

Copy-paste source for **App Store Connect** and the **Google Play Console**.
Character counts verified against each store's limits.

Console *configuration* (products, offers, price changes) is not here — that is
`STORE_SETUP.md`. This file is the words.

---

## Submission checklist — 1.28.0

**Where the stores stood when this was written (checked 2026-09-10):** the App
Store is on **1.27.0** as "Autonomic: HRV & POTS Tracker". Google Play shows
"Autonomic Journal: HRV & POTS" with the short description "HRV, POTS & symptom
journal for long covid recovery. Private and on device." Build 75 (1.28.0) is
uploaded to App Store Connect, and the Android 1.28.0 bundle (versionCode 40) is
in `mobile/dist/`.

**What this revision is for.** Pacing is now a core part of the product and the
thing we compete on, so both listings are rewritten around it for search, not
patched to mention it. Two store facts decide where each word goes:

- **Apple indexes only the name, the subtitle, the keyword field and in-app
  purchase display names.** The description is never searched; it only persuades
  somebody who has already opened the page. So pacing terms go in the subtitle
  and keywords, and the App Store description is written to convert.
- **Google Play indexes the title, the short description and the full
  description.** Pacing terms have to appear naturally in all three. The Play
  description says "pacing" 8 times, "long covid" and "ME/CFS" 3 times each, and
  "PEM", "energy" and "dysautonomia" twice each. Play penalises keyword stuffing,
  so do not push those counts higher.

**Never name a competitor in any listing field.** Apple rejects other apps'
names in metadata (Guideline 2.3.7) and Play's metadata policy bans them too.
The copy positions against Visible without naming it: "no armband to buy", "not
a points score", "the watch you already own". Their name belongs in Apple Search
Ads keywords and on the website's comparison table, never here.

**App Store Connect** (rides the 1.28.0 build):

- [ ] **Before changing anything, write down the current subtitle and keyword
      field.** Neither is recorded in the repo, and a ranking drop can only be
      traced and reversed against what was there.
- [ ] **Subtitle** → `Pacing for Long COVID & ME/CFS` (30/30). The biggest single ASO change in
      this revision; see the note under it.
- [ ] **Keywords** → set A (97/100) if the subtitle changes, set B (95/100) if it
      does not. Keywords only change with a version submission, and this is one.
- [ ] **Name** → unchanged: `Autonomic: HRV & POTS Tracker` (29/30).
- [ ] **Description** → replace wholesale (3,957/4,000). **The Terms of Use /
      Privacy Policy lines at the end are not optional and never get trimmed for
      space.** 1.25.1 was rejected under Guideline 3.1.2 by Apple's automated
      metadata check because a wholesale paste dropped them: the app sells
      auto-renewable subscriptions, so a functional EULA link must be in the App
      Description itself. Trim a bullet instead.
- [ ] **What's New** → the 1.28 block below. 1.27 is already live, so it no
      longer repeats the Outlook, free POTS capture and Garmin bullets.
- [ ] **Promotional text** (151/170). Updatable any time without review, so it
      can go up now.
- [ ] **In-App Event** "New: Your Pacing Budget" (see Promotion). Events show in search
      results, which the description never does.
- [ ] **App Review notes** → the block below.
- [ ] **Screenshots and app preview** → the plan below. The first three phone
      shots and the first watch shot are new work.
- [ ] **App Information → License Agreement** → unchanged: `mobile/EULA.md` as a
      Custom License Agreement for all countries, `[LEGAL NAME]` /
      `[MAILING ADDRESS]` / `[PHONE]` filled in.

**Google Play** (listing text needs no binary, so it can go up before or after):

- [ ] **Title** → `Autonomic: HRV, POTS & Pacing` (29/30). Read the note under it first.
- [ ] **Short description** → replace (76/80).
- [ ] **Full description** → replace wholesale (3,986/4,000).
- [ ] **Release notes** → the 1.28 Play variant below (463/500).
- [ ] **Feature graphic** → redo around the pacing bar (plan below).
- [ ] **Custom store listing** for pacing searches (see Promotion).

**Unchanged, don't touch:** prices, privacy labels / data-safety answers (the app
still collects nothing), and the Health Connect justification at the end of this
file. Steps and stand time are read through the existing HealthKit / Health
Connect grants, and nothing is written back that was not written back before.

**Claims in this copy that must stay true in the app** (the same boundary
`CLAUDE.md` says five places state, so moving one moves all of them):

- **"14 days of full access on install, then one more free week of pacing."**
  14 days is `TRIAL_DAYS` (`src/lib/tier.ts`). The week is
  `src/lib/pacingTrial.ts`: ONE seven-day window per install, stamped at the
  first launch where the tier is actually free, which for a new install is the
  day the 14 days end. If either changes, both descriptions, the What's New and
  the App Review note change the same day.
- **Nothing here promises unlimited capture as a Pro benefit.** Capture is free
  on every tier; Pro is what the app makes of the readings.
- **Pacing alerts are Pro** (`isPacingUnlocked` in `src/store/pacingAlerts.ts`)
  and are local notifications. The copy calls them optional and never promises
  they arrive the instant something happens: a locked iPhone reads Health as
  empty, so on iOS an alert usually lands after the next unlock.
- **"On a day that reads as a downturn, no number is published"** is the
  suppression rule in `src/lib/budget/`. If it is ever relaxed, that bullet goes.

**Not a listing change, but must be true before the build is live** — see
`STORE_SETUP.md`:

- [ ] **`annual_founder_first_year` is deleted (or inactive) in App Store
      Connect.** While it exists, every new yearly subscriber gets a discounted
      first year for nothing. See `STORE_SETUP.md` Part 7.
- [ ] Part 6's `com.autonomic.journal.yearly.promo` exists and is ACTIVE on both
      stores. It is the product behind BOTH the annual offer card and the
      founding-member card.
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

## Name (29/30 chars) — unchanged

Autonomic: HRV & POTS Tracker

Keep it. "HRV", "POTS" and "tracker" are the words it already ranks on, and "pots
tracker" is one of the searches the marketing plan targets. Pacing goes in the
subtitle rather than pushing one of those out.

## Subtitle (30/30 chars)

Pacing for Long COVID & ME/CFS

After the name, the subtitle carries the most search weight, and it is the line
printed under the name in search results: the one sentence a stranger reads
before deciding to tap. This puts the words the pacing audience actually types
("pacing", "long covid", "ME/CFS") in the second-strongest field, and frees
about 20 characters of the keyword field for new terms. Apple splits "ME/CFS"
into "me" and "cfs".

If the current subtitle carries "dysautonomia", nothing it ranks for is lost:
keyword set A below already includes it.

**Alternative**, if long covid should stay out of the subtitle:
`Energy Pacing & Dysautonomia` (28/30), paired with keyword set B.

## Keywords (100 chars max)

**Set A, with the new subtitle (97/100):**

dysautonomia,orthostatic,pem,fatigue,energy,spoons,crash,heart,rate,variability,garmin,tachycardia

**Set B, if the subtitle is not changed (95/100):**

long,covid,pacing,pem,cfs,dysautonomia,orthostatic,fatigue,energy,spoons,heart,rate,variability

Set B assumes the current subtitle does not already contain those words. Delete
any word it does contain and spend the space on `crash` or `watch`.

What changed from the 1.25 field, and why:

- `pacing` and `long,covid` move up into the subtitle (set A), where they rank
  harder than they ever could here.
- `energy`, `spoons` and `crash` are new. They are how people with ME/CFS and
  long covid describe the problem pacing answers ("spoon theory", "energy
  envelope", "push and crash"), and none of them is in the name or subtitle.
- `tachycardia` is new, for POTS searches. `orthostatic`, `dysautonomia`, `pem`,
  `fatigue`, `watch` and `heart,rate,variability` stay.
- `rmssd` is out: almost nobody searches for it, and HRV searches already match
  `hrv` in the name.

Standing notes: single words, no spaces (Apple combines them with the name and
subtitle, so `heart,rate,variability` also matches "heart rate variability");
never repeat a word from the name or subtitle; never add "free" (Apple indexes the
price separately) or a competitor's name (Guideline 2.3.7).

## Promotional text (151/170 chars)

New: a daily pacing budget for long covid, ME/CFS and POTS. Your morning readings set how much today can take, in minutes of effort. No armband to buy.

Not indexed for search, but it is the first paragraph on the product page and
changes any time without review. After the launch month, swap to an evergreen
line: `Pacing, HRV and POTS testing in one private journal. Your readings set a daily budget in minutes of effort, fitted to you. No armband, no account.` (146/170).

## What's New (1.28, App Store — 1,090/4,000 chars)

NEW: your daily pacing budget.

Your readings set a budget for today in minutes of effort, fitted to your own history rather than a textbook number or a points score. It counts the whole day, not just what you log: workouts, steps, time on your feet, and the minutes your heart spends above your own exertion line. Legs up and breathwork buy minutes back.

A pace marker on your Outlook card shows where an even day would be by now, so what is left means something at 9am and at 6pm. Tap it to see where the minutes went. Because PEM arrives late, every estimate is checked against how the next two days went, and the app shows you how often it held. On a day that reads as a downturn, it publishes no number at all.

Optional pacing alerts tell you when you are running ahead of pace, nearly spent, over budget, or when your heart rate stays high.

It is on your Journal, in two new home screen widgets, and on your Apple Watch. The pacing budget is part of Autonomic Pro, and every install gets a free week of it.

Also in this release: faster Progress and Insights, and fixes throughout.

### Play Store variant (1.28, Android, 463/500 chars)

New: your daily pacing budget. Your readings set a budget for today in minutes of effort, fitted to your own history. It counts the whole day: workouts, steps, time on your feet, and minutes above your own exertion line. Legs up and breathwork buy minutes back, a pace marker shows where you are in the day, and optional alerts tell you when you are ahead of pace, nearly spent or over. On your Journal and in two new home screen widgets.

Also: fixes throughout.

If Play is still on 1.26 or earlier when this ships, it has not announced the
1.27 changes either. Then use this instead (497/500):

New: your daily pacing budget. Your readings set a budget for today in minutes of effort, fitted to your own history. It counts the whole day: workouts, steps, time on your feet, and minutes above your own exertion line. Legs up and breathwork buy minutes back, and a pace marker shows where you are in the day. On your Journal and in two new home screen widgets.

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

## Description (3,957/4,000 chars)

Written to convert, not to rank: Apple never indexes it. Only the first three
lines show before "more", so they carry the pacing pitch, who it is for, and the
no-armband, no-account promise.

Know how much today can take.

Autonomic sets a daily pacing budget for long covid, ME/CFS, POTS and dysautonomia from your own morning readings and history, and turns a chest strap, Apple Watch, Garmin or your phone's camera into a full HRV lab graded against published thresholds.

No armband to buy, no account, no ads, no tracking. 14 days of full access on install, then the journal and live HRV stay free forever.


YOUR DAILY PACING BUDGET

• Think spoons, but measured: a budget for today in minutes of effort, fitted to your own history, not a points score
• It counts the whole day, not just what you log: workouts, steps, time upright, and minutes above your own exertion line
• Standing still counts too, read from your own stand test, because upright time costs most with POTS
• Legs up and breathwork buy minutes back
• A pace marker shows where an even day would be by now, so you can ease off before the day runs out
• Optional alerts when you run ahead of pace, nearly spend your budget, go over, or your heart rate stays high
• PEM arrives late, so every estimate is checked against the next two days, and you see how often it held
• On a day that reads as a downturn, no number is published at all
• On your Journal, widgets, Apple Watch, and in the report you take to your doctor


LIVE 5-MINUTE HRV, DONE RIGHT

• Beat-to-beat RR intervals from a chest strap, Apple Watch, Garmin, or your finger on the camera
• A guided 5:00 session with paced breathing, live heart rate, SDNN and your beat-to-beat trace
• Computed on-device: SDNN, RMSSD, pNN50, PNS & SNS index, stress index, LF/HF, coherence and more
• Artifacts are corrected, and a noisy reading refuses to fake a score


EVERY NUMBER GRADED, NO BLACK BOX

• Every number scored great / good / ok / warning / crash against real thresholds
• One daily Autonomic Score across HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook, from a full workout to a rest day
• An early heads-up when your own markers drift: slower heart rate recovery, a higher resting or overnight heart rate, a bigger standing rise


POTS TESTING ON YOUR WRIST

• A guided lie-and-stand test on your Apple Watch or a chest strap, with your live delta against baseline
• One tap captures a POTS episode: baseline, the climb, and 60 seconds of recovery


TRACK EVERYTHING, KEEP YOUR STREAK

• Water, meals and triggers, meds and supplements, symptoms, activities, sleep, blood pressure and digestion
• Your own "clean day" streak, with your longest run and 30 day consistency
• A sleep report for every night: stages, overnight heart rate and breathing


FIND WHAT HELPS OR HURTS

• Insights reads your log on-device to find what is linked to what, and how sure it is


YOUR DATA NEVER LEAVES YOUR PHONE

• Offline-first: no account, no cloud, no ads. Export everything anytime
• Reads HRV, heart rate, steps, sleep, workouts and blood pressure from Apple Health, and writes back only what you ask


WHAT'S FREE, WHAT'S PRO

Free forever: unlimited live HRV captures, POTS stand tests and episodes, journaling, manual readings, your daily score and outlook, the Apple Watch HR monitor, 14 days of charts and full export.

Autonomic Pro adds the pacing budget and pacing alerts, week / month / year progress, full history, Insights, POTS results and AI doctor reports. Every install starts with 14 days of full access, then one more free week of pacing. Pro is $7.99/month or $49.99/year, billed to your Apple ID and renewing automatically until cancelled. Cancel anytime in your App Store settings.

Terms of Use: https://autonomic.care/terms-of-service/
Privacy Policy: https://autonomic.care/privacy-policy/


IMPORTANT: Autonomic is a personal journal and education tool, not a medical device. It does not diagnose or treat any disease, and the pacing budget is an estimate from your own data, not an activity prescription. Always discuss protocol or medication changes with your doctor.

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
> Journal's Outlook card. It is a Pro feature with its own one-week free window
> per install (local, no store product), so a fresh install sees it working
> rather than locked. It estimates how much activity the day can absorb, in
> minutes of effort, from the user's own logged activity, steps and heart rate,
> and it is presented as a personal journal estimate, not medical advice or an
> activity prescription.
>
> Pacing alerts (Settings → Notifications) are local notifications raised on the
> device from the same estimate. Nothing is sent to a server, and they only run
> while the pacing budget is unlocked (Pro, the install trial, or its free week).
>
> No demo account is needed. HRV capture works without hardware via the camera
> (finger over the rear lens); a chest strap, Apple Watch or Garmin watch is
> optional.

## Screenshot plan

The scenes that produce these live on the `screenshots` branch
(`mobile/app/screenshots/`, dev only): journal, breathing (+ a Play cut with no
Apple Watch), measure, insights, sleep, plan, trust, payoff, understand, live.
**There are no pacing scenes yet**: phone shots 1, 2, 3 and 5 and the first two
watch shots are new work. Build them from the demo journal's numbers, never real
personal data.

**The first three shots carry the listing.** App Store search results show only
the first three portrait screenshots, and on Play the first two or three are
what a scrolling visitor sees. Between them they have to say: pacing, the whole
day counted, and that it works without opening the app. Each caption is a short
headline plus an optional smaller line, in the app's type over the brand
background. Captions reuse the words from the subtitle and keywords (pacing,
energy, POTS, long covid); Apple has been reported to read caption text for
search since 2025, and whether or not it does, the captions are what converts.

Keep every caption free of outcome promises ("prevent crashes", "stop PEM"):
both stores treat those as medical claims.

### iPhone (6.9", 1320 × 2868, up to 10)

No iPad set is needed: `supportsTablet` is false. Shoot on an iPhone 17 Pro Max
simulator, which captures at the required size.

1. **Pacing hero: the Outlook card with the pacing strip, mid-afternoon, AHEAD
   of pace (gold).** Gold is the one state where the pace marker is visibly
   doing work, and the fill sitting past the mark is the whole idea in one
   picture. Never the red over state here: the first thing a stranger sees
   should not be the app telling somebody off.
   Caption: **"Know how much today can take"** / "A daily pacing budget, in
   minutes of effort"
2. **Where it went: the pacing sheet.** The bar and marker, the Budget / Spent /
   Left tiles, and "Where Budget Went" with four rows: minutes above the heart
   rate line, upright time, a logged walk, and recovery time giving minutes back
   in green.
   Caption: **"It counts your whole day"** / "Steps, time upright, heart rate
   and workouts"
3. **Outside the app: the home screen with the Pacing (small) and Pacing Detail
   (medium) widgets, and a pacing alert banner at the top** ("Budget nearly
   spent").
   Caption: **"Pace without opening the app"** / "Widgets, alerts and your Apple
   Watch"
4. **Live HRV session** (the current hero; it stays in the top five, it is what
   the app is).
   Caption: **"A 5-minute HRV reading, done right"**
5. **The trust shot: the budget sheet's "how often it held" readout, beside an
   Upright time drill-in with its hourly bars.** This is the direct answer to
   "why would I believe a number about my energy".
   Caption: **"It shows you how often it held"** / "Checked against the next
   two days"
6. **Autonomic Score / Outlook** with graded metrics.
   Caption: **"Every number graded"**
7. **POTS stand test**, standing phase.
   Caption: **"POTS testing on your wrist"**
8. **Insights.** Caption: **"Find what helps or hurts"**
9. **Sleep report.** Caption: **"Every night, fully read"**
10. **Privacy.** Caption: **"Your data never leaves your phone"** / "No
    account, no cloud, no ads"

Shots 4 and 6 to 10 reuse existing scenes: reorder and re-caption them.

### App preview video (optional, strongly recommended)

One portrait preview, 20 to 30 seconds, 886 × 1920, recorded from the simulator
(no people, no hands): a morning reading finishes → the Outlook card shows
today's budget → the bar fills through the day and crosses the pace marker →
tap into Where Budget Went → a pacing alert arrives → the widget on the home
screen. A preview autoplays muted in search results in place of the first
screenshot, so the pacing bar must be on screen in the first three seconds, with
"Know how much today can take" burned in as text.

### Apple Watch (required: the bundle ships a watch app)

Capture on the largest watch simulator (Ultra 49mm, or Series 46mm); Cmd+S
saves a correctly sized PNG, and the largest size covers the smaller slots. No
captions: there is no room, and phone shot 3 names the watch. Pacing goes first
because it is the wrist screen people check without deciding to test anything.

1. **Pacing on the wrist**: bar, marker, Spent and Budget tiles, in the same gold
   state as the phone hero so the two read as one feature.
2. **Watch home** with Pacing as the first row and today's figure under it.
3. Stand test, standing phase: big live delta (~+34, orange/red) with the
   countdown.
4. POTS Episode picker (Stairs / Sit to stand / Lay to stand).
5. Episode 60s recovery screen with live delta.
6. HR Monitor: big number, 2-minute average, delta.

### Google Play phone (up to 8, 9:16, 1080 × 1920 or larger)

At least four screenshots at 1080 px or more on the short side keep the listing
eligible for Play's larger promotional placements. **No Apple Watch or iPhone
may appear in any Play image**; use the Play cut of the breathing scene.

1. Pacing hero (iPhone 1)
2. Where it went (iPhone 2)
3. **An Android home screen with the Pacing and Pacing Detail widgets, and a
   pacing alert in the notification shade.** Caption: **"Pace without opening
   the app"** / "Widgets and alerts"
4. Live HRV from a strap or the camera, no watch in frame
5. How often it held (iPhone 5)
6. Autonomic Score
7. POTS stand test with a chest strap
8. Privacy

Insights and the sleep report drop off Play for space; the description still
covers them.

### Google Play feature graphic (1024 × 500, required)

The pacing bar with its white pace marker, large, over the brand background,
with the wordmark and one line: "Know how much today can take". No screenshot,
no device frame, and nothing important within about 15% of any edge (Play crops
it and draws a play button over the middle when a promo video is set). No "new",
"free" or "best" in it either: Play's metadata policy covers text in graphics.

### Audit anything already live

Captions reading "7-day free trial" (it is 14 days), a "1 / day" capture row (the
cap is gone), a locked POTS capture (captures have been free since 1.27), and any
Apple device in a Play screenshot.

---

## Promotion (both stores)

### App Store In-App Event: the pacing launch

Events appear in App Store search results and on the product page, and Apple can
feature them, so this puts pacing in front of people searching who never opened
the page. Type **Major Update**, priority High, from release for up to 31 days.

- Event name (23/30): `New: Your Pacing Budget`
- Short description (40/50): `Know how much today can take, in minutes`
- Long description (108/120): `Your morning readings set a daily pacing budget for long covid, ME/CFS and POTS, fitted to your own history.`
- Event card media 1920 × 1080 and details media 1080 × 1920: the pacing hero,
  with no text over it (Apple overlays the event name).
- Deep link: none. The budget is on the Journal, which is where the app opens.

### Custom Product Pages (App Store) and custom store listings (Play)

- **App Store custom product page "Pacing"**: phone shots 1, 2, 3 and 5 first,
  the launch promotional text. Link it to the keywords `pacing`, `energy`, `pem`,
  `spoons` and `crash` so organic searches for those land on it, and use it as
  the page behind the pacing Search Ads group.
- **App Store custom product page "POTS"**: stand test, episode capture, the
  watch panel, the Outlook. Link it to `pots`, `orthostatic`, `tachycardia` and
  `dysautonomia`.
- **Play custom store listing "Pacing"**, targeted at pacing search keywords, with
  the same screenshots.

### Experiments (one variable at a time, at least 7 days each)

- **App Store Product Page Optimization**: the new pacing-first screenshot order
  against the old HRV-first order.
- **Play store listing experiment**, short description A (the default above)
  against B, `Energy pacing, HRV & POTS symptom journal for long covid & ME/CFS. Private.` (75/80).

### Apple Search Ads

Exact match, one ad group per theme; the pacing group uses the "Pacing" custom
product page.

- **Pacing:** `pacing app`, `energy pacing`, `pem`, `me cfs app`, `long covid
  app`, `spoon theory`, `heart rate pacing`
- **Competitor:** `visible app`, `visible pacing`, `welltory`, `bearable`. Bidding
  on a competitor's name is allowed in Search Ads. The ad text is generated from
  our own metadata, so nothing we write names them.
- **POTS** (existing): `pots tracker`, `pots app`, `dysautonomia`, `orthostatic`

### In-app purchase display names (App Store, indexed for search)

Subscription display names are indexed and show on the product page. If they are
plain "Monthly" / "Yearly", rename them to carry pacing, for example
`Pro Yearly: Pacing & Insights` (29/30) and `Pro Monthly: Pacing & Insights` (30/30), in
App Store Connect → Subscriptions → each product → Localization. The change is
reviewed with the next version; read `STORE_SETUP.md` before touching the
subscription group.

---

# Google Play (Android)

Play has different fields and limits from ASC. Android has no Apple Watch, so
every watch line is cut and Apple Health becomes Health Connect. Play's full
description supports a *little* markdown-ish formatting but plain text with
blank-line breaks renders most reliably.

## App name (29/30 chars)

**Recommended:** Autonomic: HRV, POTS & Pacing

**Currently live:** Autonomic Journal: HRV & POTS

The title is the heaviest ranking signal on Play, and pacing is the one core term
not in it. The swap drops "Journal", which stays in the short description and
appears six times in the full description, so "hrv journal" and "pots journal"
searches still match. Expect a week or two of ranking movement after any Play
title change, so make it together with the new short and full description and
let it happen once. It also brings the Play name close to the App Store's
"Autonomic: HRV & POTS Tracker".

## Short description (76/80 chars)

Pacing, HRV & POTS journal for long covid, ME/CFS & dysautonomia. On-device.

Replaces the live "HRV, POTS & symptom journal for long covid recovery. Private
and on device." It adds pacing, ME/CFS and dysautonomia. "Symptom" moves to the
full description (four times) and so does "private". No price or promotional
wording: Play's metadata policy bars it from the listing fields, and a previous
version was rejected for the word "Free". The B variant for an experiment is
under Promotion.

## Full description (3,986/4,000 chars)

Section breaks are single blank lines here, unlike the App Store copy; Play
renders them the same, and it is what fits the limit.

Know how much today can take.

Autonomic is a pacing app and HRV journal for long covid, ME/CFS, POTS and dysautonomia. Your morning readings and history set a daily pacing budget in minutes of effort, and a Bluetooth heart rate strap, Garmin watch or your phone's camera becomes a full HRV lab graded against published thresholds.

No armband to buy, no account, no ads, no tracking. 14 days of full access on install, then the journal and live HRV stay free forever.

ENERGY PACING FOR PEM, LONG COVID AND ME/CFS

• Think spoons, but measured: a budget for today in minutes of effort, fitted to your own history, not a points score
• It counts the whole day, not just what you log: workouts, steps, time upright, and minutes above your own exertion line
• Standing still counts too, read from your own stand test, because upright time costs most with POTS and dysautonomia
• Legs up and breathwork buy minutes back
• A pace marker shows where an even day would be by now, so you can stay inside your energy envelope
• Optional pacing alerts when you run ahead of pace, nearly spend your budget, go over, or your heart rate stays high
• PEM arrives late, so every estimate is checked against the next two days, and you see how often it held
• On a day that reads as a downturn, no number is published at all
• On your Journal, home screen widgets, and in your doctor report

LIVE 5-MINUTE HRV, DONE RIGHT

• Beat-to-beat RR intervals from a Bluetooth chest strap, Garmin watch, or your finger on the camera
• A guided 5:00 session with paced breathing, live heart rate, SDNN and your beat-to-beat trace
• Every HRV metric computed on-device: SDNN, RMSSD, pNN50, PNS & SNS index, stress index, LF/HF, coherence and more
• Artifacts are corrected, and a noisy reading refuses to fake a score

EVERY NUMBER GRADED, NO BLACK BOX

• Every number scored great / good / ok / warning / crash against real thresholds
• One daily Autonomic Score across HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook, from a full workout to a rest day
• An early heads-up when your own markers drift: slower heart rate recovery, a higher resting or overnight heart rate, a bigger standing rise

POTS AND ORTHOSTATIC TESTING

• A guided lie-and-stand test with a chest strap and your live heart rate delta
• Capture a POTS episode the moment it starts: baseline, the climb, and 60 seconds of recovery

SYMPTOM JOURNAL AND STREAKS

• Water, meals and triggers, meds and supplements, symptoms, activities, sleep, blood pressure and digestion
• Your own "clean day" streak, with your longest run and 30 day consistency
• A sleep report for every night: stages, overnight heart rate and breathing
• Milestones, so recovery from long covid or ME/CFS adds up

FIND WHAT HELPS OR HURTS

• Insights reads your log on-device to find what is linked to what, and how sure it is

YOUR DATA NEVER LEAVES YOUR PHONE

• Offline-first: no account, no cloud, no ads. Export everything anytime
• Reads HRV, heart rate, steps, sleep, workouts and blood pressure from Health Connect, and writes back only what you ask

WHAT'S FREE, WHAT'S PRO

Free forever: unlimited live HRV captures, POTS stand tests and episodes from a chest strap, the symptom journal, manual readings, your daily Autonomic Score and outlook, 14 days of charts, backup and export.

Autonomic Pro adds the pacing budget and pacing alerts, week / month / year progress, full history, Insights, POTS results and AI doctor reports. Every install starts with 14 days of full access, then one more free week of pacing. Pro is $7.99 per month or $49.99 per year, billed through Google Play. It renews automatically until cancelled in Google Play > Subscriptions.

IMPORTANT: Autonomic is a personal journal and education tool, not a medical device. It does not diagnose or treat any disease, and the pacing budget is an estimate from your own data, not an activity prescription. Always discuss protocol or medication changes with your doctor.

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
