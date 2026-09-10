# Store setup & freemium cutover runbook

Owner actions in App Store Connect and the Google Play Console. Nothing here is
code — the app already ships freemium (`src/lib/tier.ts`, `src/store/tier.ts`,
`src/store/iap.ts`). Listing copy to paste lives in `store-listing.md`.

The free/Pro boundary itself is stated in `CLAUDE.md` ("Capture is never
metered"): capture of every kind except POTS is free and unlimited, and Pro is
the full progress history, Insights, POTS testing and the AI reports. Five
places repeat that boundary (paywall, Settings, Free-vs-Pro sheet,
`store-listing.md`, the landing page's pricing table) and must move together.

**Facts you'll need everywhere:**

| Thing | Value |
| --- | --- |
| Bundle ID / package | `com.autonomic.journal` |
| Yearly SKU | `com.autonomic.journal.yearly` — $49.99 |
| Monthly SKU | `com.autonomic.journal.monthly` — $7.99 |
| Promo yearly SKU | `com.autonomic.journal.yearly.promo` — $24.99 (see Part 6) |
| Subscription group (Apple) | one group, all three plans |
| App version | 1.9.0 (freemium) |
| Terms | https://autonomic.care/terms-of-service/ |
| Privacy | https://autonomic.care/privacy-policy/ |

> The product IDs must match **exactly** on both stores — `PRO_SKUS` in
> `src/store/iap.ts` is a single hard-coded list used for iOS and Android. A
> typo in either console means `getSubscriptions` returns nothing and the
> paywall shows fallback prices with a dead buy button.

---

## Part 1 — Order of operations (read first)

The sequence matters. Do not end the intro offers before the freemium build is
live.

1. **Ship the freemium build to both stores** and wait until it's actually
   released (not just approved).
2. **Then** end the introductory free-trial offers (Part 3).
3. **Then** update the listing copy (Part 4).

**Why this order.** Today the only way to use the app is to subscribe, and the
store-side free trial is the on-ramp. If you kill the intro offers first, everyone on
the old build hits a paywall whose CTA now reads "Upgrade to Pro" with no trial,
and the app is unusable without paying — a conversion cliff and a plausible
1-star wave. Once the freemium build is live, the app is usable without any
purchase, so the store-side trial is redundant: the app grants its own local
14-day full-access window on first launch, no store call, no account.

The in-app copy needs no rebuild to follow along: `hasTrial()` reads the live
store product, so the paywall CTA flips from "Start N-day free trial" (N is derived from the
store product itself — see `trialDaysOf` in `src/store/iap.ts`) to "Upgrade to Pro" on its own the moment the offers end — on old and new builds
alike.

**Existing subscribers are unaffected** at every step. Ending an introductory
offer only changes eligibility for *new* subscribers; it never touches an active
subscription. Anyone mid-trial keeps their trial to its natural end.

---

## Part 2 — Ship the freemium build

```bash
cd mobile
# bump "version" in app.json to 1.9.0 first (the marketing version; the
# build number / versionCode auto-increments remotely per eas.json)
eas build --platform ios --profile production
eas build --platform android --profile production
```

The `production` profile has no `android.buildType`, so it produces an **`.aab`**
— which is what Play wants. (`preview` and `development` produce `.apk`; the
`autonomic-preview.apk` in the repo is one of those and is **not** uploadable to
Play.)

`react-native-iap` is a native module, so **this cannot be an OTA update** — the
runtime fingerprint changes. See `EAS_UPDATE.md`.

Build on EAS cloud, not locally: local builds off a macOS beta get rejected with
ITMS-90111 (see the `mobile-itms-90111-macos-beta` note).

**Before submitting, verify the free tier actually looks right.** Dev, TestFlight
and sideloaded builds all bypass to `isPro: true`, so locked states are invisible
by default. To preview, set **both**:

- `FORCE_TIER: 'free'` in `src/store/tier.ts` — shows the locks and upsell widget
- `PREVIEW_PAYWALL = true` in `src/store/iap.ts` — keeps the paywall sheet open

Setting only the first one shows the locks but the paywall dismisses itself
instantly (`PaywallCard` auto-closes when `isPro`). **Revert both before
committing** — shipping `FORCE_TIER: 'free'` would lock out paying customers.

---

## Part 3 — End the introductory offers

Do this **after** the freemium build is live on both stores.

### App Store Connect

1. https://appstoreconnect.apple.com → **My Apps** → Autonomic
2. Sidebar → **Monetization** → **Subscriptions**
3. Click the subscription group → click `com.autonomic.journal.yearly`
4. Scroll to **Introductory Offers** → find the active free-trial row
5. Click **Edit** → set an **End Date** (today, or a few days out to be kind to
   anyone mid-funnel) → **Save**
6. Repeat for `com.autonomic.journal.monthly`

Notes:
- You **cannot delete** an intro offer that has started; setting an end date is
  the supported path. It stops new users becoming eligible after that date.
- No app review is triggered. No new binary.
- Existing trials run to completion and convert normally.

### Google Play Console

1. https://play.google.com/console → Autonomic Journal
2. **Monetize** → **Products** → **Subscriptions**
3. Click `com.autonomic.journal.yearly` → find its **base plan**
4. Under the base plan, find the **free trial offer** → **⋮** → **Deactivate**
5. Repeat for `com.autonomic.journal.monthly`

Notes:
- Deactivating an offer stops new users from claiming it. Users already in the
  trial keep it.
- Deactivate the **offer**, not the **base plan** — deactivating the base plan
  makes the product unpurchasable entirely and breaks the paywall.

### Verify

Install the **store** build (not TestFlight, not sideloaded — both bypass the
paywall) on a device with an account that has never subscribed. Open a locked
surface (Insights → any AI report card). The CTA should read **"Upgrade to Pro"**
with no trial mention. Store product changes can take a few hours to propagate.

---

## Part 4 — Update the listing copy

Paste from `store-listing.md`.

### App Store Connect

- **Promotional text** — editable anytime, no review. Do this first, it's live in
  minutes.
- **Description** — requires a version submission. Bundle it with the 1.9.0
  freemium build rather than submitting separately.
- **What's New** — ships with 1.9.0.
- **Screenshots** — only if any show trial or "subscription required" copy. Audit
  them; see the screenshot plan in `store-listing.md`.
- **App Review notes** — paste the block from `store-listing.md`. Reviewers who
  can't find the paywall sometimes reject for "no way to purchase"; the note
  gives them the tap path.

**No changes needed** to: pricing, in-app purchase products (beyond Part 3),
privacy labels (still collects nothing), age rating, or category.

### Google Play Console

- **Grow** → **Store presence** → **Main store listing**
- Paste short description + full description → **Save** → **Send for review**
- Listing review is usually hours, and needs no new binary.

---

## Part 5 — Google Play from scratch

Your account is verified but nothing else is set up. Do these in order — the
subscriptions cannot be created until an app exists, and cannot be *tested* until
a build is on a track.

### 5.1 Create the app

1. https://play.google.com/console → **All apps** → **Create app**
2. Fill in:
   - **App name**: `Autonomic Journal: HRV & POTS` (29/30 chars)
   - **Default language**: English (United States)
   - **App or game**: App
   - **Free or paid**: **Free** ← this is the app *download* price. It stays Free
     even though it has subscriptions. **This is irreversible** — you can never
     switch a Free app to Paid. Free + IAP is correct for freemium.
3. Accept the declarations → **Create app**

### 5.2 Work the "Set up your app" checklist

Play won't let you release until every item is green. Dashboard → **Set up your
app**:

- **App access** — "All functionality is available without special access". True:
  no login, no account.
- **Ads** — **No, my app does not contain ads**.
- **Content ratings** — fill the questionnaire. Category: **Reference, News, or
  Educational** (not Medical — Play's "Medical" category invites extra scrutiny
  and this is a journal, not a diagnostic). Answer No to everything: no violence,
  no sex, no drugs (logging your own meds is not drug reference), no gambling.
  Expect **Everyone**.
- **Target audience** — target age **18+**. Do **not** target under-13; it drags
  in Families Policy and a second review.
- **News app** — No.
- **COVID-19 contact tracing** — No. (The app mentions long covid but does no
  tracing or status reporting.)
- **Data safety** — see 5.3 below. This one matters most.
- **Government apps** — No.
- **Financial features** — No.
- **Health apps** — declare **Health Connect** usage here. Justification: HRV,
  resting HR, sleep and blood pressure are **read** to display and grade in the
  user's own on-device journal. HRV, heart rate, resting HR and blood pressure
  are **written back** only when the user explicitly saves a reading; **sleep is
  read-only**. No transmission, no ads, no analytics, no sharing. (Source of
  truth: `READ_TYPES` / `WRITE_TYPES` in `src/lib/health/healthConnect.ts`.)
- **Privacy policy** — https://autonomic.care/privacy-policy/

### 5.3 Data safety

**Grow** → **Store presence** → **Data safety**. The honest answer for this app:

- **Does your app collect or share any required user data?** → **No**
- That collapses the whole form. No encryption question, no deletion question.

Do not overclaim here. Play cross-checks the declaration against observed
network traffic; declaring "collects health data" when the app has no backend
creates a discrepancy you'd then have to explain.

> If you ever add crash reporting, analytics, or a cloud sync, this answer must
> change **before** that build ships.

### 5.4 Main store listing

**Grow** → **Store presence** → **Main store listing**. Paste from
`store-listing.md` (Google Play section) — short description, full description.

Then the graphics. The **feature graphic is mandatory on Play and has no iOS
equivalent** — it must be made fresh:

| Asset | Spec |
| --- | --- |
| App icon | 512×512 PNG, 32-bit, **no alpha** |
| Feature graphic | 1024×500 PNG/JPG, **no alpha** |
| Phone screenshots | 2–8, min 320px, max 3840px |

Reuse the brand background + wordmark for the feature graphic. Don't put
screenshot content in it — Play crops it hard across surfaces.

Screenshots: reuse the Android captures. **Cut every Apple Watch panel** — there
is no watch app on Android and Play rejects listings showing features the app
doesn't have on the platform.

### 5.5 Create the subscriptions

**Monetize** → **Products** → **Subscriptions** → **Create subscription**.

Play's model is three-tiered and unlike Apple's: **Product** → **Base plan** →
**Offer**. The code buys a base plan's offer token (`bestAndroidOffer` in
`src/store/iap.ts`), so the base plan is not optional.

**Yearly:**
1. **Product ID**: `com.autonomic.journal.yearly` — **permanent, cannot be
   changed or reused after creation.** Type it carefully.
2. **Name**: `Autonomic Pro (Yearly)`
3. Create → then **Add base plan**:
   - **Base plan ID**: `yearly` (also permanent)
   - **Type**: Auto-renewing
   - **Billing period**: 1 year
   - **Price**: $49.99 USD → **Set prices** for other countries (let Play
     auto-convert)
4. **Activate** the base plan. An inactive base plan is invisible to
   `getSubscriptions` and the paywall will show fallback prices with a dead
   button.

**Monthly:** same, with product ID `com.autonomic.journal.monthly`, base plan ID
`monthly`, billing period 1 month, price $7.99.

**Free trial offers:** skip them. You're about to end the trials anyway (Part 3),
and the app grants its own local 14-day window. Creating them just to deactivate
them is churn. (If you want a store-side trial on Android later: base plan → **Add
offer** → phase 1 = Free, 14 days. `offerHasTrial()` detects it by its zero price
and the CTA flips automatically.)

> **Sanity check:** two products, each with exactly one **active** base plan,
> IDs matching `PRO_SKUS` character for character.

### 5.6 Upload a build and get it tested

Play requires a build on a track before subscriptions can be purchased at all —
even in a test.

1. **Testing** → **Internal testing** → **Create new release**
2. Upload the `.aab` from `eas build --platform android --profile production`.
   `eas.json` already points `submit.production.android` at the **internal**
   track, so once Play API credentials are linked you can use
   `eas submit --platform android --profile production` instead of uploading by
   hand. The very first upload must be manual — Play requires the app to exist
   with a release before it will accept API submissions.
3. Add yourself as a tester (**Testers** tab → create an email list)
4. **Also** add yourself under **Monetize** → **License testing** → this makes
   your purchases free and lets renewals run fast so you can test the buy flow
   without spending money
5. Roll out to internal testing → install **via the Play opt-in link**

**Critical:** install through the Play link, not adb. `isSideloadedAndroidBuild()`
bypasses the paywall for any install whose installer isn't
`com.android.vending` — sideload it and you'll see Pro everywhere and conclude
the paywall works when you never actually tested it.

### 5.7 First production release

1. **Production** → **Create new release** → promote the internal build
2. Release notes → **Save** → **Review release** → **Start rollout**
3. First review takes days, not hours — Google reviews new developer accounts
   much harder than established ones. Budget a week and expect at least one
   round of questions about the Health Connect permissions.

---

## Part 6 — The half-off annual offer (`com.autonomic.journal.yearly.promo`)

The annual offer card (`src/features/AnnualOffer.tsx`) surfaces a year of Pro at
half price to free users at 30 / 90 / 180 / 365 days since install, and unlocks
Pro for 24 hours alongside it. The unlock is entirely app-side
(`src/lib/upsell/annual.ts` + `src/store/tier.ts`) and needs **no** store
configuration. The discounted plan does.

**Create the product in both consoles BEFORE the build that references it
ships.** A missing product means `fetchProducts` returns nothing for it, the
card renders the `$24.99` fallback string, and the purchase fails outright.

### Why a separate SKU and not a discount

Apple can only target a price cut on an existing product through **promotional
offers**, which require every purchase to carry a payload signed with a
subscription key — i.e. a signing endpoint the app does not have. A separate
product needs no server and behaves identically on both stores.

The cost of that choice: this plan **renews at $24.99 forever**. It is "half
off, locked in", not "half off the first year". Moving those subscribers to
$49.99 later is a price increase, which on iOS needs per-subscriber consent and
on Play a notification period. If first-year-only pricing ever matters more,
that is the promotional-offer project, and it starts with a `sls/` endpoint.

### App Store Connect

1. **Monetization → Subscriptions** → open the **existing subscription group**
   (the one holding yearly + monthly). Same group is required: it is what makes
   the plans mutually exclusive instead of letting someone hold two.
2. **Create** → Product ID `com.autonomic.journal.yearly.promo`
   (**permanent, cannot be changed**) → Reference Name "Pro Yearly (Half Off)".
3. Duration **1 Year**, price **$24.99** USD. Review the auto-generated
   territory matrix before saving.
4. **Subscription level**: same level as `...yearly`. Nobody is ever offered
   both, so a crossgrade is the correct and simplest relationship.
5. Add a **localization** (display name + description) — required for review.
6. **Review information**: attach a screenshot of the offer card and note
   "targeted 50%-off annual plan surfaced in-app after 30 days of use".
   Reviewers reject subscriptions they cannot find in the UI, and this one is
   invisible until day 30, so the note is load-bearing.
7. **Do NOT add an introductory offer.** A free trial on the promo plan would
   stack with the app's own 24-hour unlock and make the pricing incoherent.
8. A new subscription product is **reviewed with the next binary**, so it ships
   alongside the build rather than ahead of it.

### Google Play Console

1. **Monetize → Products → Subscriptions → Create subscription**.
2. Product ID `com.autonomic.journal.yearly.promo` (**permanent**), name
   "Pro Yearly (Half Off)".
3. **Add base plan** → ID `yearly-promo` (**permanent**), **Auto-renewing**,
   billing period **1 year**, price **$24.99** + the regional matrix.
4. **No free-trial offer** on this base plan.
5. **Activate the base plan.** An inactive base plan makes the whole product
   return nothing — the usual cause of the fallback-price symptom.
6. Confirm availability in the same countries as the other two products.

---

## Part 7 — The founding-member offer

The card in `src/features/FounderOffer.tsx`, raised in the Journal on the ONE
day after a user has logged five days of their own content (`FOUNDER_MIN_DAYS`),
while the local 14-day trial is still running. It never returns and the ✕
retires it permanently — see `src/lib/upsell/founder.ts` for the rules.

**It sells `com.autonomic.journal.yearly.promo`** — the same discounted year the
annual offer card sells (Part 6), on both stores. `FOUNDER_SKU` is that SKU with
no platform branch, so there is nothing extra to create in either console.

### Why not an introductory offer on the yearly plan (the previous design)

An introductory offer belongs to the PRODUCT, not to the card. Apple applies it
automatically to every eligible subscriber, so anyone who reached the ordinary
paywall got the identical discounted first year, and the card could prompt but
never hold anything back.

There is no Apple mechanism that targets a discount at a user who has never
subscribed:

- **Promotional offers** are for CURRENT or LAPSED subscribers, and every
  redemption must be signed by your server with a **subscription key** — the
  thing App Store Connect asks you to create when you make one. This app signs
  nothing, so a promotional offer here would never be redeemable.
- **Win-back offers** are also aimed at lapsed subscribers.
- A **separate SKU** is the only exclusive discount available, which is what
  this now is.

The trade: a separate SKU **renews at its own price**. This is a permanently
discounted year, not a discounted first one, which is why the card reads
"you keep 50% off for as long as you stay" over "$24.99/yr, cancel anytime"
rather than "first year, then $49.99/yr". Every number is derived from the two
prices the store returned, in whatever currency it returned them.

### If `annual_founder_first_year` was already created in App Store Connect

Delete it, or leave it inactive. While it exists as an **introductory offer** on
`com.autonomic.journal.yearly`, every new yearly subscriber gets the discounted
first year whether or not they ever saw the founding-member card, and it
occupies the one introductory-offer slot on that SKU. Nothing in the app reads
it any more.

### Both stores

Nothing to set up beyond Part 6's `com.autonomic.journal.yearly.promo` existing
and being active in each console. Because the founder card and the annual offer
card now sell the same product, the two can never be due on the same day by
design (`src/lib/upsell/founder.ts` fires during the install trial; the annual
window opens at 30/90/180/365 days for a free user), but a user who declines the
founding card CAN meet the same price again later at an annual milestone. If
that matters, the founding card needs its own SKU at its own price.

---

## Verification checklist

Before you call it done:

- [ ] Store build (not TestFlight/sideload), never-subscribed account, iOS: paywall CTA reads "Upgrade to Pro"
- [ ] Same on Android, installed via the Play opt-in link
- [ ] Paywall shows **real** localized prices, not $49.99/$7.99 fallbacks — fallbacks mean `getSubscriptions` returned nothing, i.e. a product ID typo or an inactive base plan
- [ ] Both plans purchasable; purchase flips the app to Pro
- [ ] "Restore purchase" works on a second device
- [ ] Annual offer card shows a **real localized $24.99**, not the fallback, and "Claim half off" completes a purchase on both stores
- [ ] `FORCE_TIER` is `null`, `FORCE_ANNUAL_OFFER` is `null`, `FORCE_FOUNDER_OFFER` is `false` and `PREVIEW_PAYWALL` is `false` in the shipped commit
- [ ] Founding-member card: five logged days, then the next day's launch shows it once, the price line reads a **real** localized introductory price, and "No thanks" retires it permanently
- [ ] Fresh install → 14 days full access with no store call and no account
