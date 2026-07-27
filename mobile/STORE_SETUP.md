# Store setup & freemium cutover runbook

Owner actions in App Store Connect and the Google Play Console. Nothing here is
code — the app already ships freemium (`src/lib/tier.ts`, `src/lib/gating.ts`,
`src/store/iap.ts`). Listing copy to paste lives in `store-listing.md`.

**Facts you'll need everywhere:**

| Thing | Value |
| --- | --- |
| Bundle ID / package | `com.autonomic.journal` |
| Yearly SKU | `com.autonomic.journal.yearly` — $49.99 |
| Monthly SKU | `com.autonomic.journal.monthly` — $7.99 |
| Subscription group (Apple) | one group, both plans |
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
7-day free trial is the on-ramp. If you kill the intro offers first, everyone on
the old build hits a paywall whose CTA now reads "Upgrade to Pro" with no trial,
and the app is unusable without paying — a conversion cliff and a plausible
1-star wave. Once the freemium build is live, the app is usable without any
purchase, so the store-side trial is redundant: the app grants its own local
7-day full-access window on first launch, no store call, no account.

The in-app copy needs no rebuild to follow along: `hasTrial()` reads the live
store product, so the paywall CTA flips from "Start 7-day free trial" to
"Upgrade to Pro" on its own the moment the offers end — on old and new builds
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
4. Scroll to **Introductory Offers** → find the active 7-day free trial row
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
and the app grants its own local 7-day window. Creating them just to deactivate
them is churn. (If you want a store-side trial on Android later: base plan → **Add
offer** → phase 1 = Free, 7 days. `offerHasTrial()` detects it by its zero price
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

## Part 6 — iOS submission credentials (`eas submit`)

If a submission dies with:

```
eas-cli failed to resolve submission config. Add EXPO_DEBUG: "1" to the job env
to see the error.
… /steps/prepare_asc_api_key/scripts/….sh exited with non-zero code: 1
```

that is **not** a problem with the build, the binary, or the listing.
`prepare_asc_api_key` is the step where the submission worker materialises the
**App Store Connect API key** (a `.p8` file plus its key ID and issuer ID) that
it authenticates to Apple with. `submit.production.ios` in `eas.json` names only
`ascAppId`, which is correct — the key is deliberately *not* in this repo, so
EAS looks it up from the project's credentials stored on Expo's servers. If no
key is stored there (or the stored one was revoked/expired in App Store
Connect), there is nothing to prepare, and a cloud job cannot stop and prompt
for one. It fails at that step, and the underlying Apple error is swallowed
unless `EXPO_DEBUG` is set.

Work it in this order:

1. **Get the real error.** Re-run the submission from your machine, where
   eas-cli can both print the cause and prompt to fix it:

   ```bash
   cd mobile
   EXPO_DEBUG=1 eas submit --platform ios --profile production --latest
   ```

   (`--latest` submits the most recent finished iOS build, so you don't have to
   rebuild.) If it's an EAS Workflow job instead, add `EXPO_DEBUG: "1"` to that
   job's `env:` block and re-run it.

2. **Check what's actually stored:** `eas credentials --platform ios` →
   `production` → **App Store Connect API Key**. An empty list here is the
   whole bug.

3. **Register a key** if it's missing — either let Expo create one through your
   Apple login, or create it yourself at App Store Connect → **Users and
   Access** → **Integrations** → **App Store Connect API** → **Team Keys**, and
   upload it. The key needs the **App Manager** role; *Developer* cannot upload
   builds and produces a 403 at the Apple call rather than a clean error. Apple
   lets you download the `.p8` exactly once — if it's lost, revoke it and make a
   new one.

4. **Verify `ascAppId`.** `6789786971` must be the Apple ID of this app (App
   Store Connect → app → **General** → **App Information** → *Apple ID*) under
   the same team the API key belongs to. A key from a different team resolves,
   then fails against that app ID.

Once a key is registered on the project, cloud submissions and
`eas build --auto-submit` both stop failing — the credential is per-project, not
per-run.

**Fully headless alternative.** To keep the key in the repo checkout instead of
on Expo's servers, drop the `.p8` beside `eas.json` and add to
`submit.production.ios`:

```jsonc
"ascApiKeyPath": "./AuthKey_XXXXXXXXXX.p8",
"ascApiKeyId": "XXXXXXXXXX",
"ascApiKeyIssuerId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

`.p8`, `.p12`, `.mobileprovision` and `credentials.json` are gitignored — **never
commit the key**; it is a full-privilege App Store Connect credential. For CI,
prefer an EAS secret over a checked-in file.

---

## Verification checklist

Before you call it done:

- [ ] Store build (not TestFlight/sideload), never-subscribed account, iOS: paywall CTA reads "Upgrade to Pro"
- [ ] Same on Android, installed via the Play opt-in link
- [ ] Paywall shows **real** localized prices, not $49.99/$7.99 fallbacks — fallbacks mean `getSubscriptions` returned nothing, i.e. a product ID typo or an inactive base plan
- [ ] Both plans purchasable; purchase flips the app to Pro
- [ ] "Restore purchase" works on a second device
- [ ] `FORCE_TIER` is `null` and `PREVIEW_PAYWALL` is `false` in the shipped commit
- [ ] Fresh install → 7 days full access with no store call and no account
