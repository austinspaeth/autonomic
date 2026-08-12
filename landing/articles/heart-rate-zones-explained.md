---
title: "Heart Rate Zones Explained: Z1 to Z5, and How to Read Them With Dysautonomia"
slug: heart-rate-zones-explained
published: true
summary: "Heart rate zones split effort into five bands off your estimated maximum heart rate. Here is what each zone actually does physiologically, why the age formula is only an estimate, and how to read time-in-zone when you have POTS, long COVID or post-exertional malaise."
description: "Heart rate zones Z1 to Z5 explained: how the 208 minus 0.7 times age formula works, what each zone trains, why beta blockers and POTS break the effort-to-heart-rate link, and how to use time in zone alongside post-exertional malaise."
keywords: "heart rate zones, Z1 Z2 Z3 Z4 Z5, maximum heart rate formula, 208 minus 0.7 age, zone 2 training, time in zone, heart rate zones POTS, beta blockers heart rate zones, exercise long COVID, post-exertional malaise heart rate"
date: 2026-08-11
updated: 2026-08-11
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1536331568701-0b15cbb1a918?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Briana Tozour / Unsplash"
tldr: "Heart rate zones divide effort into five bands as a percentage of your estimated maximum heart rate: Z1 under 60 percent, Z2 60 to 70, Z3 70 to 80, Z4 80 to 90, Z5 above 90. Autonomic estimates your maximum from your age using 208 minus 0.7 times age, which is a population average with a wide spread around it, and which reads badly if you take a beta blocker or if your heart rate is driven by orthostatic stress rather than effort. Zone 2 is where aerobic and autonomic base is rebuilt. In dysautonomia, work recumbent first, treat Z4 and Z5 minutes as a risk you accepted rather than a win, and read your zone chart beside your post-exertional malaise log rather than on its own."
categories:
  - recovery
  - pots
faq:
  - q: "How are heart rate zones calculated?"
    a: "Zones are percentages of your maximum heart rate. Autonomic estimates your maximum from the birthday in Settings using 208 minus 0.7 times your age, then splits effort into five bands: Z1 below 60 percent of max, Z2 from 60 to 70 percent, Z3 from 70 to 80, Z4 from 80 to 90, and Z5 at 90 percent and above. A 40-year-old gets an estimated maximum of 180 bpm, so their Z2 runs roughly 108 to 126 bpm."
  - q: "Is 220 minus your age accurate?"
    a: "It is the best-known formula and the least accurate. The 208 minus 0.7 times age equation that Autonomic uses comes from a large meta-analysis and fits observed data better, particularly for older adults, but both are population averages. Real maximum heart rates scatter roughly 10 to 12 beats either side of any age formula, so two healthy people of the same age can have maximums 20 beats apart. Treat your zones as a consistent scale for comparing your own sessions, not as physiological truth."
  - q: "What is zone 2 training and why does it matter?"
    a: "Zone 2 is the comfortable aerobic band, roughly 60 to 70 percent of maximum heart rate, where you can still hold a conversation. It is where mitochondrial density, capillary networks and stroke volume are built, and it is the intensity most associated with improving vagal tone and heart rate variability over months. For anyone rebuilding after dysautonomia or a post-viral illness, Z2 and below is where almost all of the useful work happens."
  - q: "Are heart rate zones useful if you have POTS?"
    a: "They are useful as a warning system and much less useful as a training prescription. In POTS your heart rate rises from posture and blood pooling, not only from effort, so standing still can put you in Z3 while your muscles are doing nothing. The workaround is to train recumbent first, where the heart rate you see is closer to genuine effort, and to treat a rising zone during easy work as a signal to stop rather than a sign you are training harder."
  - q: "Do beta blockers change my heart rate zones?"
    a: "Yes, substantially. Beta blockers cap how fast your heart can go, so your true maximum can sit far below any age estimate and every zone boundary shifts down with it. Percentages of an estimated maximum you can no longer reach will overstate how hard you are working. If you are on rate-controlling medication, use perceived effort and the talk test as your primary guide and treat the zone chart as a record of what your heart did, not a measure of intensity."
  - q: "How much time in zone should I aim for?"
    a: "In general fitness terms, the common pattern is most time in Z1 and Z2 with only small amounts in Z4 and Z5. In recovery from dysautonomia or post-exertional malaise, drop the higher zones entirely at first: the goal is total minutes accumulated at low intensity without triggering a crash, not a weekly quota. If a session produced Z4 or Z5 minutes you did not plan, look at the next 48 hours before deciding whether it was tolerated."
---

Your heart rate during exercise is a single number that changes every second, which makes it hard to think about. **Zones** are the fix: a way of collapsing all those beats into five bands that each mean something different physiologically. Once effort is bucketed, "how hard was that walk" becomes a chart you can read at a glance, and "how hard have I been going this month" becomes answerable.

That is genuinely useful. It is also, in dysautonomia, one of the easiest numbers in the whole app to misread, because zones quietly assume that your heart rate is a clean proxy for how hard your muscles are working. For a lot of people reading this, it is not.

## What the five zones are

Zones are percentages of your **maximum heart rate**: the fastest your heart can beat during all-out effort. Autonomic estimates that maximum from the birthday you entered in Settings, then splits the range into five bands.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 250" role="img" aria-label="Five stacked heart rate zone bands from Z1 recovery at the bottom through Z5 maximum at the top, labelled with their percentage of maximum heart rate">
    <g font-family="Space Grotesk, sans-serif" font-size="13">
      <rect x="60" y="30" width="420" height="34" rx="6" fill="#e03127" opacity="0.85"/>
      <text x="72" y="52" fill="#fff" font-weight="600">Z5 · Maximum</text>
      <text x="470" y="52" text-anchor="end" fill="#fff" font-family="Space Mono, monospace" font-size="12">90%+</text>
      <rect x="60" y="72" width="420" height="34" rx="6" fill="#f97316" opacity="0.85"/>
      <text x="72" y="94" fill="#fff" font-weight="600">Z4 · Threshold</text>
      <text x="470" y="94" text-anchor="end" fill="#fff" font-family="Space Mono, monospace" font-size="12">80–90%</text>
      <rect x="60" y="114" width="420" height="34" rx="6" fill="#eab308" opacity="0.85"/>
      <text x="72" y="136" fill="#fff" font-weight="600">Z3 · Tempo</text>
      <text x="470" y="136" text-anchor="end" fill="#fff" font-family="Space Mono, monospace" font-size="12">70–80%</text>
      <rect x="60" y="156" width="420" height="34" rx="6" fill="#54d98a" opacity="0.9"/>
      <text x="72" y="178" fill="#0b0b0b" font-weight="600">Z2 · Aerobic base</text>
      <text x="470" y="178" text-anchor="end" fill="#0b0b0b" font-family="Space Mono, monospace" font-size="12">60–70%</text>
      <rect x="60" y="198" width="420" height="34" rx="6" fill="#54d98a" opacity="0.45"/>
      <text x="72" y="220" fill="var(--dim)" font-weight="600">Z1 · Recovery</text>
      <text x="470" y="220" text-anchor="end" fill="var(--dim)" font-family="Space Mono, monospace" font-size="12">&lt;60%</text>
    </g>
    <g font-family="-apple-system, sans-serif" font-size="12" fill="var(--dim-2)">
      <text x="500" y="52">all out, minutes at most</text>
      <text x="500" y="94">hard, breathing broken</text>
      <text x="500" y="136">moderate, sentences short</text>
      <text x="500" y="178">conversational, sustainable</text>
      <text x="500" y="220">very easy, warm-up</text>
    </g>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 268" role="img" aria-label="Five stacked heart rate zone bands from Z1 recovery at the bottom through Z5 maximum at the top, labelled with their percentage of maximum heart rate">
    <g font-family="Space Grotesk, sans-serif" font-size="12.5">
      <rect x="16" y="20" width="328" height="44" rx="8" fill="#e03127" opacity="0.85"/>
      <text x="30" y="40" fill="#fff" font-weight="600">Z5 · Maximum</text>
      <text x="330" y="40" text-anchor="end" fill="#fff" font-family="Space Mono, monospace" font-size="11.5">90%+</text>
      <text x="30" y="56" fill="#fff" font-size="11">all out, minutes at most</text>
      <rect x="16" y="70" width="328" height="44" rx="8" fill="#f97316" opacity="0.85"/>
      <text x="30" y="90" fill="#fff" font-weight="600">Z4 · Threshold</text>
      <text x="330" y="90" text-anchor="end" fill="#fff" font-family="Space Mono, monospace" font-size="11.5">80–90%</text>
      <text x="30" y="106" fill="#fff" font-size="11">hard, breathing broken</text>
      <rect x="16" y="120" width="328" height="44" rx="8" fill="#eab308" opacity="0.85"/>
      <text x="30" y="140" fill="#fff" font-weight="600">Z3 · Tempo</text>
      <text x="330" y="140" text-anchor="end" fill="#fff" font-family="Space Mono, monospace" font-size="11.5">70–80%</text>
      <text x="30" y="156" fill="#fff" font-size="11">moderate, sentences short</text>
      <rect x="16" y="170" width="328" height="44" rx="8" fill="#54d98a" opacity="0.9"/>
      <text x="30" y="190" fill="#0b0b0b" font-weight="600">Z2 · Aerobic base</text>
      <text x="330" y="190" text-anchor="end" fill="#0b0b0b" font-family="Space Mono, monospace" font-size="11.5">60–70%</text>
      <text x="30" y="206" fill="#0b0b0b" font-size="11">conversational, sustainable</text>
      <rect x="16" y="220" width="328" height="44" rx="8" fill="#54d98a" opacity="0.45"/>
      <text x="30" y="240" fill="var(--dim)" font-weight="600">Z1 · Recovery</text>
      <text x="330" y="240" text-anchor="end" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11.5">&lt;60%</text>
      <text x="30" y="256" fill="var(--dim)" font-size="11">very easy, warm-up</text>
    </g>
  </svg>
  <figcaption>The five zones as a share of estimated maximum heart rate. The bands are a scale, not a scoreboard: for most people rebuilding, almost all the useful work lives in the bottom two.</figcaption>
</figure>

**Zone 1, under 60 percent.** Very easy movement: a slow walk, stretching, the warm-up and cool-down around everything else. Circulation increases, but the system is barely taxed. In severe dysautonomia this is not a warm-up zone at all, it is the whole session, and that is a legitimate place to be.

**Zone 2, 60 to 70 percent.** The conversational aerobic band, the one you can hold for a long time while still finishing sentences. Physiologically this is where the slow, structural adaptations happen: more mitochondria, denser capillary beds, a larger stroke volume so each beat moves more blood. It is also the intensity most consistently linked to improving vagal tone, which is why it matters so much here. **Zone 2 is where autonomic recovery is actually built.**

**Zone 3, 70 to 80 percent.** Moderate to firm effort. Breathing is noticeably up and you speak in short phrases. It is real aerobic work, and it costs more recovery than Z2 for adaptations that are not much larger, which is why endurance coaches often call it the grey zone.

**Zone 4, 80 to 90 percent.** Hard. Around the lactate threshold, where the effort stops feeling steady and starts feeling like something you are enduring. This is a training stimulus for a healthy athlete and, for many people with post-viral illness, a trigger.

**Zone 5, above 90 percent.** All-out. Sustainable for seconds to a couple of minutes. Almost nobody rebuilding from dysautonomia has any business here on purpose.

## Where the maximum comes from, and why it is only an estimate

Autonomic estimates your maximum heart rate with **208 minus 0.7 times your age**, using the birthday in Settings. A 30-year-old gets 187 bpm, a 45-year-old gets 176, a 60-year-old gets 166.

That formula is a better one than the famous "220 minus age" you have seen on gym posters. It comes from a large meta-analysis of measured maximum heart rates and fits real data more closely, especially in older adults, where 220 minus age tends to underestimate badly. But **better does not mean accurate for you.**

<div class="callout callout-note">
  <strong>Any age formula has a wide spread around it.</strong> Measured maximums scatter roughly 10 to 12 beats per minute either side of the prediction, and the tails are wider still. Two healthy 40-year-olds can genuinely have maximums of 170 and 192. Your zone boundaries are therefore a consistent, repeatable scale for comparing your own sessions to each other, not a physiological fact about your heart.
</div>

Three situations break the estimate badly enough to be worth naming.

**Beta blockers.** Rate-controlling medication puts a ceiling on how fast your heart can go, and that ceiling can sit 30 or more beats below any age prediction. Every zone boundary derived from an unreachable maximum is then too high, so your genuinely hard sessions read as Z2 and you can push much further than the chart suggests. If you take a beta blocker, use perceived effort and the talk test as the primary guide and treat the zone chart as a record of what your heart did rather than a measure of what it cost you. We go deeper on this in [beta blockers and HRV](/insights/hrv/beta-blockers-and-hrv/).

**POTS and orthostatic intolerance.** This is the big one. In POTS, heart rate is driven substantially by **posture and blood volume**, not by muscular work. Standing at a kitchen counter can put you into Z3 while your legs are doing nothing at all. The zone chart is measuring the compensation your body is making against gravity, and reading that as "training intensity" will tell you that you did a moderate workout when what you actually did was stand up.

**Deconditioning after illness.** Long bed rest lowers stroke volume, so the heart has to beat faster to move the same blood. Early in reconditioning, high zone numbers reflect a small stroke volume more than a hard effort, and they should come down for the same work as the base rebuilds. That fall is one of the more encouraging things to watch, and it is covered in [POTS versus deconditioning](/insights/pots/pots-vs-deconditioning/).

## What time in zone actually tells you

The single most useful thing about zones is not the peak you touched. It is **time in zone**: how many minutes of a session, or a week, sat in each band.

Peak heart rate is a spike, and spikes are noisy. One flight of stairs at the end of a walk can put a Z4 marker on an otherwise easy session. Minutes accumulated are much harder to fake and much more closely related to what a session actually cost you. Two forty-minute walks with the same peak can be entirely different events: one with 35 minutes in Z2, the other with 20 minutes in Z3 and 6 in Z4.

Read the distribution, and read it over weeks:

- **A widening Z1 and Z2 base with steady total minutes** is what rebuilding looks like. More movement at the same low cost.
- **The same session drifting downward through the zones** over a month is the clearest sign your aerobic base is improving. The work got easier, which is the whole point.
- **Minutes creeping upward into Z3 and Z4 without you choosing it** usually means something else changed: heat, dehydration, an infection coming on, poor sleep, or more upright time than you noticed.

<div class="callout callout-note">
  <strong>Zones describe intensity, not load.</strong> Thirty minutes in Z2 and five minutes in Z4 are different kinds of stress, not different amounts of the same one. Adding them together into a single "effort score" hides the exact distinction that matters most when you are pacing.
</div>

## Reading zones when you have dysautonomia

Everything above is standard exercise physiology. Here is where it has to be bent.

### Work recumbent first

If your heart rate rises from standing rather than from effort, the fix is to remove the standing. Recumbent cycling, rowing, swimming and floor work all let you produce genuine muscular effort while your heart rate reports mostly on that effort rather than on gravity. This is exactly the logic behind the [Levine protocol for POTS](/insights/pots/exercise-for-pots-levine-protocol/), which starts horizontal and works toward upright over months. It also happens to make your zone chart meaningful again, because horizontal is the one position where the number is close to honest.

### Treat Z2 as the destination, not the warm-up

In conventional training, Z2 is the base you build so you can do harder work on top of it. In autonomic recovery, **Z2 is the work.** The adaptations that matter here are the aerobic and vagal ones: stroke volume, blood volume, capillary density, parasympathetic tone. Every one of those responds to accumulated easy minutes. None of them require Z4. The most common mistake is treating months of comfortable Z2 as "not really training" and reaching for intensity to feel like progress is happening.

### Z4 and Z5 minutes often sit just before a crash

Look back through a few crash days in your journal and check the two days before them. A recurring pattern for a lot of people is a handful of unplanned high-zone minutes: rushing for a bus, carrying shopping up stairs, a hot shower after a walk, an argument. Small in duration, disproportionate in cost.

This is the shape of [post-exertional malaise](/insights/postviral/post-exertional-malaise-explained/): the trigger and the consequence are separated by 12 to 48 hours, so the connection is easy to miss. Time in zone gives you an objective record of the trigger side of that gap. When a crash lands, the useful question is not "what did I do today" but "what do my zone minutes look like for the two days before."

<div class="callout callout-warn">
  <strong>High zones are not an achievement here.</strong> In a healthy training log, Z4 minutes are a deposit. With post-exertional malaise they are a debt taken out at an interest rate you will not learn until tomorrow or the day after. If you see unplanned Z4 or Z5 minutes, the right response is to protect the next 48 hours, not to feel pleased about the session.
</div>

### Pair the zone chart with your symptom log

A zone chart alone tells you what your heart did. A zone chart beside a symptom log tells you what your heart could afford. Over a couple of months, the pairing usually produces a personal ceiling that is far more useful than any percentage: something like "more than 15 minutes above 120 bpm and I pay for it," which is a number no formula could have given you.

That is the same discipline as finding your [energy envelope](/insights/recovery/pacing-101-energy-envelope/), just with an objective axis attached to it. It works best when the symptom side is logged honestly on bad days too, which is the hard part. Our guide to [finding your triggers with a symptom journal](/insights/recovery/find-your-triggers-symptom-journal/) covers how to keep that record without turning it into a chore.

## A worked example

Take a 45-year-old. Estimated maximum: 208 minus 0.7 times 45, which is 176 bpm.

| Zone | Percentage | Heart rate | What it looks like |
| --- | --- | --- | --- |
| Z1 | Under 60% | Below 106 bpm | Slow walk, gentle stretching |
| Z2 | 60 to 70% | 106 to 123 bpm | Comfortable recumbent cycling, conversational |
| Z3 | 70 to 80% | 123 to 141 bpm | Brisk effort, short sentences |
| Z4 | 80 to 90% | 141 to 158 bpm | Hard, breathing broken |
| Z5 | Above 90% | Above 158 bpm | All out |

Now add POTS. Standing up alone might take this person from 78 to 118 bpm, which is squarely in Z2 before any exercise has happened. A ten-minute upright shower could log ten Z2 minutes without a single deliberate movement. This is not a flaw in the chart; it is the chart being accurate about a heart rate that was never a measure of effort in the first place. It is also why the recumbent-first structure matters so much, and why for many people the more informative comparison is not against zone boundaries at all but against their own [resting heart rate](/insights/basics/resting-heart-rate-and-mean-rr/) for the same activity a month ago.

<div class="callout callout-tip">
  <strong>Autonomic keeps the whole trace.</strong> Workouts imported from Apple Health or Health Connect keep their full heart-rate series, so the app can show you the minutes in each zone rather than just an average or a peak, right beside the HRV, resting heart rate and symptom entries for the same days. Everything stays on your device. <a href="/">See how it works &rarr;</a>
</div>

## The bottom line

Heart rate zones are a good way to make effort legible: five bands off an estimated maximum, with Z2 as the conversational band where aerobic and autonomic base is genuinely built. The estimate behind them, 208 minus 0.7 times your age, is a population average with a wide spread, and it gets less trustworthy the further your physiology sits from average, which includes anyone on a beta blocker and anyone whose heart rate answers to posture as much as to effort. Read time in zone rather than peaks, work recumbent first if standing itself pushes you up the chart, treat unplanned Z4 and Z5 minutes as a risk you took rather than a session you won, and always read the chart beside the next 48 hours of symptoms. Used that way, zones stop being a fitness scoreboard and become a decent early-warning system.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. <em>If you have post-exertional malaise, discuss any activity plan with a clinician familiar with ME/CFS before starting or changing it.</em> Talk with a qualified clinician before making changes to medication, diet or exercise.
</div>
