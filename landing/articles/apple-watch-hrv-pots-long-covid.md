---
title: "Apple Watch HRV with POTS or Long COVID: Why Your Number Looks Low and How to Read It"
slug: apple-watch-hrv-pots-long-covid
published: true
summary: "Why Apple Watch HRV looks low or erratic with POTS or long COVID, how SDNN differs from RMSSD, and how to get a morning reading you can track."
description: "Apple Watch HRV looks low with POTS or long COVID? Learn why (SDNN vs RMSSD, timing, posture), how accurate it is, and how to take a reading you can trust."
keywords: "Apple Watch HRV, Apple Watch HRV low, Apple Watch HRV POTS, Apple Watch HRV long COVID, Apple Watch SDNN, SDNN vs RMSSD, is Apple Watch HRV accurate, how to measure HRV on Apple Watch, Apple Watch Mindfulness HRV, normal Apple Watch HRV"
date: 2026-10-27
updated: 2026-10-27
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1485206542366-16d53f333d1c?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Tyler Hendy / Unsplash"
tldr: "Apple Watch reports HRV as SDNN, while most guides, charts and many other wearables use RMSSD, so the numbers are not directly comparable. Background readings are short and taken at irregular times, often in different positions, which matters a great deal in POTS. A low number on its own tells you very little; what matters is how today compares with your own baseline. For a reading you can track, measure at the same time each morning, in the same position, while still, by starting a short Mindfulness session or a longer guided reading."
categories:
  - hrv
  - pots
faq:
  - q: "Why is my Apple Watch HRV so low?"
    a: "Often because it is measured as SDNN at irregular times and positions, which makes it hard to compare with charts built on RMSSD. Age, sleep, illness and upright posture also lower it. Your own trend matters more than the number itself."
  - q: "Does Apple Watch use SDNN or RMSSD?"
    a: "Apple Watch reports SDNN. It also saves the beat-to-beat data to Apple Health, which some apps use to calculate RMSSD."
  - q: "What is a normal Apple Watch HRV for someone with POTS?"
    a: "There is no reliable normal range. HRV varies widely between people, and research comparing POTS with healthy groups has been mixed. Track your own morning baseline instead."
  - q: "How do I make my Apple Watch measure HRV?"
    a: "Start a Breathe session in the Mindfulness app and stay still for at least a minute, or use an app that runs a guided HRV reading. Do it at the same time and in the same position each day."
  - q: "Is a chest strap better than Apple Watch for HRV?"
    a: "A chest strap gives cleaner beat-to-beat data, especially during movement. For a still morning reading, the Watch does reasonably well, and consistency matters more than the device."
---

If you live with POTS or long COVID and wear an Apple Watch, you have probably opened the Health app, seen an HRV number that looks alarmingly low or jumps around for no reason, and wondered what it means. Here is how the Watch actually measures heart rate variability, why its number often looks different from what you read online, and how to get a reading you can trust enough to track.

## How Apple Watch measures HRV

According to [Apple's own technical paper](https://www.apple.com/health/pdf/Heart_Rate_Calorimetry_Activity_on_Apple_Watch_November_2024.pdf), the Watch calculates HRV as SDNN, the standard deviation of the time between normal heartbeats. It uses the optical sensor on the back of the Watch to detect each pulse, removes beats it judges to be irregular, and saves both the SDNN value and the beat-to-beat data to Apple Health.

Readings come from two places:

- **Background readings.** The Watch tries to take a short reading roughly every four hours by default, but only when you are still enough. That makes the timing irregular, and it also means many readings happen at night or while you are sitting.
- **Readings you start.** When you use the Breathe session in the Mindfulness app, the Watch records HRV for that session. As [this TidBITS explainer](https://tidbits.com/2022/02/10/the-secret-of-the-apple-watchs-mindfulness-app/) notes, starting a session right after waking usually, though not always, produces a reading.

You can see the results in the Health app under Heart, then Heart Rate Variability, by day, week, month or year.

## Why your number may look low

### It is a different metric from most of what you read

Most HRV guides, population charts and recovery scores are built on RMSSD, which focuses on the fastest beat-to-beat changes. SDNN looks at the overall spread of beat intervals. The two are related but not interchangeable, so an SDNN value from your Watch cannot be compared directly with an RMSSD chart, with another app's number, or with a friend's Oura or Garmin reading. If you want the detail, see the section on metrics in [the complete guide to HRV](/insights/hrv/hrv-complete-guide/).

SDNN is not a worse choice, just a different one. A [West Virginia University simulation study](https://www.htworld.co.uk/?p=28802) suggested that SDNN may hold up better than RMSSD when HRV is estimated from the wrist rather than from an ECG.

### Position changes everything in POTS

HRV falls when you are upright, because standing shifts the nervous system away from the vagal brake. In POTS that shift is often exaggerated. A background reading taken while you sit up in bed will not match one taken lying flat, and one taken after you have been on your feet will look worse again. Because the Watch picks its own moments, a run of low numbers may partly reflect when and how you happened to be still.

### Short readings are noisy

Background readings are brief. A short window of beats, a little movement, a loose band, cold hands, or tattoo ink under the sensor can all reduce signal quality, and Apple's paper notes that a high number of irregular beats can also affect SDNN. One odd reading is often just that.

### Everyday factors pull it down

Age, poor sleep, alcohol, a late meal, dehydration, infection, a crash, the menstrual cycle and some medications, including beta blockers, all move HRV. The piece on [sleep stages and HRV](/insights/recovery/sleep-stages-and-hrv-deep-sleep-rem/) explains why overnight numbers can swing so much.

### Your condition may or may not be part of it

It is tempting to assume that POTS or long COVID simply means low HRV. The research is less clear. A [2026 meta-analysis](https://s4me.info/threads/neurocardiac-autonomic-dysfunction-in-patients-with-post-covid-19-condition-a-systematic-review-and-meta-analysis-2026-schoene-et-al.49313) of 11 studies found only a trend toward lower HRV in post-COVID condition, and studies in POTS have produced mixed results. A low number is not proof of a problem, and a normal one is not proof that you are fine.

## Is Apple Watch HRV accurate enough?

For resting readings, it is reasonably good. In a [2018 validation study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6111985/), Apple Watch HRV in 20 healthy volunteers agreed very closely with a Polar chest strap for time-based measures such as SDNN and RMSSD during relaxed sitting, though the Watch data had small gaps. Two caveats apply: that study was in healthy people, and it was done with people sitting still on purpose, not with the irregular background readings most of us rely on.

The practical takeaway is that the Watch can give a trustworthy reading if you give it trustworthy conditions. If you want the cleanest possible data, a chest strap is still the reference point; see the comparison of [HRV chest straps](/insights/hrv/best-hrv-chest-strap-polar-h10-coospo-h808s/).

<div class="table-wrap">

| Reading | When it happens | Position | Good for |
| --- | --- | --- | --- |
| Background SDNN | Irregular, roughly every few hours when still | Whatever you were doing | A rough overall picture |
| Morning Mindfulness session | When you start it, ideally right after waking | Your choice, kept the same every day | A comparable daily number |
| Guided reading of several minutes | When you start it | Your choice, kept the same every day | The steadiest daily number from a watch |
| Chest strap reading | When you start it | Your choice, kept the same every day | The most accurate beat-to-beat data |

</div>

## How to get a reading you can trust

### Pick one moment and keep it

The single most useful change is to measure at the same time every day. Right after waking, before you sit up, check your phone or have coffee, works best for most people. The article on [the best time of day to measure HRV](/insights/hrv/best-time-of-day-to-measure-hrv/) explains why.

### Keep the position the same

Lying or sitting both work. Choose one and stick with it. With POTS, lying is usually the more stable choice, because even sitting can trigger an orthostatic response on a bad day.

### Start the reading yourself

Open the Mindfulness app and start a one-minute Breathe session, or use an app that runs a longer guided reading from the Watch. Stay completely still. If you want a number that reflects your resting state rather than slow breathing, breathe normally instead of following the deep-breathing prompts, since slow breathing raises HRV by itself.

### Wear it properly

Wear the Watch snug but comfortable, a finger's width above the wrist bone, and keep the sensor clean. If your hands run cold, warm them first, because reduced blood flow at the wrist weakens the signal.

## How to read your numbers with POTS or long COVID

Once you have a consistent morning reading, ignore population charts and compare against yourself.

- **Use a rolling baseline.** A seven-day average of your morning readings is a practical reference.
- **Look for runs, not single days.** One low morning means little. Two or three mornings below your baseline deserve attention, especially if they come after a busy few days.
- **Read it alongside resting heart rate.** HRV down and resting heart rate up together is a clearer signal of strain than either alone. See the piece on [HRV versus resting heart rate](/insights/hrv/hrv-vs-resting-heart-rate/).
- **Do not compare across devices.** If you switch from the Watch to a strap or another app, start a new baseline.
- **Connect it to what you did.** In long COVID and ME/CFS, the effect of exertion often shows up one to three days later, so log what you did in the days before a low reading.

## When to involve a clinician

Apple Watch HRV is a wellness measurement, not a diagnosis. Talk to your clinician if you see a sustained drop in HRV together with new or worsening symptoms, if your Watch gives you irregular rhythm notifications, or if you have palpitations that do not settle. Seek urgent care for chest pain, fainting, severe shortness of breath, or a very fast or irregular heartbeat at rest.

If you are being assessed for POTS, your Watch can still help. A log of morning readings and heart rate on standing gives your clinician a picture that a single appointment cannot.

## The bottom line

Your Apple Watch measures HRV as SDNN, at moments it chooses, in whatever position you happen to be in. That is why the number can look low or erratic, especially with POTS. It does not make the Watch useless. Take your own reading at the same time and in the same position each morning, compare it only with your own baseline, and read it alongside your resting heart rate and how you feel. That turns a confusing number into something you can actually use.

<div class="callout callout-tip">
  <strong>Track your recovery with Autonomic.</strong> A private, offline journal that scores your daily HRV, BP and orthostatic readings against medical thresholds. Autonomic works with Apple Watch: it can bring in the HRV your Watch saves to Apple Health, run a guided five-minute reading that shows both RMSSD and SDNN, and put today's numbers on a Watch complication. Everything stays on your phone, with no account. <a href="/">See how it works →</a>
</div>

## Frequently asked questions

**Why is my Apple Watch HRV so low?** Often because it is measured as SDNN at irregular times and positions, which makes it hard to compare with charts built on RMSSD. Age, sleep, illness and upright posture also lower it. Your own trend matters more than the number itself.

**Does Apple Watch use SDNN or RMSSD?** Apple Watch reports SDNN. It also saves the beat-to-beat data to Apple Health, which some apps use to calculate RMSSD.

**What is a normal Apple Watch HRV for someone with POTS?** There is no reliable normal range. HRV varies widely between people, and research comparing POTS with healthy groups has been mixed. Track your own morning baseline instead.

**How do I make my Apple Watch measure HRV?** Start a Breathe session in the Mindfulness app and stay still for at least a minute, or use an app that runs a guided HRV reading. Do it at the same time and in the same position each day.

**Is a chest strap better than Apple Watch for HRV?** A chest strap gives cleaner beat-to-beat data, especially during movement. For a still morning reading, the Watch does reasonably well, and consistency matters more than the device.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data. It is not intended to diagnose or treat any condition. Talk to your clinician about any symptoms that concern you.
</div>
