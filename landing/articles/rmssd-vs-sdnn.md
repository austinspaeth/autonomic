---
title: "RMSSD vs SDNN: Why Do My Watch and Ring Show Different HRV?"
slug: rmssd-vs-sdnn
published: true
date: 2026-11-19
updated: 2026-11-19
reviewed: 2026-11-19
author: "Austin Spaeth"
question: "RMSSD vs SDNN: why do my watch and ring show different HRV?"
summary: "Your Apple Watch says one HRV number and your ring or Garmin says another, sometimes far apart. That is mostly not an error: the devices use different HRV formulas, measure at different moments and average differently. Here is what RMSSD and SDNN each measure, which number each device shows and how to compare your readings fairly."
description: "RMSSD vs SDNN: why your watch and ring show different HRV, which formula each device uses, why the numbers can't be converted and how to compare them fairly."
keywords: "rmssd vs sdnn, apple watch hrv vs oura, why is my hrv different on different devices, sdnn vs rmssd which is better, apple watch sdnn, oura rmssd, garmin hrv vs apple watch, convert sdnn to rmssd"
tldr: "Your watch and ring disagree mainly because they are not measuring the same thing: Apple Watch reports HRV as SDNN, while Oura, Fitbit and Pixel report RMSSD, and each device measures at different moments for different lengths of time. RMSSD tracks the fast, beat-to-beat changes driven mostly by the vagus nerve, while SDNN measures the overall spread of your beat intervals, so the two can move differently on the same day. There is no reliable way to convert one into the other. Pick one device and one metric, measure the same way each time and compare yourself with your own baseline."
app:
  feature: hrv-readings
  hook: "RMSSD and SDNN from the same beats."
  line: "Autonomic shows RMSSD, SDNN and pNN50 side by side from one reading, taken with a chest strap, your phone camera or a watch, so you always know which number you are looking at."
photoLocation: "https://images.unsplash.com/photo-1764169604706-d19a7cfdf823?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Barnaby Woodrow / Unsplash"
categories:
  - hrv
  - basics
faq:
  - q: "Is RMSSD or SDNN better?"
    a: "Neither is better in every situation. RMSSD is the more common choice for day-to-day recovery tracking because it mostly reflects the vagus nerve and holds up well on short readings. SDNN is a broader measure of overall variability and is what Apple Watch uses. The best metric is the one you measure the same way every time."
  - q: "Can I convert SDNN to RMSSD?"
    a: "No. The two are related, but the gap between them changes with breathing, posture and the length of the reading. Two readings can even rank in opposite order on the two metrics. Any converter that turns an Apple Watch SDNN into an RMSSD is guessing."
  - q: "Why is my Oura HRV higher than my Apple Watch HRV?"
    a: "Oura reports RMSSD averaged across five-minute samples while you sleep, while Apple Watch reports SDNN from short readings taken whenever you happen to be still, often while you are sitting or upright during the day. Different formula, different time, different posture. A higher ring number does not mean the watch is wrong."
  - q: "Which HRV number should I track with POTS?"
    a: "Pick one device and one metric and stick with it. If you take a morning reading, take it at the same time and in the same position each day, because standing lowers HRV and that effect is often exaggerated in POTS. Watch your weekly average against your own baseline rather than chasing a single number."
  - q: "Does Apple Watch measure RMSSD?"
    a: "Apple Watch itself reports SDNN. It does save the underlying beat-to-beat intervals to Apple Health for some readings, and apps that read those intervals, or take their own reading, can calculate RMSSD from the same beats."
social:
  x: |
    Why does your Apple Watch show a different HRV than your ring? They use different formulas: Apple reports SDNN, Oura, Fitbit and Pixel report RMSSD, and each measures at different times. You can't convert one to the other. How to compare fairly: https://autonomic.care/insights/hrv/rmssd-vs-sdnn/?utm_source=x&utm_medium=social&utm_campaign=rmssd-vs-sdnn #HRV
  facebook: |
    If you wear an Apple Watch and a ring, or switched from one to the other, you have probably seen two very different HRV numbers for the same night. It is easy to assume one of them is broken. Usually neither is. Apple Watch reports SDNN, the overall spread of your heartbeat intervals, while Oura, Fitbit and Pixel report RMSSD, the fast beat-to-beat changes driven mostly by the vagus nerve. They also measure at different moments, for different lengths of time.

    We explained what each number means, which one each device shows, why there is no reliable conversion between them and how to compare your readings fairly, especially with POTS where posture changes everything. Which device do you track your HRV with? https://autonomic.care/insights/hrv/rmssd-vs-sdnn/?utm_source=facebook&utm_medium=social&utm_campaign=rmssd-vs-sdnn #HRV #POTS #LongCovid
  reddit: |
    Subreddit: r/AutonomicApp
    Title: Why your Apple Watch and your ring show different HRV (RMSSD vs SDNN)

    I kept seeing posts asking why Apple Watch HRV is so much lower than Oura or Garmin, so I dug into it. The short version: they aren't measuring the same thing. Apple Watch reports SDNN (the overall spread of your beat intervals). Oura, Fitbit and Pixel say they use RMSSD (the fast beat-to-beat changes, mostly vagal). On top of that, Apple takes short readings whenever you're still, Oura averages five-minute samples all night, and WHOOP uses a short window late in sleep.

    There's no reliable way to convert SDNN to RMSSD, because the gap between them shifts with breathing, posture and reading length. Two readings can even rank in opposite order on the two metrics. What actually helps: pick one device and one metric, measure at the same time and position, and compare against your own baseline. Not medical advice. Write-up with sources: https://autonomic.care/insights/hrv/rmssd-vs-sdnn/?utm_source=reddit&utm_medium=social&utm_campaign=rmssd-vs-sdnn
---

You check your Apple Watch and it says your HRV was 31 ms. Your ring says 52 ms for the same night. A friend with a Garmin says theirs is 70 and asks why yours is so low. It is natural to wonder which device is broken. **Usually neither is: Apple Watch reports HRV as SDNN, most rings and other trackers report RMSSD, and each device measures at different moments for different lengths of time, so the numbers were never meant to match.** RMSSD vs SDNN is the first thing to understand, and the rest follows from it.

## What is the difference between RMSSD and SDNN?

Both numbers start from the same raw material: the gaps, in milliseconds, between one heartbeat and the next. They just ask different questions of those gaps.

- **RMSSD** (root mean square of successive differences) looks at how much each gap differs from the one right before it. It captures fast, beat-to-beat changes. A review of HRV metrics calls it "the primary time-domain measure" for the vagally driven part of HRV ([Shaffer and Ginsberg, 2017](https://doi.org/10.3389/fpubh.2017.00258)). The vagus nerve is the main brake of your nervous system, so RMSSD is often read as a recovery signal. There is more on it in [RMSSD and pNN50 explained](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/).
- **SDNN** (standard deviation of normal-to-normal intervals) looks at how spread out all the gaps in the reading are, whatever order they came in. The same review notes that both branches of the nervous system contribute to it. It blends fast and slow rhythms into one broader number, covered in detail in [what SDNN means](/insights/basics/what-is-sdnn-in-hrv/).

The easiest way to see the difference is with two made-up sets of eight heartbeats.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 270" role="img" aria-label="Two sets of eight heartbeat intervals. The first zigzags up and down from beat to beat and gives an RMSSD of 48 milliseconds and an SDNN of 25 milliseconds. The second rises steadily with no zigzag and gives an RMSSD of 15 milliseconds and an SDNN of 37 milliseconds.">
    <rect x="10" y="10" width="340" height="250" rx="10" fill="none" stroke="var(--line)"/>
    <polyline points="34.0,134.8 75.7,179.6 117.4,123.6 159.1,185.2 200.9,129.2 242.6,177.4 284.3,125.8 326.0,181.8" fill="none" stroke="var(--dim-2)" stroke-width="2"/>
    <circle cx="34.0" cy="134.8" r="5" fill="#54d98a"/>
    <circle cx="75.7" cy="179.6" r="5" fill="#54d98a"/>
    <circle cx="117.4" cy="123.6" r="5" fill="#54d98a"/>
    <circle cx="159.1" cy="185.2" r="5" fill="#54d98a"/>
    <circle cx="200.9" cy="129.2" r="5" fill="#54d98a"/>
    <circle cx="242.6" cy="177.4" r="5" fill="#54d98a"/>
    <circle cx="284.3" cy="125.8" r="5" fill="#54d98a"/>
    <circle cx="326.0" cy="181.8" r="5" fill="#54d98a"/>
    <text x="30" y="40" font-family="Space Grotesk, sans-serif" font-size="14" fill="var(--dim)">Fast wobble, beat to beat</text>
    <text x="30" y="230" font-family="Space Mono, monospace" font-size="13" fill="var(--dim)">RMSSD 48 ms · SDNN 25 ms</text>
<rect x="370" y="10" width="340" height="250" rx="10" fill="none" stroke="var(--line)"/>
    <polyline points="394.0,190.8 435.7,174.0 477.4,157.2 519.1,140.4 560.9,123.6 602.6,106.8 644.3,90.0 686.0,73.2" fill="none" stroke="var(--dim-2)" stroke-width="2"/>
    <circle cx="394.0" cy="190.8" r="5" fill="#e03127"/>
    <circle cx="435.7" cy="174.0" r="5" fill="#e03127"/>
    <circle cx="477.4" cy="157.2" r="5" fill="#e03127"/>
    <circle cx="519.1" cy="140.4" r="5" fill="#e03127"/>
    <circle cx="560.9" cy="123.6" r="5" fill="#e03127"/>
    <circle cx="602.6" cy="106.8" r="5" fill="#e03127"/>
    <circle cx="644.3" cy="90.0" r="5" fill="#e03127"/>
    <circle cx="686.0" cy="73.2" r="5" fill="#e03127"/>
    <text x="390" y="40" font-family="Space Grotesk, sans-serif" font-size="14" fill="var(--dim)">Slow drift, no wobble</text>
    <text x="390" y="230" font-family="Space Mono, monospace" font-size="13" fill="var(--dim)">RMSSD 15 ms · SDNN 37 ms</text>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 480" role="img" aria-label="Two sets of eight heartbeat intervals. The first zigzags up and down from beat to beat and gives an RMSSD of 48 milliseconds and an SDNN of 25 milliseconds. The second rises steadily with no zigzag and gives an RMSSD of 15 milliseconds and an SDNN of 37 milliseconds.">
    <rect x="10" y="10" width="340" height="220" rx="10" fill="none" stroke="var(--line)"/>
    <polyline points="34.0,119.2 75.7,154.4 117.4,110.4 159.1,158.8 200.9,114.8 242.6,152.6 284.3,112.2 326.0,156.2" fill="none" stroke="var(--dim-2)" stroke-width="2"/>
    <circle cx="34.0" cy="119.2" r="5" fill="#54d98a"/>
    <circle cx="75.7" cy="154.4" r="5" fill="#54d98a"/>
    <circle cx="117.4" cy="110.4" r="5" fill="#54d98a"/>
    <circle cx="159.1" cy="158.8" r="5" fill="#54d98a"/>
    <circle cx="200.9" cy="114.8" r="5" fill="#54d98a"/>
    <circle cx="242.6" cy="152.6" r="5" fill="#54d98a"/>
    <circle cx="284.3" cy="112.2" r="5" fill="#54d98a"/>
    <circle cx="326.0" cy="156.2" r="5" fill="#54d98a"/>
    <text x="30" y="40" font-family="Space Grotesk, sans-serif" font-size="13" fill="var(--dim)">Fast wobble, beat to beat</text>
    <text x="30" y="200" font-family="Space Mono, monospace" font-size="12" fill="var(--dim)">RMSSD 48 ms · SDNN 25 ms</text>
<rect x="10" y="250" width="340" height="220" rx="10" fill="none" stroke="var(--line)"/>
    <polyline points="34.0,403.2 75.7,390.0 117.4,376.8 159.1,363.6 200.9,350.4 242.6,337.2 284.3,324.0 326.0,310.8" fill="none" stroke="var(--dim-2)" stroke-width="2"/>
    <circle cx="34.0" cy="403.2" r="5" fill="#e03127"/>
    <circle cx="75.7" cy="390.0" r="5" fill="#e03127"/>
    <circle cx="117.4" cy="376.8" r="5" fill="#e03127"/>
    <circle cx="159.1" cy="363.6" r="5" fill="#e03127"/>
    <circle cx="200.9" cy="350.4" r="5" fill="#e03127"/>
    <circle cx="242.6" cy="337.2" r="5" fill="#e03127"/>
    <circle cx="284.3" cy="324.0" r="5" fill="#e03127"/>
    <circle cx="326.0" cy="310.8" r="5" fill="#e03127"/>
    <text x="30" y="280" font-family="Space Grotesk, sans-serif" font-size="13" fill="var(--dim)">Slow drift, no wobble</text>
    <text x="30" y="440" font-family="Space Mono, monospace" font-size="12" fill="var(--dim)">RMSSD 15 ms · SDNN 37 ms</text>
  </svg>
  <figcaption>Illustration with made-up beats. The zigzag on the left has a high RMSSD and a low SDNN. The steady drift on the right has the opposite. Neither number is wrong; they describe different shapes.</figcaption>
</figure>

On the left, every beat swings away from the last one, so RMSSD is high, but the beats never stray far from the middle, so SDNN is modest. On the right, the beats drift steadily slower with no beat-to-beat swing, so RMSSD is low while SDNN is higher. Real readings are messier, but the point holds: the two numbers can disagree about the very same heartbeats.

## Which HRV number does each device show?

Here is what each company says about its own number, from the pages we checked in November 2026.

<div class="table-wrap">

| Device | Formula | When it measures | What you see |
|---|---|---|---|
| Apple Watch | SDNN | Short background readings, by default about every four hours, only when you are still enough; also during Breathe sessions | Individual readings in the Health app |
| Oura ring | RMSSD | Five-minute samples throughout the night, during sleep only | The nightly average, plus the night's maximum |
| Fitbit and Pixel Watch | RMSSD | During sleep; most metrics need at least three hours of good sleep | Your number against a personal range built from up to 30 days |
| Garmin | Not stated on the pages we checked | While you sleep | A seven-day average against your baseline, after three weeks of sleep data |
| WHOOP | Not stated on the pages we checked | A short window late in sleep, usually the last five minutes of the last slow-wave sleep period | One value that feeds the Recovery score |
| Autonomic | RMSSD, SDNN and pNN50 | When you take a reading | All three, side by side, from the same beats |

</div>

Sources: [Apple's Watch heart rate paper](https://www.apple.com/health/pdf/Heart_Rate_Calorimetry_Activity_on_Apple_Watch_November_2024.pdf), [Oura's HRV help page](https://support.ouraring.com/hc/en-us/articles/360025441974) and [white paper](https://ouraring.com/blog/wp-content/uploads/2024/02/Oura_Innovating_Health_White_Paper_v3.pdf), [Google's Fitbit health metrics help](https://support.google.com/fitbit/answer/14236917), [Garmin's HRV status manual](https://www8.garmin.com/manuals/webhelp/GUID-3D8FCD7B-7C56-43A9-8665-5CDE4FFD7DF3/EN-US/GUID-9282196F-D969-404D-B678-F48A13D8D0CB.html) and [WHOOP's research FAQ](https://www.sensorlab.arizona.edu/sites/default/files/2023-05/WHOOP%20Unite%20Research%20FAQs_0.pdf).

So an Apple Watch reading and an Oura reading differ in formula, in time of day, in position and in how many minutes they cover. Comparing them is less like comparing two thermometers and more like comparing your temperature at noon with your temperature at 3 a.m. taken a different way.

## Why don't the numbers match, even on the same night?

The formula is the biggest reason, but it is not the only one.

**Timing and position.** Overnight readings are taken lying down and asleep, when the vagal brake is usually strongest. Apple's background readings happen whenever you are still, which can mean sitting at a desk or standing in line. HRV falls when you are upright, and in POTS that drop is often exaggerated, as explained in [HRV standing vs lying down](/insights/hrv/hrv-standing-vs-lying-down-posture/).

**Reading length.** SDNN grows as a reading gets longer, because a longer window catches more slow drifts. The HRV review is blunt about it: it is "inappropriate to compare metrics like SDNN when they are calculated from epochs of different length" ([Shaffer and Ginsberg, 2017](https://doi.org/10.3389/fpubh.2017.00258)). A one-minute SDNN and a five-minute SDNN are not the same measurement.

**Averaging.** Oura's headline number is the average of every five-minute sample in the night. WHOOP's comes from one short window late in sleep. Garmin's status is built on a seven-day average. The same body on the same night can produce different values just from which minutes are used.

**Breathing.** In short resting readings, the review notes that most of SDNN's variation comes from the breathing-linked rise and fall of heart rate, "especially with slow, paced breathing." That is one reason an Apple Breathe session can give a higher SDNN than a background reading a few minutes earlier.

**Sensor quality.** Wrist and finger sensors estimate each beat from blood flow, not from the heart's electrical signal, and they differ in how well they do it. In a 2025 study comparing five wearables with an ECG during sleep, the Oura rings agreed most closely and wrist devices less well ([Dial et al., 2025](https://doi.org/10.14814/phy2.70527)). Our guide to [how accurate HRV wearables are](/insights/research/how-accurate-are-hrv-wearables/) covers the numbers.

## Is RMSSD or SDNN better for POTS and long COVID?

For tracking day-to-day recovery, RMSSD is the more common choice, for two practical reasons.

First, it is more tightly tied to the vagus nerve, which is what most people with POTS, long COVID or ME/CFS are trying to watch recover. Second, it holds up on short readings. In a study of 3,387 adults, even a single 10-second recording gave a valid RMSSD, while SDNN needed at least 30 seconds, and nothing longer than 120 seconds was needed for either ([Munoz et al., 2015](https://doi.org/10.1371/journal.pone.0138921)).

That does not make SDNN useless. It is a broader picture of overall variability, and when recorded over 24 hours it is the long-standing measure for cardiac risk. If your Apple Watch is the device you actually wear, its SDNN trend is still meaningful, as long as you compare it with itself. Our [Apple Watch HRV guide](/insights/hrv/apple-watch-hrv-pots-long-covid/) covers how to get readings from it that you can trust.

| | RMSSD | SDNN |
|---|---|---|
| What it captures | Fast, beat-to-beat changes | Overall spread of all beats |
| Main driver | Mostly the vagus nerve | Both branches of the nervous system |
| Shortest valid reading | About 10 seconds | About 30 seconds |
| Typical 5-minute value | 42 ms on average | 50 ms on average |

The typical values come from a review of short-term HRV in healthy adults, with wide ranges either side: 19 to 75 ms for RMSSD and 32 to 93 ms for SDNN ([Nunan et al., 2010](https://pubmed.ncbi.nlm.nih.gov/20663071/), as summarised by Shaffer and Ginsberg). They are not targets. Your own baseline matters far more.

## Can you convert SDNN to RMSSD?

No, not reliably. The two numbers tend to rise and fall together in calm resting readings, but the gap between them changes with breathing rate, posture, reading length and how much slow drift is in the recording. The figure above shows two readings that rank in opposite order on the two metrics. Any calculator that turns an Apple Watch SDNN into an "Oura equivalent" RMSSD is making a guess.

What you can do is calculate both from the same heartbeats. Apple Watch saves the beat-to-beat intervals behind some of its readings to Apple Health, and a chest strap or a phone camera reading gives you the beats directly. With the beats in hand, RMSSD and SDNN are just two calculations on the same data, and you can see both honestly.

<div class="callout callout-tip"><strong>Switching devices?</strong> Wear the old and the new one together for a week or two before you retire the old one. You will learn where the new baseline sits, instead of mistaking a change of device for a change in your health.</div>

## How should you compare HRV readings fairly?

The rules are simple, and they matter more than which device you own.

1. **Choose one device and one metric** as your main trend. Use any others as a cross-check, not a second scoreboard.
2. **Measure the same way each time.** Same time of day, same position, same breathing. A morning reading lying down before you get up is the easiest to repeat. See [the best time of day to measure HRV](/insights/hrv/best-time-of-day-to-measure-hrv/).
3. **Compare yourself with yourself.** Build a baseline over two to four weeks and watch your weekly average against it, as described in [how to build an HRV baseline](/insights/hrv/hrv-baseline-how-to-build-and-use-it/).
4. **Expect day-to-day noise.** A single low reading is often just that. A drop that lasts several days, especially alongside feeling worse, is more worth noticing.
5. **Never compare your number with someone else's** on a different device. Different formula, different timing, different body.

## When should a change in HRV worry you?

HRV cannot diagnose anything, and a low number on its own is not a reason to panic. A drop that lasts several days alongside feeling worse can be an early sign of illness, overexertion or poor sleep, and it is worth easing off and paying attention, as covered in [HRV drops when you are sick](/insights/hrv/hrv-drops-when-sick-early-warning/).

See a doctor if you have new or worsening fainting, chest pain, a racing heart at rest that does not settle, or palpitations that feel different from usual, whatever your HRV says. And if your device warns of an irregular rhythm, follow up on that warning rather than looking at the HRV number.

## The bottom line

Your watch and ring disagree because they are measuring different things in different ways. Apple Watch reports SDNN from short readings taken whenever you are still. Oura, Fitbit and Pixel report RMSSD from sleep, each with its own window and averaging. RMSSD tracks the fast, vagally driven changes that most recovery tracking relies on, and it holds up on short readings. SDNN is a broader measure of overall variability. Neither converts into the other. Pick one device and one metric, measure the same way each time and judge your trend against your own baseline.

<div class="callout callout-warn"><strong>Not medical advice.</strong> This article is educational and does not replace care from a clinician who knows your history. Talk to your doctor before changing your activity, treatment or medication. If your symptoms are new, worsening or frightening, get medical care.</div>

## Sources

- Shaffer F, Ginsberg JP. [An overview of heart rate variability metrics and norms](https://doi.org/10.3389/fpubh.2017.00258). *Frontiers in Public Health*, 2017.
- Munoz ML, van Roon A, Riese H, et al. [Validity of (ultra-)short recordings for heart rate variability measurements](https://doi.org/10.1371/journal.pone.0138921). *PLoS One*, 2015.
- Nunan D, Sandercock GRH, Brodie DA. [A quantitative systematic review of normal values for short-term heart rate variability in healthy adults](https://pubmed.ncbi.nlm.nih.gov/20663071/). *Pacing and Clinical Electrophysiology*, 2010.
- Dial MB, Hollander ME, Vatne EA, et al. [Validation of nocturnal resting heart rate and heart rate variability in consumer wearables](https://doi.org/10.14814/phy2.70527). *Physiological Reports*, 2025.
- Apple. [Using Apple Watch to measure heart rate, calorimetry, and activity](https://www.apple.com/health/pdf/Heart_Rate_Calorimetry_Activity_on_Apple_Watch_November_2024.pdf). November 2024.
- Oura. [Heart rate variability](https://support.ouraring.com/hc/en-us/articles/360025441974) (help centre) and [Innovating health white paper](https://ouraring.com/blog/wp-content/uploads/2024/02/Oura_Innovating_Health_White_Paper_v3.pdf).
- Google. [Fitbit health metrics](https://support.google.com/fitbit/answer/14236917) (help centre).
- Garmin. [Heart rate variability status](https://www8.garmin.com/manuals/webhelp/GUID-3D8FCD7B-7C56-43A9-8665-5CDE4FFD7DF3/EN-US/GUID-9282196F-D969-404D-B678-F48A13D8D0CB.html) (owner's manual).
- WHOOP. [WHOOP Unite research FAQs](https://www.sensorlab.arizona.edu/sites/default/files/2023-05/WHOOP%20Unite%20Research%20FAQs_0.pdf), hosted by the University of Arizona.
