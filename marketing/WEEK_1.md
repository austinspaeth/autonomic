# Week 1 — Launch week runbook (Mon 20 – Fri 24 July 2026)

**Companion docs:** `MARKETING_PLAN.md` (the 12-month strategy this executes) ·
`COMPETITOR_INTEL.md` (the research behind it) · `../mobile/STORE_SETUP.md` (the
store-side runbook) · `../landing/PRE_LAUNCH.md` (site blockers)

**Precondition:** iOS + Android live on the stores. See §7 if they slip — most of
this week runs anyway, and the parts that do are the parts that matter.

---

## 0. The thesis: this is a lead-time week, not a posting week

Almost nothing below is visible to the public. Week 1 is for lighting long fuses
and fixing things that would otherwise waste traffic. The posting comes later,
and it comes later *on purpose*.

**Why Monday and not August.** `MARKETING_PLAN.md` §4 assumes an August start.
That calendar no longer works, because the plan's own rule (§6.1) is that the
Reddit residency needs **6–8 weeks of genuine participation before any launch
post** — and the Reddit launch post is the single most proven channel for this
exact product.

| Start | Residency ends | Launch post | October (Awareness Month) |
| --- | --- | --- | --- |
| **Mon 20 Jul** | mid-Sep | **mid-Sep** | 2 weeks of runway into the §8.4 spike ✅ |
| Aug (as written) | late Sep / Oct | Oct | collides with or misses the spike ❌ |

The same lead-time math binds the Apple featuring nomination (6–12 weeks; October
is ~10 weeks from Monday — already at the edge) and the Health Rising pitch. The
whole year's first spike is scheduled off decisions made this week.

---

## 1. What changed since `MARKETING_PLAN.md` was written

Three deltas the plan doesn't account for. They reshape the week.

### 1.1 The free tier already shipped ✅

The plan calls "ship a real free tier by October" its **most important product
ask** (§3.1) and flags the hard paywall as a High/structural risk suppressing
community recommendation loops (§13). **v1.10.0 is freemium.** That risk is
retired, and the community loops (Reddit, Facebook groups, org partnerships,
creator content) work from day one instead of October. This is what lets the
calendar pull left.

### 1.2 The iOS App name and subtitle don't exist 🔴

`store-listing.md` has an App Store section with promotional text, keywords,
description and screenshots — but **no App name and no subtitle**. `app.json` is
just `"Autonomic"`. Play, meanwhile, has a proper keyword-rich name.

| Field | Today | Should be (plan §4.2) |
| --- | --- | --- |
| iOS name | `Autonomic` | `Autonomic: POTS & HRV Tracker` |
| iOS subtitle | *(none)* | `Dysautonomia & Long COVID log` |
| Play name | `Autonomic Journal: HRV & POTS` | ✅ fine |

Name + subtitle are the **highest-weighted indexed ASO fields**, and on iOS they
**only change with a version submission**. If the launch build is in review right
now, this is the most urgent item in this document: fix it before it locks, or
pay a second review cycle to fix the thing that drives free distribution.

### 1.3 autonomic.care is live and currently contradicts itself 🔴

The copy says "Available now on iOS" while the App Store badge still links to
`href="#"` (`PRE_LAUNCH.md` blocker #1, still open). Every visitor between now
and Monday hits a dead download button under an "available now" headline.

---

## 2. Monday — light the two longest fuses

- [ ] **Fix the App Store badge.** Real `apps.apple.com` URL in
      `landing/src/routes/+page.svelte` (~line 461) + add `downloadUrl` /
      `installUrl` to the `SoftwareApplication` JSON-LD. Nothing else this week
      matters if the download button is dead.
- [ ] **Begin the Reddit residency.** Zero promotion, zero links, no exceptions.
      Austin participates as a patient in **r/POTS, r/dysautonomia,
      r/covidlonghaulers, r/cfs** — answering measurement questions, posting his
      own data. **This clock starts today or October doesn't happen.**
- [ ] **DM the mods** of those four subs: *"patient-founder, built this, may I
      share when ready?"* Relationship-building, not outreach. Do it before you
      have anything to ask for.
- [ ] **Submit the Apple featuring nomination** (App Store Connect → Featuring
      Nominations). Pitch: patient-founder story + HealthKit/BLE/watchOS +
      privacy-as-architecture + accessibility (an explicit featuring criterion).
      Aim it at **October**. Re-nominate every release.

---

## 3. Tuesday — the free money

- [ ] **Apply to the App Store Small Business Program.** 15% vs 30% is a **21%
      revenue raise for one form**, and it is *not automatic*.
- [ ] **Google Search Console** — verify property, submit
      `https://autonomic.care/sitemap.xml`.
- [ ] **Bing Webmaster Tools** — verify + submit sitemap. **Bing feeds ChatGPT.**
      Every indie skips this; it's the cheapest GEO move available (§7.3).
- [ ] **End the introductory trial offers** — ⚠️ **only if the freemium build is
      actually *released*, not merely approved.** `STORE_SETUP.md` Part 1 is
      emphatic about this order: killing the offers while users are still on the
      old build leaves a paywall with no on-ramp, an unusable app, and a
      plausible 1-star wave. Verify the release first, then follow Part 3.

---

## 4. Wednesday — press & partnerships (all long lead)

These are worthless if you send them in September. **Blocked on the press kit
(§6) — build it first.**

| Who | Ask | Why now |
| --- | --- | --- |
| **Cort Johnson, Health Rising** | Review pitch: patient-founder + privacy-first + measurement science | The review that launched Visible. Highest-ROI single move available. |
| **The Sick Times** | Same angle | Weeks of lead |
| **Dysautonomia International**<br>`events@dysautonomiainternational.org` | October awareness-month collaboration · resource listing · DysConf 2027 exhibitor | **Their October planning happens now, in summer** |
| **Standing Up to POTS** | POTScast underwriting (nonprofit flat rate, ~100% audience match) + resource listing | Booking lead time |
| **PoTS UK · The Dysautonomia Project · #MEAction · Solve M.E.** | Resource-page listings + member offer codes | Free. ME Association did exactly this for Visible. |

- [ ] Health Rising pitch sent
- [ ] The Sick Times pitch sent
- [ ] Dysautonomia International emailed
- [ ] Standing Up to POTS emailed
- [ ] Four org resource-listing requests sent

---

## 5. Thursday — instrument before you spend

- [ ] **Apple Search Ads on at ~$10/day.** Exact match: `pots tracker`, `pots
      app`, `dysautonomia`, `orthostatic`, `long covid tracker`, `hrv journal`.
      Competitor brands: `welltory`, `visible app`, `bearable`, `cardiogram`
      (Cardiogram is dead as of Nov 2025 — its users are actively searching for a
      home). Discovery at 10% of spend. **Kill anything above ~$25/trial.**
- [ ] **Decide on RevenueCat.** The plan (§4.3) wants it so every channel is
      measured to *trial* and *paid*, not installs. But the app uses
      `react-native-iap` 13.0.4 directly, so swapping is a **native module
      change** → new build → new review.
      **Recommendation: don't swap now.** At $10/day, App Store Connect install
      attribution + unique offer codes per channel is enough signal. Revisit
      before paid spend scales in Q2. Don't delay launch for measurement you
      can't yet act on.

---

## 6. Friday — build, record, don't post

Only two things get built this week. Everything else the plan wants (comparison
pages, E-E-A-T upgrade, the 12 commercial articles, referral loops) is Weeks 2–4.
**Don't pull it forward.**

- [ ] **Press kit page** on autonomic.care — screenshots, founder photo,
      boilerplate, and a **data-flow diagram showing nothing leaves the device**.
      Every §4 pitch links to it, so it actually blocks Wednesday. Build it
      Tuesday night if Wednesday is tight.
- [ ] **iOS name + subtitle** (§1.2) — if the build hasn't locked.
- [ ] **Batch-record the founder format**: *"watch my heart rate when I stand
      up"* on the live HRV screen. The most-replicated POTS format on the
      platform, and the product *is* the payoff shot. Record **6–8**. Start
      posting once there's a buffer, not from a standing start.

---

## 7. Contingency: the stores slip

Everything runs **except** §2 badge fix, §3 trial-offer end, and §5 Apple Search
Ads. The Reddit residency, the featuring nomination, the Small Business Program
and all of Wednesday's outreach are **store-independent — and they're the ones
with the fuses.**

> **Do not let a store delay cost you the October window.** If the apps slip,
> the residency and the nomination still start Monday.

---

## 8. Explicitly not this week

| Don't | Why |
| --- | --- |
| Post the Reddit launch | Needs 6–8 weeks of residency first (§6.1). Posting early burns the channel permanently. |
| Run Meta ads | Plan zeroes them until Q4 (§9). The Jan-2025 health crackdown removed condition targeting. |
| Show HN / Product Hunt | Month 2–3, so they reinforce the press cycle instead of firing into a vacuum (§6.5). |
| Post to the socials cold | Record first (§6), post from a buffer. |
| Name competitors in social/ads | Comparison pages and search ads only. This community punishes trash-talk and rewards receipts (§5). |
| Promise recovery, anywhere | Non-negotiable (§2). "See what's helping," never "get better." |

---

## 9. Done looks like

- [ ] Download button works; site copy and reality agree
- [ ] Reddit residency clock started, mods contacted (→ launch post mid-Sep)
- [ ] Featuring nomination submitted, aimed at October
- [ ] Small Business Program applied (21% revenue raise)
- [ ] Search Console + Bing indexed
- [ ] 6 outreach emails out, all with weeks of lead
- [ ] ASA running at $10/day with a kill threshold
- [ ] Press kit live
- [ ] 6–8 stand-test clips in the can
- [ ] iOS name + subtitle fixed, or knowingly deferred to the next submission

**The one number to watch this week:** none. Nothing here produces installs in
July. Week 1 buys September and October.
