# Week 1 — Launch week runbook (Tue 21 – Fri 24 July 2026, spill to Mon 27)

**Companion docs:** `MARKETING_PLAN.md` (the 12-month strategy this executes) ·
`COMPETITOR_INTEL.md` (the research behind it) · `../mobile/STORE_SETUP.md` (the
store-side runbook) · `../landing/PRE_LAUNCH.md` (site blockers)

**Precondition — now met:** **iOS *and* Android were both approved the morning of
Tue 21 Jul.** This is a Tuesday start with everything live, so the old
"contingency if the stores slip" is gone — every item below runs. What a
Tuesday start costs you is one working day: the two longest fuses that used to
sit on Monday now start today, and Friday's overflow lands on Mon 27.

---

## 0. The thesis: this is a lead-time week, not a posting week

Almost nothing below is visible to the public. Week 1 is for lighting long fuses
and fixing things that would otherwise waste traffic. The posting comes later,
and it comes later *on purpose*.

**Why now and not August.** `MARKETING_PLAN.md` §4 assumes an August start. That
calendar no longer works, because the plan's own rule (§6.1) is that the Reddit
residency needs **6–8 weeks of genuine participation before any launch post** —
and the Reddit launch post is the single most proven channel for this exact
product.

| Start | Residency ends | Launch post | October (Awareness Month) |
| --- | --- | --- | --- |
| **Tue 21 Jul** | mid-Sep | **mid-Sep** | ~2 weeks of runway into the §8.4 spike ✅ |
| Aug (as written) | late Sep / Oct | Oct | collides with or misses the spike ❌ |

Starting Tuesday instead of Monday is a one-day slip on a six-week clock —
immaterial *as long as the residency clock actually starts today* (§2). The same
lead-time math binds the Apple featuring nomination (6–12 weeks; October is now
~10 weeks out — already at the edge, so it goes in today) and the Health Rising
pitch. The whole year's first spike is scheduled off decisions made this week.

---

## 1. What changed since `MARKETING_PLAN.md` was written

Four deltas the plan doesn't account for. They reshape the week.

### 1.1 The free tier already shipped ✅

The plan calls "ship a real free tier by October" its **most important product
ask** (§3.1) and flags the hard paywall as a High/structural risk suppressing
community recommendation loops (§13). **The shipped build is freemium.** That
risk is retired, and the community loops (Reddit, Facebook groups, org
partnerships, creator content) work from day one instead of October. This is
what lets the calendar pull left.

### 1.2 Both apps are live — so the iOS name/subtitle is now a *next-version* ASO fix 🟠

This is the item that most directly answers "why is my app ranked so low?" (see
§1.4). The apps shipped with:

| Field | Today (as shipped) | Should be (plan §4.2) |
| --- | --- | --- |
| iOS name | `Autonomic` | `Autonomic: POTS & HRV Tracker` |
| iOS subtitle | *(none)* | `Dysautonomia & Long COVID log` |
| Play name | `Autonomic Journal: HRV & POTS` | ✅ fine |

App name + subtitle are the **highest-weighted indexed ASO fields**, and the iOS
build shipped with the name half-used and **no subtitle at all** — the single
biggest free relevance lever is sitting idle. On iOS these fields **only change
with a version submission**, and the build is now approved, not in review — so
this is no longer a "fix it before it locks" emergency. It becomes a **queued
change for the very next point release** (§6). Do not skip it: it is the lever
that moves you up the search results, and it costs one submission.

### 1.3 autonomic.care now contradicts itself the *other* way 🔴

The old blocker (a dead iOS download button under an "available now" headline)
is fixed — the App Store badge points at the real store URL. But the site was
built iOS-only: the hero still says **"Coming soon on Android,"** the FAQ says
Autonomic is **"iOS-only for now,"** and the page carries a full **Android
waitlist** section. **Android is live as of this morning.** Every Android visitor
now gets told to join a waitlist for an app they can already download. This is
the top site fix of the week — details in §2.

### 1.4 The App Store search-ranking question (read this before you panic)

The concern — *"I searched 'autonomic' on the App Store and my app is buried
under lower-quality, unrelated, differently-named apps"* — is **normal for a
brand-new app, and it self-corrects only partway.** Apple's search rank is two
forces multiplied together:

1. **Text relevance** — how well the query matches your indexed fields, in
   weight order: **app name → subtitle → keyword field**. A brand-new app with
   the name half-filled and no subtitle (§1.2) is handing away the biggest half
   of this.
2. **Behavioral / popularity signal** — downloads, tap-through, conversion rate,
   ratings volume and velocity, retention. **A day-old app has almost none of
   this**, so Apple has no evidence yet that you're the result people want, and
   ranks established apps above you even on your own brand word.

What that means concretely:

- **Some of it fixes itself.** As installs, ratings and conversions accumulate
  over the coming weeks, the behavioral signal builds and you climb — *for the
  terms your metadata actually targets.* This is the single biggest reason the
  whole rest of this runbook exists: it manufactures that signal.
- **Some of it will not fix itself.** "Autonomic" is a generic dictionary word,
  so unrelated medical/other apps legitimately match it, and the empty subtitle
  means you're under-indexed even for your own category terms. Ranking *never*
  climbs into fields you didn't fill. **The fix is the §1.2 name+subtitle
  submission**, not waiting.
- **Guaranteeing the top slot on your own brand word is a paid move, cheaply.**
  Even a well-optimized new app can sit below squatters on an exact brand search
  for a while. The standard defense is an **Apple Search Ads brand campaign on
  `autonomic`** (§5) — near-zero cost because nobody else bids your name, and it
  pins you to the #1 slot above the unrelated apps *today* while organic rank
  catches up.

**Short version to tell yourself:** *yes, it improves as you get traction — but
"traction" is downloads + ratings + a filled-in subtitle, none of which happen
by waiting. Fill the subtitle next submission, run a $-few/day brand ASA
campaign, and the burial resolves in weeks, not never.*

---

## 2. Tuesday (today) — light the two longest fuses *and* fix the site

The residency clock and the featuring nomination used to be Monday's job. On a
Tuesday start they are today's job, non-negotiable — every day of residency delay
is a day off the October window.

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
      Aim it at **October** — it's ~10 weeks out, so this genuinely cannot slip a
      day. Re-nominate every release.
- [ ] **Fix the site's Android contradiction (§1.3).** Now that Android is live,
      `landing/src/routes/+page.svelte` needs, in one pass:
  - Hero: `Coming soon on Android` → a real **"Get it on Google Play"** badge
    linking to `https://play.google.com/store/apps/details?id=com.autonomic.journal`
    (package confirmed in `mobile/app.json`), alongside the existing App Store
    badge.
  - FAQ: the "Is Autonomic available on Android?" answer ("Not yet… iOS-only for
    now") → "Yes — available now on Google Play," and drop the waitlist pitch.
  - The `#waitlist` section: retire it (or repoint it to the Play badge). The
    "available now on iOS, Android coming soon" CTA copy becomes "available now on
    iOS **and** Android."
  - `SoftwareApplication` JSON-LD: it currently advertises one `downloadUrl`
    (App Store). Either leave it iOS-anchored or add the Play URL — but the
    human-visible copy is what actually misleads a visitor, so fix that first.
  - Keep the waitlist GA plumbing (`waitlist_signup`) harmless if you leave the
    script in; just make sure no *visible* "coming soon / join the waitlist"
    Android copy survives the pass.

> Everything else waits; these four do not. The site fix is here (not Friday)
> because it's the one change actively costing you installs every hour it's live.

---

## 3. Wednesday — the free money + verify the release

- [ ] **Apply to the App Store Small Business Program.** 15% vs 30% is a **21%
      revenue raise for one form**, and it is *not automatic*.
- [ ] **Apply to the Google Play equivalent** — the first $1M/yr is at the 15%
      service fee, but confirm the account is enrolled; don't assume.
- [ ] **Google Search Console** — verify property, submit
      `https://autonomic.care/sitemap.xml`.
- [ ] **Bing Webmaster Tools** — verify + submit sitemap. **Bing feeds ChatGPT.**
      Every indie skips this; it's the cheapest GEO move available.
- [ ] **End the introductory trial offers** — ⚠️ **only after confirming the
      freemium build is the one users actually download**, not merely approved.
      `STORE_SETUP.md` Part 1 is emphatic about this order: killing the offers
      while anyone is still on an old paywalled build leaves a dead-end app and a
      plausible 1-star wave. Both stores approved this morning; confirm the
      freemium binary is the live/released one on each, then follow Part 3.

---

## 4. Thursday — press & partnerships (all long lead)

These are worthless if you send them in September. **Blocked on the press kit
(§6) — so if the kit isn't built Wednesday night, build it this morning first.**

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

> **Now that Android is live, say so in every pitch** — "on iOS and Android"
> widens the audience an org can send members to, and removes the "my people are
> on Android" objection that quietly kills half of these outreach threads.

---

## 5. Friday — instrument, record, and queue the ASO submission

- [ ] **Apple Search Ads on at ~$10/day.** Exact match: `pots tracker`, `pots
      app`, `dysautonomia`, `orthostatic`, `long covid tracker`, `hrv journal`.
      Competitor brands: `welltory`, `visible app`, `bearable`, `cardiogram`
      (Cardiogram is dead as of Nov 2025 — its users are actively searching for a
      home). **Add a brand campaign on `autonomic` itself** — this is the cheap
      fix for the "buried under unrelated apps on my own name" problem (§1.4);
      nobody else bids your name, so it pins you to slot #1 while organic rank
      builds. Discovery at 10% of spend. **Kill anything above ~$25/trial.**
- [ ] **Queue the iOS name + subtitle change (§1.2) for the next point release.**
      Name → `Autonomic: POTS & HRV Tracker`, subtitle → `Dysautonomia & Long
      COVID log`. It only ships with a version submission, so fold it into the
      first post-launch build rather than cutting a release just for it — but
      don't let it slide past the next one. This is the organic half of the §1.4
      ranking fix.
- [ ] **Decide on RevenueCat.** The plan (§4.3) wants it so every channel is
      measured to *trial* and *paid*, not installs. But the app uses
      `react-native-iap` directly, so swapping is a **native module change** →
      new build → new review on *both* platforms now.
      **Recommendation: don't swap now.** At $10/day, store-side install
      attribution + unique offer codes per channel is enough signal. Revisit
      before paid spend scales in Q2. Don't delay on measurement you can't yet
      act on.
- [ ] **Batch-record the founder format**: *"watch my heart rate when I stand
      up"* on the live HRV screen. The most-replicated POTS format on the
      platform, and the product *is* the payoff shot. Record **6–8**. Start
      posting once there's a buffer, not from a standing start.

---

## 6. The press kit (build Wednesday night; it blocks Thursday)

- [ ] **Press kit page** on autonomic.care — screenshots, founder photo,
      boilerplate, and a **data-flow diagram showing nothing leaves the device**.
      Every §4 pitch links to it, so it actually blocks Thursday. Now that both
      platforms are live, the boilerplate reads "on iOS and Android."

---

## 7. Monday 27 — overflow only

A four-day launch week (Tue–Fri) will leave a tail. Anything from Friday that
didn't finish — the founder-clip batch, the ASA brand campaign, the next-version
ASO submission — lands here. Nothing *new* starts Monday; this is slack, not a
fifth planning day.

---

## 8. Explicitly not this week

| Don't | Why |
| --- | --- |
| Post the Reddit launch | Needs 6–8 weeks of residency first (§6.1 of the plan). Posting early burns the channel permanently. |
| Cut a release *only* to fix the iOS subtitle | Fold it into the next point build (§5). One review cycle, not two. |
| Run Meta ads | Plan zeroes them until Q4 (§9). The Jan-2025 health crackdown removed condition targeting. |
| Show HN / Product Hunt | Month 2–3, so they reinforce the press cycle instead of firing into a vacuum (§6.5). |
| Post to the socials cold | Record first (§5), post from a buffer. |
| Name competitors in social/ads | Comparison pages and search ads only. This community punishes trash-talk and rewards receipts (§5 of the plan). |
| Promise recovery, anywhere | Non-negotiable (§2 of the plan). "See what's helping," never "get better." |

---

## 9. Done looks like (by Fri 24, tail on Mon 27)

- [ ] Reddit residency clock started **Tuesday**, mods contacted (→ launch post mid-Sep)
- [ ] Featuring nomination submitted Tuesday, aimed at October
- [ ] Site tells the truth on Android: Play badge live, waitlist retired, FAQ updated
- [ ] Small Business Program applied (21% revenue raise); Play fee tier confirmed
- [ ] Search Console + Bing indexed
- [ ] Trial offers ended **only after** confirming the freemium build is the live one
- [ ] 6 outreach emails out, all "on iOS and Android," all with weeks of lead
- [ ] ASA running at $10/day with a kill threshold **+ a brand campaign on `autonomic`**
- [ ] Press kit live
- [ ] iOS name + subtitle queued for the next point release
- [ ] 6–8 stand-test clips in the can

**The one number to watch this week:** none. Nothing here produces installs in
July. Week 1 buys September and October. The search-rank burial you're seeing
today (§1.4) is the *absence* of this week's work showing up — it lifts as the
work lands, not before.
</content>
</invoke>
