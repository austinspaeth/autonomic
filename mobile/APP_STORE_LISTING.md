# App Store listing & ASO kit — Autonomic

Ready-to-paste copy and a screenshot plan for the App Store Connect listing.
Targets: **long COVID**, **HRV capture**, **POTS/dysautonomia**, and the
adjacent recovery audience (ME/CFS, post-viral, vagal tone). Written to match
the landing brand voice ("See your nervous system recover") and the shipping
feature set. Not a medical device — copy avoids diagnose/treat claims on purpose.

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
   Name/Subtitle/Keywords — each duplicate is wasted index space.
3. **The keyword field has no spaces after commas**, no plurals if the singular
   is present (Apple stems), no "app", and no category words ("health",
   "fitness"). Every wasted character is a lost keyword.

⚠️ **COVID compliance risk — decide before you submit.** Apple Review Guideline
5.1.1(ix) restricts apps using **COVID-19** themes to "recognized entities"
(governments, hospitals, medical/credentialed institutions). A solo-dev wellness
app naming COVID prominently can draw a rejection or a request for credentials.
Two mitigations, in order of safety:
   - **Safer:** lead with **"post-viral"**, **"long-haul"**, **"post-COVID
     recovery"** framing in visible fields, keep **"long covid"** only in the
     hidden keyword field, and make the medical disclaimer explicit in the
     description + review notes. Apple has been far more permissive about *long
     COVID / post-viral recovery* tracking than about COVID-19 *testing/tracing*.
   - **If rejected:** reply in Resolution Center that the app is a personal
     symptom/HRV journal, stores everything on-device, makes no diagnostic
     claims, and does not report on COVID-19 case data. That's usually enough.

---

## 1. App Name (30 chars) — pick one

Brand + your single most valuable keyword. POTS and HRV are high-intent and
lower-competition than "long covid"; put one of them here.

| Option | Chars | Notes |
| --- | --- | --- |
| **`Autonomic: HRV & POTS Tracker`** ⭐ | 29 | Recommended. Brand + two strongest keywords. |
| `Autonomic — HRV for Recovery` | 28 | Softer, broader; drops POTS to keywords. |
| `Autonomic: HRV, POTS & Vagal` | 29 | Adds vagal-tone crowd; "Tracker" moves to subtitle. |

> ⭐ = recommended. "Tracker" is worth keeping in the name — it's a real search
> term ("pots tracker", "hrv tracker") and it tells a browsing user what this is.

## 2. Subtitle (30 chars) — pick one

Different words from the name. This is where dysautonomia + the post-viral
audience live.

| Option | Chars | Notes |
| --- | --- | --- |
| **`Dysautonomia & post-viral care`** ⭐ | 30 | Recommended. Captures dysautonomia + post-viral without naming COVID in a visible field. |
| `Post-viral HRV & symptom log` | 28 | Adds "symptom log" intent. |
| `Track dysautonomia recovery` | 27 | Simplest; "recovery" reinforces the promise. |

## 3. Keyword field (100 chars) — paste exactly

Comma-separated, **no spaces**, no words already used in Name/Subtitle. This set
assumes the ⭐ Name + ⭐ Subtitle above (so it omits: autonomic, hrv, pots,
tracker, dysautonomia, post-viral, care).

```
long,covid,heart rate variability,vagal tone,rmssd,sdnn,me cfs,pacing,vagus,chest strap,orthostatic
```

Char count: **99/100.** Notes:
- `long` + `covid` as separate tokens → Apple recombines into "long covid"
  (and also lets you match "covid recovery", "long haul") while keeping COVID
  out of the *visible* fields per the risk note above.
- `heart rate variability` is spelled out **once**; combined with `hrv` in the
  name you cover both the acronym and the phrase.
- `me cfs` → matches "me/cfs", "cfs", "chronic fatigue" adjacency.
- Dropped low-value fillers ("health", "wellness", "app", plurals) on purpose.

**Alternate keyword set** if you'd rather chase the biofeedback / breathing
crowd instead of ME/CFS:
```
long,covid,heart rate variability,vagal tone,rmssd,sdnn,coherence,breathing,biofeedback,chest strap
```

## 4. Promotional text (170 chars) — updatable anytime, no review

Put your freshest hook here; you can change it without resubmitting.

> **Live 5-minute HRV from your chest strap or Apple Watch — every metric graded
> against medical thresholds, all on your phone. Built for long-haul & POTS
> recovery.** (160 chars)

---

## 5. Description (the conversion copy)

Apple shows only the **first ~3 lines** before "more". Those lines below the
fold carry the whole first impression — they're written to earn the tap.

```
See your nervous system actually recover.

Autonomic turns a heart-rate chest strap or your Apple Watch into a clinical-grade HRV lab in your pocket — then grades every reading against the same medical thresholds a specialist would use, so you finally know whether today was a good day or a warning sign.

Built for the long haul: long-hauler and post-viral recovery, POTS and dysautonomia, ME/CFS, and anyone rebuilding their autonomic nervous system one day at a time.

━━━━━━━━━━━━━━━━━━━━
LIVE 5-MINUTE HRV, DONE RIGHT
━━━━━━━━━━━━━━━━━━━━
• Capture beat-to-beat RR intervals live from a Bluetooth chest strap or Apple Watch
• A full-screen guided session with a 5:00 ring, live heart rate, and a paced breathing visualizer (4/6 resonance breathing and more)
• Every metric computed on-device: SDNN, RMSSD, pNN50, mean RR, PNS & SNS index, Baevsky stress index, VLF/LF/HF power, LF/HF, coherence, and more
• Honest signal quality — artifacts are flagged and corrected, and a noisy reading refuses to fake a score instead of lying to you

━━━━━━━━━━━━━━━━━━━━
GRADED LIKE A CLINICIAN WOULD
━━━━━━━━━━━━━━━━━━━━
• Every number is scored great / good / ok / warning / crash against real thresholds — no mystery "readiness" black box
• One daily Autonomic Score that rolls up HRV, sleep, symptoms, blood pressure and more
• Log readings, meds, symptoms, activities, meals, triggers, hydration, digestion and orthostatic stand tests

━━━━━━━━━━━━━━━━━━━━
FIND WHAT HELPS OR HURTS
━━━━━━━━━━━━━━━━━━━━
• Analysis across days, weeks and months — spot the salt, sleep, pacing or medication changes that move your numbers
• On-device correlations surface your real triggers over time
• Milestones and streaks so recovery actually adds up
• Optional: bring your own AI for a deeper written read of your data

━━━━━━━━━━━━━━━━━━━━
YOUR DATA NEVER LEAVES YOUR PHONE
━━━━━━━━━━━━━━━━━━━━
• 100% offline-first — no account, no cloud, no tracking, no ads
• Everything is stored on-device; you own it and can export it anytime
• Reads & writes Apple Health (HRV, resting HR, sleep, blood pressure, SpO₂, weight) only when you ask it to

Autonomic is a personal journal and education tool, not a medical device. It does not diagnose, treat, or prevent any disease. Always discuss protocol, medication, or supplement changes with your clinician.

7-day free trial, then $50/year. Cancel anytime.
```

Why this works: benefit-first opening line, the differentiators the competition
can't match (on-device clinical grading + honest artifact rejection + true
privacy), plausible medical-adjacent authority *without* a diagnostic claim, and
the disclaimer up top of the legal zone where Apple review reads it.

---

## 6. Screenshots — the real conversion driver

Most installs are decided on the **first 2–3 screenshots** in the search results
carousel, before anyone reads a word of description. Rules:
- **Caption every screenshot** with a big bold benefit line above the device
  frame — don't ship bare app screens. ~60–70% of the frame is the phone, top
  third is the caption band.
- Use your dark theme for screens 1–2 (the glowing HRV visualizer pops on dark)
  and prove the "graded against thresholds" story visually.
- 6.9" (iPhone 16 Pro Max) and 6.5" sets are required; Apple scales down.
  Portrait only (the app is portrait-locked).

Recommended order (first three are the ones that matter most):

| # | Screen to show | Caption (bold, benefit-led) |
| --- | --- | --- |
| **1** | Live HRV session — full-screen glowing breathing visualizer + 5:00 ring + live HR | **"A 5-minute HRV lab in your pocket"** |
| **2** | HRV results screen — hero Autonomic Score + graded metric rows + LF/HF power bar | **"Every number graded like a clinician would"** |
| **3** | Journal day view — readings, symptoms, meds, the daily score | **"Track everything that moves your recovery"** |
| **4** | Analysis / correlations — trend charts across weeks with grade-zone bands | **"See what's helping — or hurting — over time"** |
| **5** | Frequency-domain / tachogram detail (VLF/LF/HF, coherence) | **"Real HRV science: SDNN, RMSSD, PNS/SNS, coherence"** |
| **6** | Apple Health + chest-strap pairing screen | **"Works with your chest strap & Apple Watch"** |
| **7** | Privacy / offline screen (or a plain statement frame) | **"100% on your phone. No cloud. No account."** |
| **8** *(optional)* | Milestones / streaks | **"Watch recovery actually add up"** |

Micro-copy for the sub-caption line (smaller, under the headline) can name the
audience explicitly to catch skimmers: *"For long-haul, POTS & dysautonomia
recovery."* Screenshot text is **not** indexed for search, so this is purely for
humans — say what converts, not what ranks.

**App Preview video (optional, high ROI):** 15–30s screen recording of one live
breathing HRV capture flowing into the graded results screen. This single flow
is your entire pitch; nothing a competitor ships looks like it.

---

## 7. Category, review notes, and metadata

- **Primary category:** Health & Fitness. **Secondary:** Medical. (Medical as
  *secondary* signals seriousness without inviting the stricter Medical-category
  claim scrutiny that a primary Medical listing draws.)
- **Age rating:** 4+ (no objectionable content). Note "Infrequent/Mild Medical
  Information" if the questionnaire asks.
- **Privacy "nutrition label":** select **"Data Not Collected."** The app is
  offline-first with no account and `NSPrivacyTracking: false` — this is a
  genuine, rare, and *marketable* answer. Make sure the label matches.
- **App Review notes (paste in App Store Connect):**
  > Autonomic is an offline, on-device personal journal for autonomic-nervous-
  > system recovery (HRV, symptoms, vitals). No account or login is required and
  > no data leaves the device or is collected by us. It is not a medical device
  > and makes no diagnostic or treatment claims; it does not report on COVID-19
  > case/testing data. HRV is captured from a Bluetooth heart-rate strap or read
  > from Apple Health. To test live HRV without hardware, use Menu → (demo/sample
  > data) — [add the exact path or a demo toggle here before submitting].
- **Support URL / Marketing URL:** point at `https://autonomic.care` (the
  landing site) — its 50 SEO articles double as your App Store support content.
- **Keyword localization tip:** you get a *fresh* 100-char keyword field per
  localization. Adding **English (UK)** or **English (AU)** as an extra
  localization effectively **doubles your keyword budget** for the same English
  audience — put the ME/CFS set in one and the biofeedback set in the other.

---

## 8. Keyword research — grouped by intent & competition

Ranked roughly by (relevance × searchability ÷ competition). Chase the mid-tail
first; you will not beat entrenched apps for "heart rate" on day one.

**Tier 1 — high-intent, winnable (spend your best fields here):**
`pots tracker` · `dysautonomia` · `hrv tracker` · `long covid` · `post viral` ·
`vagal tone` · `orthostatic` · `me cfs` · `pacing` · `rmssd`

**Tier 2 — strong support (keyword field + description):**
`heart rate variability` · `sdnn` · `pnn50` · `chest strap hrv` · `resonance
breathing` · `coherence` · `vagus nerve` · `resting heart rate` · `stand test` ·
`symptom tracker` · `post exertional malaise` · `pem`

**Tier 3 — broad / aspirational (don't overspend; high competition):**
`hrv` · `heart rate` · `breathing` · `recovery` · `wellness` · `biofeedback` ·
`nervous system` · `stress`

**Long-tail to seed in the description + landing content (free organic reach):**
"is it long covid or POTS", "how to measure HRV at home", "chest strap HRV app",
"HRV biofeedback for long covid", "POTS symptom tracker offline" — you already
have articles for most of these in `landing/articles/`; link the App Store
support URL to them so the funnel closes.

---

## 9. Your unfair advantages — lead with these everywhere

When you're deciding what to cut, keep whatever hits one of these. No mainstream
HRV app (Elite HRV, HRV4Training, Welltory, Visible, Bearable) does *all* of it:

1. **Clinical-threshold grading, not a black-box "readiness" number.** You show
   the actual bands. That's trust.
2. **Honest artifact rejection** — refuses to fake a score on a noisy reading.
   Nobody advertises this because nobody else does it.
3. **True on-device privacy** — no account, no cloud, "Data Not Collected." For
   a chronically-ill audience burned by data-hungry apps, this *is* the pitch.
4. **Built by someone who needed it**, for the exact long-haul/POTS/dysautonomia
   niche — not a general wellness app bolting on a condition tag.
5. **Full frequency-domain + PNS/SNS/coherence math** most consumer apps never
   expose, in language this audience already reads (they know what RMSSD is).

---

*Last updated 2026-07-11. Char counts assume the ⭐ recommended Name + Subtitle;
recount if you swap fields, and re-verify the keyword field is ≤100 with no
double-spaces before you paste into App Store Connect.*
