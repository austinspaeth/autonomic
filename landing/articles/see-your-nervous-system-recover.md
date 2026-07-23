---
title: "See Your Nervous System Recover"
slug: see-your-nervous-system-recover
published: true
summary: "Dysautonomia is invisible, and that's half of what makes it so hard: you can't see the illness, and you can't see the recovery either. Autonomic is the app that makes recovery visible: HRV, blood pressure, stand tests and sleep, scored, trended, and kept private on your phone."
description: "A tour of the Autonomic app: how it turns HRV, blood pressure, orthostatic stand tests and sleep into a visible recovery trend for POTS, dysautonomia and long COVID. Scored against medical thresholds, charted against your baseline, private and offline on iPhone and Android."
keywords: "Autonomic app, see nervous system recover, HRV tracking app, POTS recovery app, dysautonomia app, long COVID tracker, orthostatic stand test app, HRV baseline, private health app, offline health journal"
date: 2026-07-23
updated: 2026-07-23
author: "Austin Spaeth"
photoLocation: "https://autonomic.care/og.png"
tldr: "Recovery from POTS, dysautonomia and long COVID is real but invisible: it moves in months while you live in days, so on any given morning you can't tell whether you're actually getting better. Autonomic makes it visible. You log HRV, heart rate, blood pressure, stand tests, sleep and symptoms; the app scores every reading against medical thresholds, charts it against your personal rolling baseline, warns you when a crash pattern is forming, and turns months of data into a doctor-ready report. Everything stays on your phone: no account, no cloud, no data leaving your device."
categories:
  - app
  - recovery
faq:
  - q: "How does Autonomic show whether I'm recovering?"
    a: "Autonomic charts every metric against your personal rolling baseline, so instead of judging yourself by this morning's number you see the line underneath the noise. Rising HRV, a falling resting heart rate, a shrinking stand-test jump and steadier sleep are the signatures of autonomic recovery, and the app puts all four on screen so a trend that moves in months becomes something you can actually watch."
  - q: "What can I track in the Autonomic app?"
    a: "Readings like HRV, resting heart rate, blood pressure, oxygen saturation and guided orthostatic stand tests, plus sleep, symptoms, meds and supplements, meals, hydration, triggers and activities. Everything lives in one journal, so the numbers and the context that explains them stay side by side."
  - q: "Do I need an Apple Watch or a chest strap to use it?"
    a: "No. Autonomic can capture live HRV with a Bluetooth chest strap or your phone's camera, import from the health data already on your phone, or take readings you type in from any cuff, ring or oximeter. It scores whatever you record; better hardware sharpens the data but nothing is required to start."
  - q: "Is Autonomic private?"
    a: "Yes, by architecture rather than by policy. The app is offline-first: your journal is stored on your device, there is no account and no cloud sync, and your data never leaves your phone unless you choose to export it."
  - q: "Does Autonomic work on Android?"
    a: "Yes. Autonomic ships on both iPhone and Android, with health-data import on each platform, and your journal exports as a single file so it moves with you."
social:
  linkedin: |
    The hardest question in dysautonomia recovery is also the simplest one: "Am I actually getting better?"

    Recovery from POTS and long COVID moves in months, but you live it in days, and the days are noisy. A rough morning after three good weeks feels like proof that nothing is working, even when the underlying trend is still climbing.

    That question is why I built Autonomic. It scores your HRV, blood pressure, stand tests and sleep against medical thresholds, charts them against your own rolling baseline, and warns you when a crash pattern is forming, all privately, on your phone, with no account and no cloud.

    You can't see your nervous system. But you can see it recover.
---

## The cruelest part of an invisible illness

Dysautonomia doesn't show up on your face. It doesn't show up on most standard lab work either, which is why so many people spend [years being told everything is normal](/insights/basics/autonomic-nervous-system-and-dysautonomia-guide/) while their body malfunctions daily. But there's a second layer to the invisibility that gets talked about less: **you can't see the recovery either.**

Recovery from POTS, dysautonomia and [long COVID](/insights/recovery/recovery-from-post-viral-dysautonomia/) is real, and for most people it's slow. It moves in months. You live in days. And the days are noisy: a rough morning after three good weeks feels like proof that nothing is working, even when the trend underneath is still climbing. Without a way to see the trend, every bad day gets to rewrite the whole story.

That's the problem Autonomic was built to solve. Not another place to dump numbers, but a way to finally *watch* a nervous system heal.

## The dot lies. The line doesn't.

Any single reading is a dot: today's HRV, this morning's resting heart rate, one stand test. Dots bounce. Sleep, stress, salt, hormones and yesterday's walk all push them around, which is why judging yourself by this morning's number is a recipe for despair.

<figure class="prose-figure">
  <svg viewBox="0 0 720 300" role="img" aria-label="A scatter of noisy daily readings around a smooth rising baseline. One low outlier is labeled 'a rough day'; the rising curve is labeled 'your baseline'.">
    <g fill="#58c4f2" opacity="0.55">
      <circle cx="60" cy="238" r="5" /><circle cx="96" cy="206" r="5" /><circle cx="132" cy="242" r="5" />
      <circle cx="168" cy="212" r="5" /><circle cx="204" cy="188" r="5" /><circle cx="240" cy="224" r="5" />
      <circle cx="276" cy="176" r="5" /><circle cx="312" cy="202" r="5" /><circle cx="348" cy="156" r="5" />
      <circle cx="384" cy="186" r="5" /><circle cx="420" cy="142" r="5" /><circle cx="456" cy="168" r="5" />
      <circle cx="492" cy="122" r="5" /><circle cx="528" cy="150" r="5" /><circle cx="564" cy="106" r="5" />
      <circle cx="636" cy="96" r="5" /><circle cx="672" cy="112" r="5" />
    </g>
    <circle cx="600" cy="176" r="7" fill="#e03127" />
    <path d="M40 226 C160 216 230 202 310 182 C390 162 450 148 520 126 C580 108 646 94 690 86"
      fill="none" stroke="#54d98a" stroke-width="3.5" stroke-linecap="round" />
    <g font-family="-apple-system, sans-serif" font-size="13">
      <text x="600" y="205" text-anchor="middle" fill="#e03127">a rough day</text>
      <text x="600" y="221" text-anchor="middle" fill="var(--dim)">(just a dot)</text>
      <text x="360" y="130" text-anchor="middle" fill="#54d98a" font-weight="600">your baseline</text>
      <text x="360" y="147" text-anchor="middle" fill="var(--dim)">(the actual story)</text>
    </g>
  </svg>
  <figcaption>Daily readings bounce. The baseline underneath is what recovery actually looks like, and it's what Autonomic keeps in front of you.</figcaption>
</figure>

Autonomic's answer is the **rolling baseline**: every metric is charted against your own recent history, so the line stays visible under the noise. A bad dot lands *on* a rising line, and you can see both at once. That single design choice changes the emotional experience of tracking: the data starts protecting your morale instead of attacking it.

## What it watches

Autonomic tracks the vital signs that actually move during autonomic recovery, and it scores every one against medical thresholds so a number is never just a number:

- **[HRV](/insights/hrv/hrv-complete-guide/)**: the most direct window into vagal recovery. Capture it live with a chest strap or your phone's camera, or import it from the health data your watch already collects.
- **Blood pressure**: scored against clinical zones, with the [derived indices](/insights/basics/autonomic-blood-pressure-indices-kerdo-robinson-kvas/) that say more about autonomic balance than the raw cuff numbers do.
- **The [orthostatic stand test](/insights/pots/the-orthostatic-stand-test-at-home/)**: a guided, timed flow so every test is comparable, with the heart-rate rise scored against POTS thresholds. Watching that jump shrink over months is one of the clearest recovery signals there is.
- **[Sleep](/insights/recovery/sleep-and-autonomic-recovery/)**: quality, stages and overnight heart rate, because recovery is built at night.
- **Symptoms, meds, meals, hydration and triggers**: kept in the same journal as the numbers, so "why was that a bad week?" becomes a question your own data can answer.

<div class="callout callout-note">
  <strong>Start with what you own.</strong> A chest strap, a ring, a cuff, a pulse oximeter, or nothing but your phone. Autonomic scores whatever you record; nothing on this list is required to begin.
</div>

## It warns you before the crash

The most expensive mistake in recovery is the [push-crash cycle](/insights/recovery/pacing-101-energy-envelope/): feel good, do too much, lose a week. The warning signs are usually in the data a day or two early: HRV sliding, resting heart rate creeping, sleep fraying. They're just easy to miss when you're busy feeling better.

Autonomic's daily **Outlook** reads today against your baselines, and if a downturn pattern is forming it tells you plainly, including an optional crash warning notification, so you can pace back *before* the crash instead of journaling about it afterward. Home-screen widgets keep your score, streak and today's protocol visible without opening the app.

## It helps you be believed

If you've done the specialist circuit, you know the difference between saying "I feel worse when I stand up" and showing a chart of forty timed stand tests. One is a symptom. The other is evidence.

Months of scored readings become a structured, [doctor-ready summary](/insights/recovery/turn-your-data-into-a-doctor-conversation/), with optional AI reports that pull your trends into plain language. It's the difference between a rushed appointment spent explaining and one spent deciding.

## Private, because it has to be

This is the most sensitive data you have, so Autonomic is [offline-first by architecture](/insights/app/why-autonomic-is-offline-first/): your journal lives on your device, there's no account, no cloud, and nothing leaves your phone unless you export it yourself. It works in a basement, on a plane, and on your worst day with no signal. Privacy isn't a policy page here; it's the absence of any place your data could go.

<div class="callout callout-tip">
  <strong>See yours.</strong> Autonomic is on iPhone and Android: HRV, blood pressure, stand tests and sleep, scored and trended, private on your phone. <a href="/">Get Autonomic →</a>
</div>

## The bottom line

You can't see your nervous system. You can't see it malfunction, which is why diagnosis takes years, and you can't see it heal, which is why recovery feels like walking in fog. But it *is* measurable, and measured consistently, scored honestly and trended against your own baseline, it becomes visible: the line climbing, the stand test shrinking, the crashes spacing out. That's what Autonomic is for. Not to generate data, but to let you stand back and finally watch the thing you've been fighting for: your nervous system, recovering.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> Autonomic is a tracking and journaling tool to help you understand your own data and communicate with your clinician. It does not diagnose, treat, or replace professional medical care.
</div>
