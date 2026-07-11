# App Store listing & ASO kit: Autonomic

Ready-to-paste copy and a screenshot plan for the App Store Connect listing.
Targets: **long COVID**, **HRV capture**, **POTS/dysautonomia**, and the
adjacent recovery audience (ME/CFS, post-viral, vagal tone). Written to match
the landing brand voice ("See your nervous system recover") and the shipping
feature set. Not a medical device, so the copy avoids diagnose/treat claims on
purpose.

---

## 0. How Apple ranking actually works (read this first)

Apple's search index is **not** like Google Play. What matters:

| Field | Char limit | Indexed for search? | Weight |
| --- | --- | --- | --- |
| **App Name** | 30 | ✅ Yes | Highest |
| **Subtitle** | 30 | ✅ Yes | High |
| **Keywords** (hidden) | 100 | ✅ Yes | Medium-high |
| **Promotional text** | 170 | ❌ No | Conversion only |
| **Description** | 4000 | ❌ **No** | Conversion only |

Three consequences that drive every choice below:

1. **The description does nothing for ranking.** Apple doesn't index it. Its
   only job is to *convert* the person who already tapped through. So the
   description is written for persuasion, not keyword stuffing.
2. **Apple tokenizes and recombines across fields.** If "long" appears in the
   subtitle and "covid" in the keyword field, you rank for "long covid" without
   spending the whole phrase twice. So **never repeat a word** across
   Name/Subtitle/Keywords; each duplicate is wasted index space.
3. **The keyword field has no spaces after commas**, no plurals if the singular
   is present (Apple stems), no "app", and no category words ("health",
   "fitness"). Every wasted character is a lost keyword.

⚠️ **COVID compliance risk: decide before you submit.** Apple Review Guideline
5.1.1(ix) restricts apps using **COVID-19** themes to "recognized entities"
(governments, hospitals, medical/credentialed institutions). A solo-dev wellness
app naming COVID prominently can draw a rejection or a request for credentials.
Two mitigations, in order of safety:
   - **Safer:** lead with **"post-viral"**, **"long-haul"**, **"post-COVID
     recovery"** framing in visible fields, keep **"long covid"** only in the
     hidden keyword field, and make the medical disclaimer explicit in the
     description and review notes. Apple has been far more permissive about *long
     COVID / post-viral recovery* tracking than about COVID-19 *testing/tracing*.
   - **If rejected:** reply in Resolution Center that the app is a personal
     symptom/HRV journal, stores everything on-device, makes no diagnostic
     claims, and does not report on COVID-19 case data. That's usually enough.

---

## 1. App Name (30 chars): pick one

Brand plus your single most valuable keyword. POTS and HRV are high-intent and
lower-competition than "long covid"; put one of them here.

| Option | Chars | Notes |
| --- | --- | --- |
| **`Autonomic: HRV & POTS Tracker`** ⭐ | 29 | Recommended. Brand + two strongest keywords. |
| `Autonomic: HRV for Recovery` | 27 | Softer, broader; drops POTS to keywords. |
| `Autonomic: HRV, POTS & Vagal` | 29 | Adds vagal-tone crowd; "Tracker" moves to subtitle. |

> ⭐ = recommended. "Tracker" is worth keeping in the name: it's a real search
> term ("pots tracker", "hrv tracker") and it tells a browsing user what this is.

## 2. Subtitle (30 chars): pick one

Different words from the name. This is where dysautonomia and the post-viral
audience live.

| Option | Chars | Notes |
| --- | --- | --- |
| **`Dysautonomia & post-viral care`** ⭐ | 30 | Recommended. Captures dysautonomia + post-viral without naming COVID in a visible field. |
| `Post-viral HRV & symptom log` | 28 | Adds "symptom log" intent. |
| `Track dysautonomia recovery` | 27 | Simplest; "recovery" reinforces the promise. |

## 3. Keyword field (100 chars): paste exactly

Comma-separated, **no spaces**, no words already used in Name/Subtitle. This set
assumes the ⭐ Name + ⭐ Subtitle above (so it omits: autonomic, hrv, pots,
tracker, dysautonomia, post-viral, care).

```
long,covid,heart rate variability,vagal tone,rmssd,sdnn,me cfs,pacing,vagus,chest strap,orthostatic
```

Char count: **99/100.** Notes:
- `long` + `covid` as separate tokens let Apple recombine into "long covid"
  (and also match "covid recovery", "long haul") while keeping COVID out of the
  *visible* fields per the risk note above.
- `heart rate variability` is spelled out **once**; combined with `hrv` in the
  name you cover both the acronym and the phrase.
- `me cfs` matches "me/cfs", "cfs", and "chronic fatigue" adjacency.
- Dropped low-value fillers ("health", "wellness", "app", plurals) on purpose.

**Alternate keyword set** if you'd rather chase the biofeedback / breathing
crowd instead of ME/CFS:
```
long,covid,heart rate variability,vagal tone,rmssd,sdnn,coherence,breathing,biofeedback,chest strap
```

## 4. Promotional text (170 chars): updatable anytime, no review

Put your freshest hook here; you can change it without resubmitting.

> **Live 5-minute HRV graded like a clinician would, then build your own recovery
> protocol and watch your numbers climb. 100% private, on your phone. For long-haul
> & POTS.** (167 chars)

Runner-up if you'd rather foreground the streak (168 chars): *Clinical-grade HRV,
graded against real thresholds. Build your recovery protocol, keep the streak,
see your numbers climb. Private and on-device. For long-haul & POTS.*

Both stay "long-haul" in this visible field and keep "long covid" in the hidden
keyword field only (see the compliance note in §0). This field is editable
without re-review, so rotate it — seasonal hooks, a new metric, a review quote.

---

## 5. Description (the conversion copy)

Apple shows only the **first ~3 lines** before "more". Those lines below the
fold carry the whole first impression; they're written to earn the tap.

```
See your nervous system actually recover.

Autonomic turns a heart-rate chest strap or your Apple Watch into a clinical-grade HRV lab in your pocket, then grades every reading against the same medical thresholds a specialist would use, so you finally know whether today was a good day or a warning sign.

Built for the long haul: long-hauler and post-viral recovery, POTS and dysautonomia, ME/CFS, and anyone rebuilding their autonomic nervous system one day at a time.

━━━━━━━━━━━━━━━━━━━━
LIVE 5-MINUTE HRV, DONE RIGHT
━━━━━━━━━━━━━━━━━━━━
• Capture beat-to-beat RR intervals live from a Bluetooth chest strap or Apple Watch
• A full-screen guided session with a 5:00 ring, live heart rate, and a paced breathing visualizer (4/6 resonance breathing and more)
• Every metric computed on-device: SDNN, RMSSD, pNN50, mean RR, PNS & SNS index, Baevsky stress index, VLF/LF/HF power, LF/HF, coherence, and more
• Honest signal quality: artifacts are flagged and corrected, and a noisy reading refuses to fake a score instead of lying to you

━━━━━━━━━━━━━━━━━━━━
GRADED LIKE A CLINICIAN WOULD
━━━━━━━━━━━━━━━━━━━━
• Every number is scored great / good / ok / warning / crash against real thresholds, with no mystery "readiness" black box
• One daily Autonomic Score that rolls up HRV, sleep, symptoms, blood pressure and more
• A plain-language outlook for the day: what your body is ready for, from a full workout to a rest day

━━━━━━━━━━━━━━━━━━━━
BUILD YOUR PROTOCOL, KEEP YOUR STREAK
━━━━━━━━━━━━━━━━━━━━
• Define your own "clean day": a hydration target, sleep hours, the meds and supplements to take, the triggers to avoid
• Every day is matched against your protocol automatically, so you see at a glance whether you stayed on plan
• Clean days build a streak, with your longest run and a 30-day consistency rate — the discipline that actually drives recovery

━━━━━━━━━━━━━━━━━━━━
TRACK EVERYTHING THAT MOVES THE NEEDLE
━━━━━━━━━━━━━━━━━━━━
• Water, meals and food triggers, medications and supplements, symptoms, activities, sleep, blood pressure and orthostatic stand tests
• Digestion and bowel movements too — the whole picture, not just heart rate
• Make it yours: add your own meds, supplements, symptoms and triggers as custom types

━━━━━━━━━━━━━━━━━━━━
FIND WHAT HELPS OR HURTS
━━━━━━━━━━━━━━━━━━━━
• Analysis across days, weeks and months: spot the salt, sleep, pacing or medication changes that move your numbers
• On-device correlations surface your real triggers over time
• Milestones so recovery actually adds up
• Optional: bring your own AI for a deeper written read of your data

━━━━━━━━━━━━━━━━━━━━
YOUR DATA NEVER LEAVES YOUR PHONE
━━━━━━━━━━━━━━━━━━━━
• 100% offline-first: no account, no cloud, no tracking, no ads
• Everything is stored on-device; you own it and can export it anytime
• Reads & writes Apple Health (HRV, resting HR, sleep, blood pressure, SpO₂, weight) only when you ask it to

Autonomic is a personal journal and education tool, not a medical device. It does not diagnose, treat, or prevent any disease. Always discuss protocol, medication, or supplement changes with your clinician.

7-day free trial, then $50/year. Cancel anytime.
```

Why this works: benefit-first opening line, the differentiators the competition
can't match (on-device clinical grading, honest artifact rejection, and true
privacy), plausible medical-adjacent authority *without* a diagnostic claim, and
the disclaimer up top of the legal zone where Apple review reads it.

---

## 6. Screenshots: tell the recovery story

Most installs are decided on the **first 2-3 screenshots** in the search results
carousel, before anyone reads a word. So the set does double duty: the first
three each stand alone as a reason to install, **and** all eight read as one
narrative — the arc from *"I'm lost in my symptoms"* to *"I can see myself
getting better."* People buy the ending. Show them reaching it.

The eight beats:

| # | Story beat | Screen to show | Caption (bold, benefit-led) |
| --- | --- | --- | --- |
| **1** | **The promise** | Live HRV session: full-screen glowing breathing ring + 5:00 timer + live HR | **"See your nervous system recover"** |
| **2** | **Measure** | HRV results: hero Autonomic Score + graded metric rows + LF/HF power bar | **"A clinical HRV lab in your pocket"** |
| **3** | **Understand** | Same results scrolled to the day's outlook + grade bands | **"Every reading graded — and what today is good for"** |
| **4** | **Make a plan** | Protocol editor: hydration target, sleep hours, meds to take, triggers to avoid | **"Build your own recovery protocol"** |
| **5** | **Live it** | Journal day: water ring, meds, symptoms, a logged bowel movement, triggers | **"Track it all — water, meds, symptoms, even digestion"** |
| **6** | **Stay consistent** | Streak screen: current streak, longest run, 30-day clean rate, tier | **"Clean days become a streak"** |
| **7** | **The payoff** | Analysis: RMSSD/HRV trend climbing across weeks over grade-zone bands | **"And watch your numbers climb"** |
| **8** | **Trust** | Privacy / offline statement frame | **"100% on your phone. No cloud, no account."** |

Why this order wins: it opens on the single most *distinctive* thing you own
(the glowing live-HRV screen — nothing else in the category looks like it),
proves the clinical credibility (2-3), reveals the feature no competitor has
(your protocol, 4), shows the daily habit is effortless (5), turns discipline
into a visible win (6), then delivers the emotional payoff every long-hauler is
searching for — **numbers going the right way** (7) — before closing on the trust
that seals a chronically-ill buyer (8).

Craft notes:
- **Caption band on top, ~⅓ of the frame**, phone fills the rest. Never ship bare
  screenshots; captioned sets consistently out-convert them.
- **Dark theme for 1-4** (the ring, protocol and grade colors glow on black);
  either theme after.
- **Add a small sub-caption** under a few headlines to name the audience and catch
  skimmers: *"For long-haul, POTS & dysautonomia recovery."* Screenshot text
  isn't indexed — write it for humans, not the algorithm.
- **Sizes:** 6.9" (iPhone 16 Pro Max) and 6.5" sets are required; Apple scales the
  rest. Portrait only (the app is portrait-locked).

**App Preview video (high ROI):** a 15-30s recording that walks the same arc —
one live breathing capture → the graded score → a glance at the protocol streak →
the climbing trend line. That 15 seconds is the whole story in motion, and almost
no competitor has an equivalent.

---

## 7. Category, review notes, and metadata

- **Primary category:** Health & Fitness. **Secondary:** Medical. (Medical as
  *secondary* signals seriousness without inviting the stricter Medical-category
  claim scrutiny that a primary Medical listing draws.)
- **Age rating:** 4+ (no objectionable content). Note "Infrequent/Mild Medical
  Information" if the questionnaire asks.
- **Privacy "nutrition label":** select **"Data Not Collected."** The app is
  offline-first with no account and `NSPrivacyTracking: false`, so this is a
  genuine, rare, and *marketable* answer. Make sure the label matches.
- **App Review notes (paste in App Store Connect):**
  > Autonomic is an offline, on-device personal journal for autonomic-nervous-
  > system recovery (HRV, symptoms, vitals). No account or login is required and
  > no data leaves the device or is collected by us. It is not a medical device
  > and makes no diagnostic or treatment claims; it does not report on COVID-19
  > case/testing data. HRV is captured from a Bluetooth heart-rate strap or read
  > from Apple Health. To test live HRV without hardware, use Menu > (demo/sample
  > data) > [add the exact path or a demo toggle here before submitting].
- **Support URL / Marketing URL:** point at `https://autonomic.care` (the
  landing site); its 50 SEO articles double as your App Store support content.
- **Keyword localization tip:** you get a *fresh* 100-char keyword field per
  localization. Adding **English (UK)** or **English (AU)** as an extra
  localization effectively **doubles your keyword budget** for the same English
  audience: put the ME/CFS set in one and the biofeedback set in the other.

---

## 8. Keyword research: grouped by intent & competition

Ranked roughly by (relevance × searchability ÷ competition). Chase the mid-tail
first; you will not beat entrenched apps for "heart rate" on day one.

**Tier 1: high-intent, winnable (spend your best fields here):**
`pots tracker` · `dysautonomia` · `hrv tracker` · `long covid` · `post viral` ·
`vagal tone` · `orthostatic` · `me cfs` · `pacing` · `rmssd` · `symptom tracker`

**Tier 2: strong support (keyword field + description):**
`heart rate variability` · `sdnn` · `pnn50` · `chest strap hrv` · `resonance
breathing` · `coherence` · `vagus nerve` · `resting heart rate` · `stand test` ·
`symptom tracker` · `post exertional malaise` · `pem`

**Tier 3: broad / aspirational (don't overspend; high competition):**
`hrv` · `heart rate` · `breathing` · `recovery` · `wellness` · `biofeedback` ·
`nervous system` · `stress`

**Long-tail to seed in the description + landing content (free organic reach):**
"is it long covid or POTS", "how to measure HRV at home", "chest strap HRV app",
"HRV biofeedback for long covid", "POTS symptom tracker offline". You already
have articles for most of these in `landing/articles/`; link the App Store
support URL to them so the funnel closes.

---

## 9. Your unfair advantages: lead with these everywhere

When you're deciding what to cut, keep whatever hits one of these. No mainstream
HRV app (Elite HRV, HRV4Training, Welltory, Visible, Bearable) does *all* of it:

1. **Clinical-threshold grading, not a black-box "readiness" number.** You show
   the actual bands. That's trust.
2. **Honest artifact rejection:** refuses to fake a score on a noisy reading.
   Nobody advertises this because nobody else does it.
3. **True on-device privacy:** no account, no cloud, "Data Not Collected." For
   a chronically-ill audience burned by data-hungry apps, this *is* the pitch.
4. **Built by someone who needed it**, for the exact long-haul/POTS/dysautonomia
   niche, not a general wellness app bolting on a condition tag.
5. **Full frequency-domain + PNS/SNS/coherence math** most consumer apps never
   expose, in language this audience already reads (they know what RMSSD is).
6. **Your own protocol, not the app's.** You define the "clean day" — hydration,
   sleep, meds, triggers — and the app holds you to it with streaks and a
   consistency rate. HRV apps measure; almost none help you *stick to a plan*.

---

*Last updated 2026-07-11. Char counts assume the ⭐ recommended Name + Subtitle;
recount if you swap fields, and re-verify the keyword field is ≤100 with no
double-spaces before you paste into App Store Connect.*
