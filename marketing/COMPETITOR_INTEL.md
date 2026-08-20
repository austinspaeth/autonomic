# Competitor Intelligence — Autonomic

Research date: **July 2026** (~80 web queries across four research passes). Facts marked
*(unverified)* came from search snippets or single sources — re-check before quoting them
in public copy. Companion doc: `MARKETING_PLAN.md` (the strategy built on this intel).

---

## 1. Welltory — the incumbent to raid, not to fight

**What they are:** ~16M installs, ~$8–10M/yr revenue run-rate *(Sensor Tower estimate,
unverified)*, 51–200 employees, only ~$1M equity raised plus a **$2M revenue-based credit
line (Braavo, Nov 2025) explicitly earmarked for paid advertising**. 70% YoY revenue
growth claimed for 2024 (Deloitte Fast 500 #202 North America).

**Positioning:** drifting. "Get your life back" → "#1 all-in-one health app" → (late 2025)
**"AI Health Companion"** with insurance/coaching upsells. 2026 focus verticals per their
own PR: perimenopause, hypertension, diabetes risk, chronic stress. **They are vacating
the focused HRV / autonomic-recovery niche.** Science credibility pages lean on
"HRV backed by 20,000+ studies" and a real peer-reviewed PPG validation
(r = 0.77–0.94 vs 12-lead ECG, Comput Methods Programs Biomed 2022).

**Pricing/monetization:**
- **$119.99/yr** (monthly plan phased out on iOS to force annual); $599 lifetime *(weakly verified)*.
- **3-day trial**, auto-renews into the annual charge; refunds only within ~48h.
- **Free tier deletes measurement history older than 30 days** (help.welltory.com article 10080275).
- Perpetual 25–75% discount codes → sticker price is fiction; price integrity is weak.

**How they grow:** SEO/ASO + paid UA + PR — *not* community. Programmatic device landing
pages (`/devices/garmin-hrv-app`, `/devices/apple-watch-hrv-app`, …), large blog,
localized App Store titles ("Welltory: Health, Heart Rate" US), 4.6★/~58K reviews on
Play, 5M+ Android installs. Owned social is tiny relative to install base
(~49K Instagram, ~4.3K TikTok) — the community flank is undefended.

**Reputation attack surface (all recurring on Trustpilot / Play reviews):**
1. Auto-renew "subscription trap" + 48-hour refund window + AI-only support ("Meagan" handles 75% of tickets).
2. 30-day data deletion on free tier — data hostage-taking.
3. Score volatility — "energy/stress" numbers swing reading-to-reading; users distrust the black box even though the raw PPG is validated.
4. Cloud-only analysis + Russian-founder privacy whispers (founded 2016 by Smorodnikova/Pravdin/Lyskovsky, now Redwood City HQ).

**How Autonomic wins against them:** don't outspend — **counter-position.** They promise
not to sell your data; Autonomic never has it. They delete history; Autonomic can't touch
it. Their scores are a black box; Autonomic's thresholds are published. Their trial is 3
days; ours is 7. They cost $119.99; we cost $49.99. Target their unhappy chronic-illness
segment (dysautonomia/POTS/long COVID users are precisely the ones angriest about data
deletion and pricing) via comparison content + Apple Search Ads on "welltory".

---

## 2. Visible — the category leader (pacing), closest strategic threat

- **Positioning:** "Activity tracking for illness, not fitness." Long COVID / ME-CFS first, POTS secondary. 250,000+ users claimed; has a Wikipedia page.
- **Pricing:** free tier (morning camera HRV check-in) + **Visible Plus ~$160–180/yr bundled with a Polar-made armband**. iOS + Android. HSA/FSA-eligible (Truemed).
- **Funding:** $1M pre-seed Nov 2022 (Octopus Ventures, Calm/Storm, Hustle Fund) — founder Harry Leeming, an engineer with long COVID.
- **The playbook that built them (copy it):** 4,500-person waitlist → free-app launch → founder-as-patient earned media (TechCrunch, Fortune, MIT Tech Review) → patient-community gatekeepers (Health Rising deep-dive, ME Association endorsement, Rory Cellan-Jones Substack) → **research-as-marketing** (Imperial College studies, Patient-Led Research Collaborative, in-app study enrollment, peer-reviewed preprint) → outcome-stat ads ("86% feel more in control", "Join 250,000+").
- **Complaints:** free tier "pretty useless" without the armband; subscription steep for disabled users on fixed income; pacing model ignores cognitive/sensory exertion; exertion alerts can be anxiety-inducing; data lives in their cloud (research aggregation *is* the business model).
- **Risk to monitor:** Visible expanding from pacing into full journaling/doctor reports. Speed to lock the POTS orgs, POTS ASO keywords, and the privacy story matters more than feature breadth.

## 3. Bearable — the Reddit-native generalist

- "Track pain, mood & medication" — everything-tracker for chronic illness + mental health. 900K+ users, 4.8★/~4K iOS ratings. **$34.99/yr (often discounted to $18.99)** + free tier + hardship sponsorship program. Two devs + one marketer, bootstrapped.
- **Growth:** born on Reddit — founder James Saady (chronic migraine) co-designed it inside r/ChronicIllness, r/migraine, r/endo for ~2 years; 0→100K users in ~1 year with no paid marketing; still runs official Reddit + Discord. Aggressive SEO listicles that rank for *other* categories, including **"Top 5 Best Apps For Managing PoTS"** (bearable.app/best-pots-app-2024/).
- **Complaints:** data-entry exhaustion ("the more you log, the more exhausting it becomes"), 5-year-old Apple Health sleep-sync bug, shallow wearable integration, **no HRV capability at all**.
- **Lesson + attack:** their playbook (patient-founder building in public on Reddit) is the proven zero-budget path. Their weakness (manual-entry burden, no measurement science) is answered by Autonomic's BLE/HealthKit auto-capture.

## 4. Guava Health — records aggregator

Chronic-illness records hub (imports from 50K+ US providers) naming POTS/EDS/MCAS/ME-CFS.
Real free tier; VC pre-seed (ScOp, Panasonic Well, AARP AgeTech). B2B2C provider-dashboard
motion. Cloud-hosted PHI by design — the anti-Autonomic on privacy. No meaningful HRV.

## 5. HRV incumbents (athlete-framed, none patient-framed)

| App | Model | State |
|---|---|---|
| Elite HRV / CorSense | Free app + $169 sensor + coach dashboards | Pivoted to B2B (Spren); consumer app in maintenance — **orphaned users** |
| HRV4Training | $9.99 one-time, camera-validated | Founder-scientist (Marco Altini) marketing masterclass: Substack, papers, podcasts, Oura/TrainingPeaks co-marketing. Athletes only — zero patient positioning |
| Kubios | ~$770/2yr scientific license + consumer app | Defines the clinical vocabulary (time/frequency domain, artifact correction) Autonomic already speaks |

## 6. Apple Watch recovery tier (price anchor warning)

Athlytic (~$25–30/yr), Bevel (free + $99/yr Pro, went free Dec 2025 — price war),
Training Today (~$10 one-time). Users themselves call wrist-HRV flaky — **validates the
chest-strap story**. Sub-$30/yr is the anchor for "app-only recovery scores," so $49.99
must be justified on clinical depth + doctor reports, never on a "recovery score."

## 7. POTS-specific / pacing layer (fragmented hobby tier)

POTSie (free, solo dev with POTS, launched on HN), POTS Tracker – Tachycardia (claritydtx),
POTS Buddy (2025 watch app with guided sit-to-stand test), SALT for POTS, Beat Watcher,
Emerge Australia's free pacing app. **Pattern: free hobby projects with no measurement
science.** At the other extreme: **STAT Health** — $5.1M-funded in-ear blood-flow wearable,
Johns Hopkins/JACC validation, ~$600/yr target price.

**The empty cell Autonomic occupies:** *clinically serious + software-only + affordable +
POTS/dysautonomia-first + private.* Nobody else is in it.

## 8. Adjacent proof points

- **Qaly** ($180/yr human ECG over-reads): proves patients pay real money for *clinician-credible interpretation*; grows via patient-org co-promotions (StopAfib.org).
- **Cardiogram** (dead as of ~Nov 2025): generic "heart insights" without a condition-specific purpose couldn't sustain a subscription. Its orphaned arrhythmia/POTS-adjacent users are searchable and reachable.

---

## 9. Pricing landscape (context for $49.99/yr)

| Product | Price | Hardware |
|---|---|---|
| Training Today | ~$10–15 one-time | Apple Watch |
| HRV4Training | $9.99 one-time | camera |
| Bearable Premium | $34.99/yr (often $18.99) | none |
| Athlytic Pro | ~$25–30/yr | Apple Watch |
| **Autonomic** | **$49.99/yr** | user-owned strap (~$90 Polar H10, one-time) |
| Bevel Pro | $99.99/yr | Apple Watch |
| Welltory | $119.99/yr | camera/wearables |
| Visible Plus | ~$160–180/yr | proprietary armband |
| Qaly | $180/yr | ECG device |
| STAT Health | ~$600/yr target | proprietary earpiece |

$49.99 sits in a credible gap — above the toy tier, under a third of Visible, no hardware
rent. Watch-outs: this community is extremely price-sensitive (Bearable's discounting and
hardship program exist for a reason), and **a real free tier is the community-
recommendation entry ticket everywhere** — the hard paywall is Autonomic's biggest
structural marketing handicap (see plan §3).

## 10. Channel saturation map

**Saturated / enter only with a differentiated story:** Reddit chronic-illness subs
(Bearable beloved), Meta paid ads to long-COVID audiences (Visible's turf + Meta's 2025
health-targeting crackdown), generic "best symptom tracker" SEO (Bearable owns it).

**Proven but unlocked for POTS specifically:** patient-org partnerships (Visible owns
ME Association/PLRC/Imperial; STAT owns Workwell/Health Rising; **Dysautonomia
International, Standing Up to POTS, The Dysautonomia Project, PoTS UK have no deep app
partner**), Health Rising-style launch deep-dives, research/clinic credibility as PR,
waitlist + founder-story launch mechanics.

**Underused by everyone:** privacy positioning (nobody markets on-device data),
TikTok/Reels chronic-illness creators (huge #POTS reach, no tracker owns it), the
clinician channel for dysautonomia ("have your patient bring this report"), **ASO on POTS
keywords (currently won by hobby apps)**, YouTube patient-framed HRV education (all HRV
YouTube is athlete-framed).
