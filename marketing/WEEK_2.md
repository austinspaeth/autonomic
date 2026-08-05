# Week 2 — Plant the flags, turn on the engine (Mon 27 – Fri 31 July 2026)

**Companion docs:** `WEEK_1.md` (the launch-week runbook this follows) ·
`MARKETING_PLAN.md` (the 12-month strategy) · `COMPETITOR_INTEL.md` ·
`../landing/PRE_LAUNCH.md` (open site items)

**Note:** Mon 27 doubles as Week 1's overflow day — clear any Friday spillover
(founder-clip batch, ASA brand campaign, the iOS name/subtitle submission) before
starting anything new below.

---

## 0. The thesis: Week 1 lit the fuses; Week 2 switches on the compounding tracks

Week 1 was almost entirely invisible groundwork — residency started, featuring
nominated, ASA live, the store and site fixed. **None of it spikes; all of it
buys September and October.** Week 2 is where the *engine* comes on: your social
identity, the content that converts, and the posting cadence — the same three
things that also manufacture the behavioral signal that lifts your search rank
(the fix for the "buried on my own name" problem in `WEEK_1.md` §1.4).

Still not a posting-the-launch week. The big one-shot moments — the Reddit launch
post, Product Hunt, Show HN — stay sequenced for later so each lands on
accumulated proof instead of into silence (§7).

---

## 1. Carryover from Week 1 — keep these alive

- [ ] **Finish the Tuesday mod DMs** if any of the four subs (r/POTS,
      r/dysautonomia, r/covidlonghaulers, r/cfs) didn't get one:
      *"patient-founder, built this, may I share when ready?"*
- [ ] **Friends & family → honest written reviews.** Keep asking everyone who
      installs to leave a *genuine* written review (not just a star tap) — real
      reviews are the behavioral signal that fixes the search burial and lifts
      listing conversion. **Never script, incentivize, or pay for them** (App
      Store/Play remove apps for it, and this community smells fake 5-stars
      instantly). Space them over days, not all in one hour.
- [ ] **Reddit residency — the one clock that can't slip.** Stay in the threads a
      few times this week, same posture as day one: **substance in the comment,
      no links.** Even a perfect-fit article link is a burn this early — write the
      insight directly into the reply instead. A link is only OK if someone
      *asks* ("do you have a source?"), and even then: disclose you wrote it, and
      never the same link twice in a week. Week 2–3 is where credibility deepens
      ahead of the mid-Sep launch post.

---

## 2. Monday — clear overflow + claim your identity (it has lead time)

- [ ] **Clear Week 1's Friday tail** (see the note up top).
- [ ] **Claim the handles** — grab **@autonomicapp** (or chosen handle) on
      **TikTok, Instagram, X, YouTube**, including the ones you won't use yet.
      Squatters are cheap to prevent and expensive to undo.

---

## 3. Tuesday — wire the social identity into the site

- [ ] **Add `sameAs` JSON-LD** (the new social URLs) to the `Organization` schema
      and **`twitter:site` / `twitter:creator`** meta in `landing/src/app.html` —
      both are still open in `PRE_LAUNCH.md`, and they're what makes your social
      cards attribute the account.
- [ ] **Verify social cards render** — paste a few live URLs into the X Card
      Validator, LinkedIn Post Inspector, and Facebook Sharing Debugger; confirm
      `og.png` shows and there are no duplicate-tag warnings.
- [ ] **Set up the Meta ad account now.** You won't spend until Q4, but health-app
      account review takes weeks — get it approved and sitting idle rather than
      blocking you later.

---

## 4. Wednesday — turn on the commercial content layer (this is what converts)

Your 50-article library is topical scaffolding; what's missing is the
*commercial-intent* layer that turns a reader into an install. Start these — draft
this week, ship as they're ready:

- [ ] **"Best POTS apps 2026"** — include competitors honestly; it ranks *and*
      builds trust.
- [ ] **"Autonomic vs Welltory"** — factual table, every claim sourced from their
      own help center.
- [ ] **"Visible alternatives"** (+ "using Visible & Autonomic together") — real
      search volume, zero good answers today.
- [ ] **"How to show your doctor your POTS data"** — the wedge article.
- [ ] **The gear page: "Best HRV chest strap for POTS (2026)."** Fold the old
      "Polar H10 setup guide" idea into a recommend-and-own page: **budget pick
      (Coospo, ~$30) + premium pick (Polar H10, ~$90)**, both with **disclosed
      affiliate links**. This fits the positioning — a strap the user *owns
      outright*, the opposite of Visible's hardware rent — and doubles as a
      commercial-intent SEO asset. **Affiliate discipline (non-negotiable):**
      always disclose ("affiliate link, I'm the founder"), and never let the
      commission pick the device — recommend the best one honestly. The budget
      strap genuinely fits this cost-anxious ICP better than premium gear, which
      is what keeps the recommendation clean.

---

## 5. Thursday — sharpen the funnel with real Week 1 data

- [ ] **Review the ASA numbers** from Week 1's Friday start. Kill anything over
      ~$25/trial; double down on the cheap winners. Confirm the **brand campaign
      on `autonomic`** is holding slot #1 above the unrelated apps.
- [ ] **Build Custom Product Pages** (POTS / long COVID / HRV) and attach them per
      ASA ad group — condition-matched screenshots lift tap-through materially,
      and CPPs are free.
- [ ] **Buy a rank tracker** (Appfigures / Astro, ~$10–30/mo) so you can *watch*
      "pots tracker" / "dysautonomia" / "autonomic" move instead of guessing.
- [ ] **Respond to the first reviews** as they land (< 24h) — Apple/Play both
      weight developer responsiveness, and it models the "human support, not
      AI-only" brand.

---

## 6. Friday — start posting (from the buffer) + work the outreach replies

- [ ] **Begin the founder cadence.** You recorded 6–8 "watch my heart rate when I
      stand up" clips in Week 1. Start posting: **TikTok first**, recut for
      Reels/Shorts, **~3×/week**. Post from the buffer, never from a standing
      start; lead with data, never "download my app."
- [ ] **Chase the Week 1 outreach.** Reply fast to any Health Rising / Sick Times
      / org threads, send the press kit, book calls. A "yes" from Cort Johnson can
      reshape the quarter — treat replies as priority-one.

---

## 7. Explicitly not yet (same discipline as Week 1)

| Don't | Why |
| --- | --- |
| Post the Reddit launch | Still ~6 weeks of residency out. Posting early burns the channel permanently. |
| Product Hunt / Show HN | Month 2–3, paired with press — one-shot cards, don't fire into a vacuum. |
| Spend on Meta ads | Account setup only; spend is Q4 (§9 of the plan). |
| Launch the creator ambassador program | Q2. |
| Bundle a device with the subscription | Store IAP rules fight it and it makes you a hardware retailer — solo-founder trap. Affiliate captures the value without the overhead. |
| Sell a branded/proprietary device | It's the Visible/STAT model you win by *not* having. Recommend third-party gear; never sell your own. |
| Post the same link twice in a week / link without disclosure | Residency + affiliate rules both. Receipts, not spam. |

---

## 8. Done looks like (by Fri 31)

- [ ] Handles claimed on all four platforms; `sameAs` + Twitter meta live; cards verified
- [ ] Meta ad account submitted for review (idle, not spending)
- [ ] First commercial articles drafted; gear page live with disclosed affiliate links
- [ ] ASA pruned on real data; CPPs attached; rank tracker running
- [ ] First reviews answered < 24h
- [ ] Founder cadence started on TikTok (posting from the buffer, ~3×/week)
- [ ] Outreach replies worked; press kit sent to anyone who bit
- [ ] Reddit residency still warm — substance, no links

**The shift from Week 1:** Week 1 produced nothing visible on purpose. Week 2
produces the compounding assets — identity, content, cadence — that don't spike
but quietly build the traction (and the search rank) everything later stands on.
