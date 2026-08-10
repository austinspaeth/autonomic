---
title: "HRV Baseline: How to Build One and Read Every Reading Against It"
slug: hrv-baseline-how-to-build-and-use-it
published: true
summary: "A single HRV number means almost nothing on its own. Your baseline, your own rolling average and the normal spread around it, is what turns each morning reading into a signal you can actually trust. Here is how to build one and how to read today against it."
description: "How to build an HRV baseline and read each reading against it: how long it takes, how to set your personal normal range, and why your own rolling average beats any population norm in POTS and long COVID."
keywords: "HRV baseline, heart rate variability baseline, personal HRV baseline, how long to establish HRV baseline, HRV normal range, rolling HRV average, RMSSD baseline, HRV trend, POTS, long COVID"
date: 2026-08-04
updated: 2026-08-04
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Emma Simpson / Unsplash"
tldr: "Your HRV baseline is your own rolling average plus the normal spread around it, usually built from RMSSD taken the same way each morning. Expect a rough baseline after about two weeks and a stable one after four to eight, held on a rolling window (often 60 days) so it moves with you. Read each reading against your personal band, not a population norm: a single low morning is usually noise, and a sustained shift away from baseline is the real signal."
categories:
  - hrv
  - basics
faq:
  - q: "How long does it take to establish an HRV baseline?"
    a: "Plan on roughly two weeks of same-conditions readings for a rough baseline and about four to eight weeks for a stable one. HRV swings a lot day to day, so you need enough readings to capture your normal spread, not just your average. Most apps then hold the baseline on a rolling window, commonly 60 days, so it keeps updating as you change."
  - q: "Should I use my own baseline or the normal range for my age?"
    a: "Use your own baseline as the primary reference and treat age-based normal ranges as a loose sanity check. HRV varies enormously between healthy people, so two individuals with very different numbers can both be perfectly fine. What matters most is where today sits relative to your personal average and its direction over weeks."
  - q: "How far from baseline is a meaningful change?"
    a: "A rough rule of thumb: readings within about 10 percent of your baseline are usually normal fluctuation, a drop of roughly 10 to 20 percent is a mild dip worth noting, and more than 20 percent below, especially for several days, is a clearer signal. These are heuristics, not thresholds. Your own spread and a multi-day trend matter more than any single cutoff."
  - q: "Does my HRV baseline change over time?"
    a: "Yes, and that is the point. A baseline held on a rolling window drifts up as you recover, get fitter or reduce stress, and drifts down through illness, poor sleep or a rough stretch. That slow movement of the baseline itself is often a better recovery signal than any single morning reading."
  - q: "Why is my HRV baseline so different from someone else's?"
    a: "HRV depends on age, genetics, fitness, resting heart rate, breathing pattern, measurement method and health status, so absolute numbers differ widely between people. That is exactly why comparing yourself to others is unhelpful and why a personal baseline, measured the same way each time, is the honest reference."
social:
  linkedin: |
    A single HRV reading tells you almost nothing. The context is everything.

    Heart rate variability swings hard from night to night: sleep, alcohol, stress, illness and even the time you measured all move it. That is why one low morning triggers so much needless worry. The fix is not a better sensor. It is a baseline.

    A baseline is two things: your own rolling average and the normal spread around it. Build it from same-conditions morning readings, give it about two weeks for a rough version and four to eight for a stable one, then read each day against your personal band rather than a population chart. Within about 10 percent of baseline is usually noise. A sustained shift away from it is the signal worth acting on. And as you recover, the baseline itself climbs, which is often a clearer story than any single number.

    Full write-up on building and using an HRV baseline, with the timeframes and a simple deviation check:
    https://autonomic.care/insights/hrv/hrv-baseline-how-to-build-and-use-it/?utm_source=linkedin&utm_medium=social&utm_campaign=hrv-baseline-how-to-build-and-use-it

    #HRV #POTS #Dysautonomia #LongCovid #ChronicIllness
  reddit: |
    Subreddit: r/dysautonomia
    Title: The thing that finally stopped me spiraling over one bad HRV morning: a personal baseline

    For a long time I treated every HRV number as a verdict. One low morning and I was convinced I was crashing. What actually helped was realizing a single reading means almost nothing without context.

    The context is your baseline: your own rolling average plus the normal spread around it. Two things clicked once I had a few weeks of same-time, same-posture readings. First, my day-to-day swing was way bigger than I thought, so a lot of my "bad" mornings were inside my own normal range. Second, the number that actually tracked how I was doing was the slow drift of the baseline over weeks, not any single day.

    Rough guide I use now: within about 10 percent of baseline is noise, a sustained 20 percent-plus drop is worth paying attention to, and readings only count if I measure the same way each morning. Not medical advice, just what stopped the panic loop. I wrote up the details (how long it takes to build, how to set your personal band) here if it helps: https://autonomic.care/insights/hrv/hrv-baseline-how-to-build-and-use-it/?utm_source=reddit&utm_medium=social&utm_campaign=hrv-baseline-how-to-build-and-use-it
  x: |
    One low HRV morning is usually noise, not a crash. Your baseline is what makes a reading mean anything: https://autonomic.care/insights/hrv/hrv-baseline-how-to-build-and-use-it/?utm_source=x&utm_medium=social&utm_campaign=hrv-baseline-how-to-build-and-use-it #HRV #POTS
  facebook: |
    If one low HRV reading has ever sent you into a worry spiral, this is for you. A single number means very little on its own. What makes it meaningful is your baseline: your own rolling average and the normal range around it.

    Give it about two weeks of same-conditions morning readings for a rough baseline, then read each day against your personal band instead of a chart made for someone else. Within about 10 percent is usually just noise. How do you personally decide a reading is worth paying attention to?

    https://autonomic.care/insights/hrv/hrv-baseline-how-to-build-and-use-it/?utm_source=facebook&utm_medium=social&utm_campaign=hrv-baseline-how-to-build-and-use-it

    #HRV #POTS #Dysautonomia #LongCovid
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this is what runs the in-article baseline deviation check in the browser.
  const baselineScript = `<script>
(function () {
  var base = document.getElementById('bl-base');
  var today = document.getElementById('bl-today');
  if (!base || !today) return;
  var grade = document.getElementById('bl-grade');
  var note = document.getElementById('bl-note');
  var card = document.getElementById('bl-calc');
  function band(pct) {
    if (pct >= 5) return ['Above baseline', '#54d98a', 'At or above your usual. A well-recovered morning.'];
    if (pct > -10) return ['Within normal range', '#22c55e', 'Inside your day-to-day swing. This is noise, not a trend.'];
    if (pct > -20) return ['Mild dip', '#eab308', 'A little under baseline. Worth noting if it repeats, not alarming alone.'];
    if (pct > -30) return ['Notable dip', '#f97316', 'Clearly below your average. Watch sleep, load and how you feel.'];
    return ['Well below baseline', '#ef4444', 'A large drop. One day can be a fluke; several in a row is a signal.'];
  }
  function update() {
    var b = parseFloat(base.value);
    var t = parseFloat(today.value);
    if (isNaN(b) || isNaN(t) || b <= 0) {
      grade.textContent = 'Enter both numbers';
      grade.style.color = '';
      note.textContent = 'Type your baseline average and today\\x27s reading to see where it lands.';
      if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
      return;
    }
    var pct = ((t - b) / b) * 100;
    var g = band(pct);
    var sign = pct >= 0 ? '+' : '\\u2212';
    grade.textContent = g[0] + ' (' + sign + Math.abs(pct).toFixed(0) + '%)';
    grade.style.color = g[1];
    note.textContent = g[2];
    if (card) card.style.setProperty('--mc-accent', g[1]);
  }
  base.addEventListener('input', update);
  today.addEventListener('input', update);
  update();
})();
<\/script>`;
</script>

## Why one HRV reading is almost meaningless

If you have ever taken a heart rate variability reading, seen a low number, and spent the rest of the day convinced something was wrong, you already understand the core problem. A single HRV value has no meaning on its own. The number that matters is not today's reading. It is today's reading compared to **your baseline**.

Your HRV baseline is two things at once: your own rolling average, and the normal spread of readings around it. Build that, and a jumpy daily figure turns into a map. A low morning inside your normal swing is noise you can ignore. A sustained shift away from baseline is a genuine signal worth paying attention to. Everything useful about tracking HRV depends on having this personal reference in place first.

This matters even more in POTS, long COVID and post-viral dysautonomia, where absolute HRV numbers often run low and comparing yourself to a healthy 25-year-old's chart is both discouraging and useless. Your baseline sidesteps that entirely: it only ever compares you to you.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 260" role="img" aria-label="A scatter of daily HRV readings around a horizontal baseline average line, with a shaded normal-range band. Most dots fall inside the band; one dot sits well below it, marked as a meaningful dip.">
    <rect x="55" y="96" width="620" height="70" fill="#54d98a" opacity="0.12" />
    <line x1="55" y1="131" x2="675" y2="131" stroke="#54d98a" stroke-width="2" stroke-dasharray="6 5" />
    <text x="60" y="88" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-size="13" font-weight="600">Your normal range (baseline ± typical swing)</text>
    <text x="60" y="150" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="12">baseline average</text>
    <g fill="var(--dim-2)">
      <circle cx="95" cy="120" r="5"/><circle cx="140" cy="145" r="5"/><circle cx="185" cy="112" r="5"/>
      <circle cx="230" cy="138" r="5"/><circle cx="275" cy="105" r="5"/><circle cx="320" cy="150" r="5"/>
      <circle cx="365" cy="118" r="5"/><circle cx="410" cy="133" r="5"/><circle cx="455" cy="110" r="5"/>
      <circle cx="545" cy="126" r="5"/><circle cx="590" cy="148" r="5"/><circle cx="635" cy="115" r="5"/>
    </g>
    <circle cx="500" cy="212" r="6" fill="#e03127"/>
    <line x1="500" y1="166" x2="500" y2="206" stroke="#e03127" stroke-width="1.5" stroke-dasharray="3 3"/>
    <text x="500" y="234" fill="#e03127" font-family="Space Grotesk, sans-serif" font-size="12" font-weight="600" text-anchor="middle">outside the band: worth a look</text>
    <line x1="55" y1="185" x2="675" y2="185" stroke="var(--line)" stroke-width="1"/>
    <text x="55" y="205" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="11">morning readings, one per day →</text>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 268" role="img" aria-label="A scatter of daily HRV readings around a horizontal baseline average line, with a shaded normal-range band. Most dots fall inside the band; one dot sits well below it, marked as a meaningful dip.">
    <text x="20" y="20" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-size="12.5" font-weight="600">Your normal range</text>
    <text x="20" y="36" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-size="12.5" font-weight="600">(baseline ± typical swing)</text>
    <rect x="20" y="52" width="320" height="70" fill="#54d98a" opacity="0.12" />
    <line x1="20" y1="87" x2="340" y2="87" stroke="#54d98a" stroke-width="2" stroke-dasharray="6 5" />
    <text x="24" y="114" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="11.5">baseline average</text>
    <g fill="var(--dim-2)">
      <circle cx="42" cy="76" r="5"/><circle cx="66" cy="101" r="5"/><circle cx="90" cy="68" r="5"/>
      <circle cx="114" cy="94" r="5"/><circle cx="138" cy="61" r="5"/><circle cx="162" cy="106" r="5"/>
      <circle cx="186" cy="74" r="5"/><circle cx="210" cy="89" r="5"/><circle cx="234" cy="66" r="5"/>
      <circle cx="282" cy="82" r="5"/><circle cx="306" cy="104" r="5"/><circle cx="330" cy="71" r="5"/>
    </g>
    <circle cx="258" cy="176" r="6" fill="#e03127"/>
    <line x1="258" y1="122" x2="258" y2="170" stroke="#e03127" stroke-width="1.5" stroke-dasharray="3 3"/>
    <text x="340" y="200" fill="#e03127" font-family="Space Grotesk, sans-serif" font-size="12" font-weight="600" text-anchor="end">outside the band: worth a look</text>
    <line x1="20" y1="228" x2="340" y2="228" stroke="var(--line)" stroke-width="1"/>
    <text x="20" y="248" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="11">morning readings, one per day →</text>
  </svg>
  <figcaption>A reading only becomes meaningful against your own band. Most mornings scatter inside your normal range; the ones that leave it are the ones worth reading.</figcaption>
</figure>

## What an HRV baseline actually is

People use "baseline" loosely, so let's be precise. A useful HRV baseline has two components:

1. **A central value.** Usually a rolling average of your recent readings, most often of [RMSSD](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/), the cleanest day-to-day vagal-tone metric. A 7-day average smooths daily noise; a longer 30 to 60-day average defines your broader normal.
2. **A spread.** How much your readings normally bounce around that average. This is the part most people skip, and it is what tells you whether a given morning is genuinely unusual or just a normal Tuesday.

Without the spread, you cannot answer the only question that counts: is today's number actually different, or does it just feel different? A person whose RMSSD normally swings between 25 and 55 ms should not blink at a 30 ms morning. A person who normally sits at 45 to 55 ms absolutely should.

<div class="callout callout-note">
  <strong>Baseline is personal, not universal.</strong> HRV depends on age, genetics, fitness, resting heart rate, breathing and measurement method, so healthy people differ enormously. The <a href="/insights/hrv/hrv-normal-range-by-age/">age-based normal ranges</a> are a loose sanity check, not a target. Your own baseline is the honest reference because it only ever compares you to you.
</div>

## How long does it take to build an HRV baseline?

Because HRV is so variable, you need enough readings to capture your normal spread, not just to estimate your average. Here is a realistic timeline.

| Timeframe | What you have | How much to trust it |
| --- | --- | --- |
| 3–5 readings | A rough average, no real sense of spread | Very little. Do not draw conclusions yet |
| ~2 weeks | A workable baseline and a first read on your normal swing | Enough to spot large, obvious deviations |
| 4–8 weeks | A stable baseline with a well-defined normal range | Solid. Now single readings and short trends both mean something |
| Ongoing (rolling) | A baseline that updates with you, commonly on a 60-day window | The reference you keep for good |

The takeaway: give it about **two weeks** before you read much into any single day, and about **four to eight weeks** before you fully trust the band. After that, most tracking tools hold the baseline on a **rolling window** so it keeps moving as you do, rather than freezing your first month forever.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 240" role="img" aria-label="A line chart showing noisy daily HRV readings over several weeks, with a smoother rolling-baseline line that starts uncertain and settles, then gradually climbs upward during a recovery phase.">
    <polyline fill="none" stroke="var(--line-2)" stroke-width="1.5" opacity="0.7" points="50,150 82,120 114,175 146,130 178,165 210,125 242,155 274,115 306,150 338,110 370,140 402,100 434,132 466,92 498,120 530,86 562,110 594,78 626,102 658,72 690,95" />
    <polyline fill="none" stroke="#54d98a" stroke-width="3" points="50,150 82,145 114,148 146,143 178,145 210,140 242,142 274,135 306,136 338,128 370,128 402,120 434,120 466,112 498,110 530,102 562,100 594,92 626,90 658,82 690,80" />
    <line x1="178" y1="40" x2="178" y2="200" stroke="var(--line)" stroke-width="1" stroke-dasharray="4 4"/>
    <text x="184" y="55" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="12">~2 weeks: rough baseline</text>
    <text x="50" y="222" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-size="12" font-weight="600">rolling baseline (bold) settles, then climbs as recovery takes hold</text>
    <text x="500" y="60" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="11">daily readings (faint)</text>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 232" role="img" aria-label="A line chart showing noisy daily HRV readings over several weeks, with a smoother rolling-baseline line that starts uncertain and settles, then gradually climbs upward during a recovery phase.">
    <polyline fill="none" stroke="var(--line-2)" stroke-width="1.5" opacity="0.7" points="20,130 36,103 52,153 69,112 85,144 101,108 117,135 133,98 150,130 166,94 182,121 198,85 214,114 231,77 247,103 263,72 279,94 295,65 312,87 328,59 344,80" />
    <polyline fill="none" stroke="#54d98a" stroke-width="3" points="20,130 36,126 52,129 69,124 85,126 101,121 117,123 133,117 150,118 166,110 182,110 198,103 214,103 231,96 247,94 263,87 279,85 295,77 312,76 328,68 344,66" />
    <line x1="85" y1="30" x2="85" y2="176" stroke="var(--line)" stroke-width="1" stroke-dasharray="4 4"/>
    <text x="91" y="42" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="11.5">~2 weeks: rough baseline</text>
    <text x="344" y="172" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10.5">daily readings (faint)</text>
    <text x="20" y="204" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-size="11.5" font-weight="600">rolling baseline (bold) settles, then</text>
    <text x="20" y="220" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-size="11.5" font-weight="600">climbs as recovery takes hold</text>
  </svg>
  <figcaption>Daily HRV is noisy (faint line). The rolling baseline (bold) filters that noise, and its slow upward drift is itself a recovery signal.</figcaption>
</figure>

## The one rule that makes a baseline valid: measure the same way

A baseline is only as good as the consistency of the readings that built it. If you measure sitting one day and lying down the next, first thing on waking one morning and after coffee the next, you are not tracking your nervous system. You are tracking your measurement conditions.

Lock these down and keep them fixed:

- **Same time of day.** First thing after waking, before caffeine and before your day starts, is the standard because it is the least contaminated moment you have.
- **Same posture.** Lying or seated, but pick one. Posture alone can move HRV substantially.
- **Same length and method.** A consistent reading window and the same device. Our [measuring HRV accurately at home](/insights/basics/how-to-measure-hrv-accurately-at-home/) guide covers the full checklist, and it matters more for baseline building than almost anything else.

<div class="callout callout-warn">
  <strong>Restart the clock after a big method change.</strong> Switching from a wrist wearable to a chest strap, or from a seated to a supine reading, effectively creates a new baseline. Expect the numbers to shift and give the new setup a couple of weeks before comparing again. Mixing methods inside one baseline is the most common way people fool themselves.
</div>

## How to read today against your baseline

Once the band exists, reading a morning is simple. Ask where today sits relative to your personal average and its normal spread, not relative to anyone else.

| Where today lands | Usual meaning | What to do |
| --- | --- | --- |
| At or above baseline | Well-recovered, parasympathetic in charge | Proceed as planned |
| Within your normal swing (roughly ±10%) | Ordinary day-to-day fluctuation | Ignore it. This is noise |
| A single reading clearly below | One rough night, not a trend | Note it, do not react to it |
| Several days trending below baseline | A genuine downward shift | Ease load, protect sleep, check for illness or overreach |
| Baseline itself drifting down over weeks | A slow change in your capacity | Look at the bigger picture: stress, training, recovery, health |

The percentage cutoffs are rough heuristics, not thresholds. Someone with a naturally wide swing should widen that ±10 percent; someone very steady should narrow it. The deeper point holds for everyone: **one reading is a data point, a multi-day trend is the signal, and a moving baseline is the story.**

Try it with your own numbers:

<div class="metric-calc" id="bl-calc">
  <p class="mc-head">Reading vs baseline check</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="bl-base">Your baseline average (ms)</label>
      <input class="mc-input" id="bl-base" type="number" inputmode="decimal" placeholder="e.g. 42" />
    </div>
    <div class="mc-field">
      <label class="mc-label" for="bl-today">Today's reading (ms)</label>
      <input class="mc-input" id="bl-today" type="number" inputmode="decimal" placeholder="e.g. 38" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="bl-grade">Enter both numbers</span>
    <span class="mc-note" id="bl-note">Type your baseline average and today's reading to see where it lands.</span>
  </div>
</div>

{@html baselineScript}

<div class="callout callout-note">
  <strong>This check is deliberately rough.</strong> It compares today to your average as a percentage because that is easy to reason about. A more precise version uses your actual spread (how far readings normally stray from the mean), which is what a good tracking app computes for you. Treat the result as a nudge, not a diagnosis.
</div>

## Why the baseline moving is the best signal of all

Here is the part most people miss. The single most useful thing HRV tracking can show you is not any one morning. It is the slow movement of the **baseline itself**.

When you are recovering from post-viral dysautonomia, getting fitter, sleeping better or lowering chronic stress, your rolling baseline climbs, often before you consciously feel better. When you are overreaching, sickening or run down, it drifts down. Because a rolling baseline filters out the daily noise, that drift is a cleaner signal than any individual reading could ever be. We follow exactly this arc in [recovery from post-viral dysautonomia](/insights/recovery/recovery-from-post-viral-dysautonomia/), and it pairs naturally with a falling [resting heart rate](/insights/basics/resting-heart-rate-and-mean-rr/) and a shrinking stand-test rise.

This is also why a rolling baseline beats a frozen one. If you locked your baseline to your worst month and never updated it, real progress would look like you constantly overshooting an outdated target. A window that moves with you keeps the comparison honest: today is always measured against your recent self, not a stranger and not a past version of you that no longer applies.

<details class="prose-details">
  <summary><strong>Worked example: two identical readings, opposite meanings</strong></summary>
  <p>Two people both post an RMSSD of 34 ms this morning. Person A has a baseline average of 32 ms with readings that usually sit between 26 and 40. For them, 34 is a slightly above-average, unremarkable morning: proceed as normal. Person B has spent the last two months averaging 55 ms with readings rarely below 48. For them, 34 is a large, roughly 38 percent drop well outside their normal band, the kind of reading that, repeated, would warrant easing off and checking on sleep, stress or a brewing illness. Same number, opposite message. That is the entire case for a baseline: the raw figure is not the information. The distance from your own normal is.</p>
</details>

## Building a baseline when your HRV is low or unstable

In POTS, long COVID and related dysautonomias, two things complicate baseline building, and both have practical answers.

**Your numbers may be low.** That is fine. A baseline does not care about the absolute value. A person whose RMSSD sits in the teens can build just as valid a personal band as someone in the fifties, and can watch it climb just as clearly over a recovery arc. Do not let a low starting point discourage you: the direction is what you are tracking. For the wider picture of why these numbers run low, see the [complete HRV guide](/insights/hrv/hrv-complete-guide/).

**Your day-to-day swing may be wider.** Dysregulated systems often show more variability between readings, which means your normal band is simply wider than average, and you should expect more scatter before a trend is trustworthy. Lean harder on the 7-day average and give trends a few extra days to declare themselves. If your readings are all over the place, revisit measurement consistency first: a wandering baseline is often a wandering method. When you are ready to raise the baseline itself, [how to improve HRV: what actually works](/insights/hrv/how-to-improve-hrv-what-works/) covers the levers that move it.

<div class="callout callout-tip">
  <strong>Let Autonomic hold your baseline for you.</strong> Instead of doing this math by hand, Autonomic scores every reading against both medical thresholds and <strong>your own rolling baseline</strong>, so each morning arrives already placed on your personal band and flagged as normal swing, a real dip or a genuine climb. It is private and offline, keeps your chest strap, ring and stand tests in one scored timeline, and shows the baseline drifting over weeks so you can see recovery before you feel it. <a href="/">See how it works →</a>
</div>

## The bottom line

A single HRV reading is a data point with almost no meaning until it has something to be compared against. That something is your baseline: your own rolling average plus the normal spread around it, built from same-conditions morning readings. Give it about two weeks for a rough version and four to eight for a stable one, hold it on a rolling window so it moves with you, and then read each day against your personal band rather than a population chart. Most mornings will fall inside your normal swing and mean nothing. The readings that leave the band, and especially the slow drift of the baseline itself, are where the real story of your recovery lives.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> These are educational field notes to help you understand and track your own data, not a way to diagnose or treat any condition. HRV varies widely between people and day to day. If your readings concern you or your symptoms are changing, discuss it with a clinician who can evaluate you properly.
</div>
