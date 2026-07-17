# App Review rejection — resolution runbook

Rejection of **Autonomic: HRV & POTS Tracker** v1.7 (24), submission
`49ffd932-0b7a-46fc-b97b-003d6693f572`, reviewed July 17, 2026. Four guidelines
were cited. Everything here is an **App Store Connect action** except the
listing copy, which now lives updated in `store-listing.md`, and one paywall
copy tweak in `src/features/Paywall.tsx`.

The short version: none of the four issues requires a feature change. Two are
pure ASC housekeeping (2.1(b), 3.1.2(c)), one is fixed by the new description
(2.3.2), and one (1.4.1) is a misclassification to push back on in the
Resolution Center — the app connects to consumer fitness heart-rate straps,
not medical hardware, and the reply below makes that case.

> **The new binary must be built from current `main` (1.13.0), not the 1.7
> code.** The reviewed 1.7 build predates the freemium cutover (1.9.0): it was
> the subscription-required model, which is what actually triggered 2.3.2. The
> review notes and the §5 reply describe freemium behavior ("fully usable
> without a purchase", the 7-day local full-access window) — statements that
> are only true of 1.9.0+. Resubmitting the 1.7 binary with those notes would
> misrepresent the app to the reviewer and invite a repeat rejection.

| # | Guideline | What Apple wants | Fix |
| --- | --- | --- | --- |
| 1 | 2.1(b) App Completeness | The IAP subscriptions submitted for review with the binary | ASC: attach both subscriptions + review screenshot, resubmit (§1) |
| 2 | 2.3.2 Accurate Metadata | Paid features clearly labeled in the description | New description in `store-listing.md` marks every Pro feature (§2) |
| 3 | 1.4.1 Physical Harm | Regulatory docs for "medical hardware" — or show it isn't medical hardware | Resolution Center reply (§3) + wellness statement now in the description |
| 4 | 3.1.2(c) Subscriptions | Functional Terms of Use (EULA) link in the metadata | Terms link now in the description; verify + screen recording (§4) |

Do §1–§4, then send the combined reply in §5 with the new binary.

---

## §1 — Guideline 2.1(b): submit the In-App Purchases for review

The subscriptions exist but were never attached to a review submission, so the
reviewer couldn't complete the review. In App Store Connect:

1. **My Apps → Autonomic → Monetization → Subscriptions** → open the group →
   `com.autonomic.journal.yearly`.
2. Under **App Review Information**, add:
   - **Screenshot**: a screenshot of the in-app paywall card (the sheet from
     `usePaywall()` — Insights tab → any AI report card raises it). It must be
     a real device/simulator capture at an accepted size (e.g. 6.9" iPhone,
     1320×2868). This screenshot is only for the reviewer, not the store page.
   - **Review notes** (optional but helps): "Reachable via Insights tab → any
     AI report card, or Analysis tab → Week/Month/Year."
3. Repeat for `com.autonomic.journal.monthly`.
4. Make sure each subscription's **localization** (display name + description)
   is filled in — missing localization also blocks submission — AND the
   **subscription group's own App Store Localization** (the group display name,
   e.g. "Autonomic Pro", on the group page). An unlocalized group produces
   "Your auto-renewable subscription must be submitted with its subscription
   group" in the draft.
5. Upload a new build **from current `main`** (bump the marketing version in
   `app.json` past 1.7's if ASC requires it; `eas build --platform ios
   --profile production`) and select it on the version page. Before building,
   run the freemium preview check from `STORE_SETUP.md` Part 2 and confirm
   `FORCE_TIER` is `null` and `PREVIEW_PAYWALL` is `false` in the shipped
   commit.
6. Build the **review submission** (ASC's draft-submission model — items are
   added from each item's own page, not from inside the draft panel):
   - On the yearly subscription's page → **Add for Review** → Create New
     Submission (iOS).
   - On the monthly's page → **Add for Review** → same draft.
   - On the **App Store tab → version page** → **Add for Review** (top right;
     greyed out means version metadata is incomplete) → same draft.
   - The subscription group attaches automatically once its localization is
     complete.
   - Open the draft (sidebar → **App Review**): it should list the app
     version, the subscription group, and both subscriptions with no
     warnings. **Submit for Review** — both subscriptions flip to "Waiting
     for Review".

The first-ever auto-renewable subscription **must** be submitted together
with an app version — that's why Apple asked for a new binary even though the
app itself may not have changed. (After this first approval, subscriptions
can be submitted standalone.) If the original rejected submission is still
open in App Review, add the items to it and **Resubmit** instead of creating
a second draft — a platform can only have one submission containing an app
version.

## §2 — Guideline 2.3.2: label the paid features in the description

The reviewed v1.7 metadata described Pro features (POTS testing, unlimited
HRV, history, AI reports) without saying they're paid. The rewritten App Store
description in `store-listing.md`:

- states up front: "Features marked (Pro) below require Autonomic Pro, an
  optional auto-renewing subscription";
- tags each paid feature inline — the watch/POTS section header carries
  "(Pro)", the HRV section says "One capture a day free; unlimited is Pro",
  the analysis bullets carry "(Pro)";
- keeps the WHAT'S FREE, WHAT'S PRO section with the exact prices
  ($7.99/month, $49.99/year, billed to Apple ID, auto-renewing).

Action: paste the new description into the version's **Description** field.
Nothing else to do — this resolves with the metadata update.

## §3 — Guideline 1.4.1: the "medical hardware" claim

The reviewer concluded the app "connects to external medical hardware to
provide medical services." That's a misread, and other HRV apps (HRV4Training,
Elite HRV, Welltory, and every cycling app that pairs a strap) clear this by
clarifying rather than by producing regulatory documents. The position to
take, in one paragraph:

> The only external hardware the app can connect to is a **general-purpose
> consumer Bluetooth heart-rate monitor** (Polar-, Garmin-, Wahoo-style chest
> straps) via the **standard public Bluetooth SIG Heart Rate profile (GATT
> service 0x180D / characteristic 0x2A37)** — the same fitness accessories
> every running and cycling app pairs with. These are marketed and sold as
> sports equipment, not medical devices, and the app neither requires them
> (the camera and Apple Watch paths work with no accessory at all — the watch
> is read through Apple's own HealthKit) nor provides medical services: it is
> a personal wellness journal that logs and displays the user's own data,
> makes no diagnosis, and tells users to bring results to their doctor.

Supporting changes already made so the metadata matches that position:

- The description's IMPORTANT footer now says exactly this (wellness journal,
  no medical services, straps are consumer fitness accessories, no hardware
  required).
- The paywall feature row no longer says "graded against clinical criteria"
  (now "published research thresholds"), and "POTS testing" is now "POTS
  tracking" on that card. The stand-test result screen already carries a
  "Wellness screening only … Not a diagnosis" disclaimer, and disclaimers
  already exist in onboarding and Settings → Legal.

If the reviewer still insists after the reply, the fallback options (in order
of preference) are: (a) request a call with App Review — this guideline is
routinely resolved by phone; (b) appeal to the App Review Board; (c) as a last
resort, the literal compliance path — a jurisdiction statement is already
effectively covered by the "not medical hardware" footer, so escalation is
more useful than more copy.

**Do not** attach a strap manufacturer's regulatory filing — that concedes
the "medical hardware" framing and invites the full 1.4.1 documentation
burden (test reports, storefront restrictions) for hardware you don't make,
don't sell, and don't require.

### Round 2 (submission f57bdf07-0416-4061-b66a-fcfc410aab66, July 2026)

The resubmission cleared 2.1(b), 2.3.2 and 3.1.2(c); only 1.4.1 came back,
with the identical boilerplate — i.e. the classification argument alone
didn't land. Round-2 strategy is two-track: satisfy every literal bullet of
the rejection AND get a human conversation.

**Track 1 — book the conversation immediately.** The rejection itself offers
an **App Review Appointment** ("Meet with Apple", Tuesdays/Thursdays, local
business hours, subject to availability) — request one the moment the
rejection lands; slots go fast. This guideline is routinely resolved by
phone. Keep the appointment even if you also reply in writing.

**Track 2 — literal compliance with all three bullets, without conceding:**

1. *"Documentation … demonstrating the hardware works as described"* — Apple
   explicitly accepts a peer-reviewed study PDF. Attach these to the reply:
   - Gilgen-Ammann, Schweizer & Wyss, *Eur J Appl Physiol* 119:1525–1532
     (2019): Polar H10 RR-interval signal quality 99.6% vs. an ECG Holter's
     94.6%, r = 0.997 — the consumer strap outperformed the reference
     medical device. https://link.springer.com/article/10.1007/s00421-019-04142-5
   - Schaffarczyk et al., *Sensors* 22(17):6536 (2022): Polar H10 validity
     for HRV analysis at rest and during exercise.
     https://www.mdpi.com/1424-8220/22/17/6536
2. *"Regulatory clearance documentation"* — state plainly that none exists
   because the hardware is not a medical device in any jurisdiction; there
   is no clearance to obtain. (This is the truthful answer, not a dodge —
   and it's why bullet 3's "or" clause exists.)
3. *"Restrict storefronts OR include a jurisdiction statement in the
   description"* — taken literally: the description's IMPORTANT footer now
   carries the jurisdiction statement ("…not medical devices, and require no
   regulatory clearance for use in any region"). Description is at
   3,999/4,000 chars — any future edit must stay under.

**Round-2 reply (paste into the submission's Messages, attach both PDFs):**

> Thank you for the follow-up review — we're glad the subscription and
> metadata issues are resolved. On 1.4.1, we'd like to address each
> requirement directly:
>
> 1. Hardware classification: the app does not connect to medical hardware.
> The only external hardware it can pair with is a general-purpose consumer
> Bluetooth heart-rate monitor (chest straps such as Polar H10 or Garmin
> HRM) via the standard public Bluetooth SIG Heart Rate profile (GATT
> 0x180D) — the same category of fitness accessory used by running and
> cycling apps across the App Store, marketed and sold as sports equipment.
> These are not blood pressure monitors, glucose monitors, or comparable
> regulated devices, and no external hardware is required to use the app at
> all: heart data can also come from the iPhone camera or from Apple Watch
> via HealthKit.
>
> 2. Documentation that the hardware works as described: attached are two
> peer-reviewed studies validating consumer chest-strap RR-interval/HRV
> accuracy — Gilgen-Ammann et al., European Journal of Applied Physiology
> (2019), which found 99.6% RR signal quality versus an ECG Holter
> (r = 0.997), and Schaffarczyk et al., Sensors (2022), validating HRV
> analysis at rest and during exercise.
>
> 3. Regulatory clearance and jurisdiction: no regulatory clearance
> documentation exists for these products because they are not medical
> devices in any jurisdiction. Per the option in your message, the App
> Description now includes a jurisdiction statement: compatible chest straps
> are general-purpose consumer fitness accessories, not medical devices,
> and require no regulatory clearance for use in any region.
>
> The app itself provides no medical services — it is a personal wellness
> journal that logs and displays the user's own data, makes no diagnosis,
> and directs users to their doctor. Could you let us know which specific
> hardware the review identified as medical hardware? We have also requested
> an App Review appointment and would welcome the discussion.

## §4 — Guideline 3.1.2(c): Terms of Use link in the metadata

The in-app paywall was already compliant (title, length, price, functional
Terms + Privacy links — `src/features/Paywall.tsx`). What was missing is the
**metadata** side: a Terms of Use link in the App Description or a custom EULA
in ASC. Fixed by copy:

- The description now ends with functional links:
  `https://autonomic.care/terms-of-service/` and
  `https://autonomic.care/privacy-policy/`.
- The **Privacy Policy field** in ASC should already point at
  `https://autonomic.care/privacy-policy/` — verify it does.
- Since the terms are custom (not Apple's standard EULA), the description link
  satisfies the requirement; optionally also paste the terms into App
  Information → **License Agreement**, but the description link is sufficient.

Apple asked for **a screen recording** confirming the required info once
fixed. Record ~30 seconds on a device/simulator: open a locked surface →
paywall card appears → show plan names, "Billed yearly/monthly", prices →
scroll to the footer → tap **Terms** (opens the terms page) → back → tap
**Privacy**. Attach it to the Resolution Center reply.

Also add the standing note Apple requested to **App Review Information →
Notes** — the "App Review notes (resubmission…)" block in `store-listing.md`
includes it for this and future submissions.

## §5 — The Resolution Center reply (paste, attach recording, resubmit)

> Hello, and thank you for the detailed review. We've addressed all four
> items:
>
> **2.1(b) — In-App Purchases:** Both auto-renewable subscriptions
> (com.autonomic.journal.monthly, com.autonomic.journal.yearly) are now
> submitted for review with this version, each with an App Review screenshot
> of the paywall. A new binary is uploaded.
>
> **2.3.2 — Accurate Metadata:** The App Description now states up front that
> some features require the Autonomic Pro auto-renewing subscription, marks
> each paid feature with "(Pro)" inline, and lists exactly what is free
> forever versus Pro, with prices. Note the new binary also changes the model
> the reviewed version had: the app no longer requires a subscription — the
> core app is free, and the subscription is optional.
>
> **3.1.2(c) — Subscriptions:** The App Description now includes a functional
> link to our Terms of Use (https://autonomic.care/terms-of-service/)
> alongside the Privacy Policy. In the app, the paywall already displays the
> subscription title, length, and price, with functional Terms of Use and
> Privacy Policy links; the attached screen recording demonstrates this.
>
> **1.4.1 — Physical Harm:** Respectfully, the app does not connect to
> medical hardware and does not provide medical services. The only external
> hardware it can pair with is a general-purpose consumer Bluetooth
> heart-rate monitor (e.g. Polar, Garmin, or Wahoo chest straps) using the
> standard public Bluetooth SIG Heart Rate profile (GATT service 0x180D),
> the same fitness accessories used by running and cycling apps and sold as
> sports equipment — not medical devices requiring regulatory clearance. No
> external hardware is required at all: heart data can come from the iPhone
> camera or from Apple Watch via HealthKit. Autonomic is a personal wellness
> journal for self-tracking: it logs and displays the user's own data
> against published research ranges, makes no diagnosis and offers no
> treatment, and directs users to discuss results with their doctor
> (disclaimers appear in onboarding, in Settings → Legal, and on every
> stand-test result). The App Description now states this explicitly. This
> is the same model used by established HRV apps on the App Store. Happy to
> discuss on a call if helpful.

## §6 — Refresh the rest of the 1.7-era store data

Everything in the ASC record still reflects the subscription-required 1.7
app. Sweep all of it in the same pass — stale trial-era copy anywhere is
another 2.3.2 rejection waiting. Field by field (paste sources in
`store-listing.md`):

**App Information (rarely-touched fields):**

- **Name** — `Autonomic: HRV & POTS Tracker` stays.
- **Subtitle** — set to the freemium-era line: `Private HRV & recovery
  journal` (30/30). If the current subtitle mentions the trial or a
  subscription, this is mandatory, not optional.
- **Privacy Policy URL** — must be `https://autonomic.care/privacy-policy/`.
- **License Agreement (EULA)** — either leave Apple's standard agreement (the
  description now links our custom terms anyway) or paste the custom terms
  here. Don't leave a stale 1.7-era custom EULA in place.

**Version page:**

- **Description** — the new 3,965-char freemium description (§2).
- **Promotional text** — paste the freemium promo line. This field updates
  without review, so do it immediately, even before resubmitting.
- **Keywords** — paste the current 98-char set from `store-listing.md`.
- **What's New** — use the cumulative 1.7 → 1.13 block from
  `store-listing.md`; reviewers read this, and it must not promise
  trial-first behavior.
- **Screenshots** — audit every panel, iPhone and Apple Watch: any caption
  reading "7-day free trial", "subscription required", or showing pre-1.9 UI
  gets recaptured. The screenshot plan in `store-listing.md` has the shot
  list; consider one panel showing the Free vs Pro comparison grid.
- **App Review Information** — new notes block (§4), contact info current.

**Monetization → Subscriptions (the 1.7-era product copy):**

- **Display names / descriptions** — refresh both products per the
  subscription-metadata table in `store-listing.md` (`Autonomic Pro Yearly` /
  `Autonomic Pro Monthly`, description "Unlimited HRV, history, POTS & AI
  reports", 45-char limit). Any product copy implying the app requires the
  subscription must go.
- **Review screenshot + note** on each product (§1).
- **Introductory offers (7-day trials)** — leave them ACTIVE for this
  submission. The order in `STORE_SETUP.md` Part 3 still applies: end the
  offers only after the freemium build is *released*, or everyone still on
  1.7 hits a trial-less hard paywall. The paywall CTA adjusts itself via
  `hasTrial()` either way.
- **Prices** — unchanged ($7.99 / $49.99); confirm they match the
  description, which now states them.

**Unchanged (verify, don't edit):** privacy nutrition labels (still collects
nothing), age rating, category, pricing of the app itself (Free).

## Resubmission checklist

- [ ] Both subscriptions: display name + description refreshed (`Autonomic Pro Yearly` / `Monthly`, no "required" language), review screenshot + note attached
- [ ] Both subscriptions added to the version page (show "Waiting for Review" after submit)
- [ ] Intro trial offers still ACTIVE (end them only after the freemium build is released — `STORE_SETUP.md` Part 3)
- [ ] New build from current `main` uploaded and selected; `FORCE_TIER` null, `PREVIEW_PAYWALL` false
- [ ] New description pasted (from `store-listing.md`, 3,965/4,000 chars)
- [ ] Subtitle, promotional text, keywords, What's New all pasted from `store-listing.md` — no trial-era copy anywhere
- [ ] Screenshots audited: nothing shows "free trial" / "subscription required" / pre-1.9 UI
- [ ] Privacy Policy field in ASC = https://autonomic.care/privacy-policy/
- [ ] App Review notes block pasted into App Review Information → Notes
- [ ] Screen recording of the paywall (title/length/price/Terms/Privacy) attached to the reply
- [ ] §5 reply posted in the Resolution Center
- [ ] Verify https://autonomic.care/terms-of-service/ and /privacy-policy/ load (they must be live at review time)
