# Store listing — v1.9.0 (freemium)

Copy-paste source for **App Store Connect** and the **Google Play Console**.
Character counts verified against each store's limits.

On the App Store, promotional text can be updated anytime without review; the
description, keywords, and screenshots only change with a version submission.
On Google Play, the full description, short description and graphics can be
updated anytime (they go through a short content review, no binary needed).

> **Ship order matters.** Push the freemium build to both stores *before*
> retiring the introductory free-trial offers — see `STORE_SETUP.md`. Until the
> offers are ended, the paywall's own CTA still reads "Start 7-day free trial"
> (it's driven by `hasTrial()` in `src/store/iap.ts`, which reads the live store
> product), so listing copy and in-app copy stay consistent either way.

---

# App Store (iOS + watchOS)

## Promotional text (168/170 chars)

Free to use, no account, no ads. Journal your recovery, score every day, and
capture a lab-quality HRV reading daily. Go Pro for unlimited HRV, POTS testing
& analysis.

## Keywords (98/100 chars)

long,covid,hrv,heart,rate,variability,pots,dysautonomia,orthostatic,watch,rmssd,pacing,chest,strap

Notes: single words instead of phrases (ASC recombines them, spaces waste
chars); added dysautonomia + watch; dropped vagal tone / sdnn / symptom. Remove
`hrv` if it's already in the app name or subtitle — those fields are indexed too.
Do **not** add "free" — Apple indexes the price separately and it wastes chars.

## What's New

Connecting Apple Health can now backfill a full year of history in one shot:
sleep (with time in each stage), workouts (with your heart-rate trace) and
medications, alongside HRV and vitals, with live progress as it imports.

Other improvements:
• Add a note right on the HRV or stand-test results screen, before you save
• Smoother Progress tab: switching Day/Week/Month/Year no longer stutters
• The "trending down" warning is now its own card, and only looks at days
  you've fully logged
• Apple Watch: Night mode and Low Power mode for the heart-rate monitor
• A new one-tap sheet for logging meds, symptoms and triggers
• "Check for updates" now tells you if Health permissions were denied
• Various performance and stability improvements

## Description (3,982/4,000 chars)

See your nervous system actually recover.

Autonomic turns a heart rate chest strap, your Apple Watch, or even your finger over your camera into a full HRV lab in your pocket, then grades every reading against published research thresholds, so you know whether today was a good day or a warning sign.

Built for the long haul: long covid and post viral recovery, POTS and dysautonomia, ME/CFS, and anyone rebuilding their autonomic nervous system one day at a time.

Free to use, with no account, no ads or tracking. Every install starts with 7 days of full access, then keeps the core free forever.


LIVE 5-MINUTE HRV, DONE RIGHT

• Capture beat-to-beat RR intervals live from a Bluetooth chest strap, Apple Watch, or with your iPhone's camera using your finger
• A full screen guided session with a 5:00 ring, live heart rate, and a paced breathing visualizer (4/6 resonance breathing)
• Every metric computed on-device: SDNN, RMSSD, pNN50, mean RR, PNS & SNS index, Baevsky stress index, VLF/LF/HF power, LF/HF, coherence, and more
• Honest signal quality: artifacts are flagged and corrected, and a noisy reading refuses to fake a score


EVERY NUMBER GRADED, NO BLACK BOX

• Every number is scored great / good / ok / warning / crash against real thresholds
• One daily Autonomic Score that rolls up HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook for the day: what your body is ready for, from a full workout to a rest day


POTS TESTING ON YOUR WRIST: THE APPLE WATCH APP

• A guided lie-and-stand test on your watch: rest, stand when it taps you, and watch your live heart rate delta against your resting baseline
• Haptic alerts the moment your heart rate climbs 30+ bpm over baseline, the orthostatic stand test threshold
• One tap on the watch face complication starts a POTS Episode capture: baseline, the climb, and a 60 second recovery
• A live HR monitor for symptomatic moments, with a rolling average and spike alerts
• Every result lands in your phone journal automatically, graded like everything else


BUILD YOUR PROTOCOL, KEEP YOUR STREAK

• Define your own "clean day": a hydration target, sleep hours, the meds and supplements to take, the triggers to avoid
• Clean days build a streak, with your longest run and a 30 day consistency rate


TRACK EVERYTHING THAT MOVES THE NEEDLE

• Water, meals and food triggers, meds and supplements, symptoms, activities, sleep, blood pressure, orthostatic stand tests, and digestion
• Add your own meds, supplements, activities, symptoms and triggers as custom types


FIND WHAT HELPS OR HURTS

• Analysis across days, weeks and months: spot the salt, sleep, pacing or medication changes that move your numbers
• On-device trigger and symptom trends over time
• Bring your own AI for a deeper read of your data, or a report for your doctor


YOUR DATA NEVER LEAVES YOUR PHONE

• 100% offline-first: no account, no cloud, no tracking, no ads
• Everything is stored on device; you own it and can export it anytime
• Reads HRV, resting HR, sleep and blood pressure from Apple Health, and writes back what you log, only when you ask


WHAT'S FREE, WHAT'S PRO

Free forever: journaling (sleep, meds, symptoms, triggers, hydration, meals), manual readings (blood pressure, resting heart rate, episodes), your daily Autonomic Score and outlook, the Apple Watch heart-rate monitor, one live HRV capture a day, 14 days of charts, and full export.

Autonomic Pro adds: unlimited live HRV captures, week / month / year progress views, full historical metric analysis, POTS stand testing and episode tracking, and AI insights and doctor reports.

Pro is $7.99/month or $49.99/year, billed to your Apple ID and renewing automatically until cancelled. Manage or cancel anytime in your App Store settings.


IMPORTANT: Autonomic is a personal journal and education tool, not a medical device. It does not diagnose, treat, or prevent any disease. Always discuss protocol or medication changes with your doctor.

## App Review notes (freemium submission)

> This version removes the hard paywall — the app is now fully usable without a
> purchase. On first launch it grants a 7-day local full-access window (no
> account, no store call), after which the core (journaling, daily score, manual
> readings, watch HR monitor, one live HRV capture per day, 14 days of charts,
> export) remains free indefinitely.
>
> Autonomic Pro (com.autonomic.journal.monthly / .yearly, one subscription
> group) unlocks unlimited HRV captures, full progress history, POTS testing,
> and AI reports. To reach the paywall: Insights tab → any AI report card, or
> Analysis tab → Week/Month/Year. "Restore purchase" is on the paywall card.
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

## Full description (3,808/4,000 chars)

See your nervous system actually recover.

Autonomic turns a Bluetooth heart rate strap — or just your finger over your phone's camera — into a full HRV lab in your pocket, then grades every reading against published research thresholds, so you finally know whether today was a good day or a warning sign.

Built for the long haul: long covid and post viral recovery, POTS and dysautonomia, ME/CFS, and anyone rebuilding their autonomic nervous system one day at a time.

Free to use, with no account, no ads and no tracking. Every install starts with 7 days of full access, then keeps the core free forever.


LIVE 5-MINUTE HRV, DONE RIGHT

• Capture beat-to-beat RR intervals live from a Bluetooth chest strap, or with your phone's camera using your finger
• A full screen guided session with a 5:00 ring, live heart rate, and a paced breathing visualizer (4/6 resonance breathing and more)
• Every metric computed on-device: SDNN, RMSSD, pNN50, mean RR, PNS & SNS index, Baevsky stress index, VLF/LF/HF power, LF/HF, coherence, and more
• Honest signal quality: artifacts are flagged and corrected, and a noisy reading refuses to fake a score instead of lying to you


EVERY NUMBER GRADED, NO BLACK BOX

• Every number is scored great / good / ok / warning / crash against real thresholds, with no mystery "readiness" black box
• One daily Autonomic Score that rolls up HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook for the day: what your body is ready for, from a full workout to a rest day


BUILD YOUR PROTOCOL, KEEP YOUR STREAK

• Define your own "clean day": a hydration target, sleep hours, the meds and supplements to take, the triggers to avoid
• Every day is matched against your protocol automatically, so you see at a glance whether you stayed on plan
• Clean days build a streak, with your longest run and a 30 day consistency rate: the discipline that actually drives recovery


TRACK EVERYTHING THAT MOVES THE NEEDLE

• Water, meals and food triggers, medications and supplements, symptoms, activities, sleep, blood pressure and orthostatic stand tests
• Digestion and bowel movements too: the whole picture, not just heart rate
• Make it yours: add your own meds, supplements, activities, symptoms and triggers as custom types


FIND WHAT HELPS OR HURTS

• Analysis across days, weeks and months: spot the salt, sleep, pacing or medication changes that move your numbers
• On-device trigger and symptom trends over time
• Milestones so recovery actually adds up
• Optional: bring your own AI for a deeper written read of your data, or to create a report to share with your doctor


YOUR DATA NEVER LEAVES YOUR PHONE

• 100% offline-first: no account, no cloud, no tracking, no ads
• Everything is stored on device; you own it and can export it anytime
• Reads HRV, resting HR, sleep and blood pressure from Health Connect, and writes back what you log, only when you ask


WHAT'S FREE, WHAT'S PRO

Free forever: journaling (sleep, meds, symptoms, triggers, hydration, meals, activities), manual readings (blood pressure, resting heart rate, episodes), your daily Autonomic Score and outlook, one live HRV capture a day, 14 days of progress charts, and backup and export.

Autonomic Pro adds: unlimited live HRV captures, week / month / year progress views, full historical metric analysis, POTS stand testing and episode tracking, and AI insights and doctor reports.

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

If Play flags the Health Connect permissions, the justification is: HRV, resting
heart rate, sleep and blood pressure are **read** to display and grade in the
user's own on-device journal. HRV, heart rate, resting heart rate and blood
pressure are **written back** when the user explicitly saves a reading; sleep is
read-only. No transmission, no ads, no analytics, no third-party sharing.

(Read/write split is `READ_TYPES` / `WRITE_TYPES` in
`src/lib/health/healthConnect.ts` — keep this paragraph in sync with them, since
requesting a write permission you don't justify is a Play review rejection.)
