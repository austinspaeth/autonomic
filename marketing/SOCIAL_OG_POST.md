# Social launch post — OG image + tracked store links

**Asset:** `landing/static/og.png` (upload the image directly — don't rely on a link preview).
**Channels:** Facebook · LinkedIn · X
**Campaign:** `social-og` (July 2026)

Product-led copy — the founder story is held back for the Reddit/press launch, where it
earns more. Every version opens by saying what the app *is*. Message discipline from
`MARKETING_PLAN.md` §2 still holds: no recovery/cure promises, no second-person diagnosis
("Do you have POTS?"), data over lifestyle.

**The hook, reused across all three:** most health apps give you a wellness score;
Autonomic gives you a number a cardiologist will read.

---

## 1. Post copy

### Facebook

> Most health apps give you a wellness score. **Autonomic** gives you a number a
> cardiologist will read.
>
> Measure your HRV with a chest strap or just your phone camera. Log blood pressure,
> orthostatic (lying-to-standing) tests, sleep. Every reading is scored against published
> medical thresholds — so you can finally see which days are helping and which ones cost
> you.
>
> Built for POTS, dysautonomia and long COVID recovery. Nothing ever leaves your phone —
> no account, no cloud.
>
> Free journal. Every install opens with 7 days of full Pro, no card.
>
> iPhone → {IOS_FACEBOOK}
> Android → {ANDROID_FACEBOOK}

### LinkedIn

> Most health apps give you a wellness score. **Autonomic** gives you a number a
> cardiologist will read.
>
> Chest-strap RR intervals (or camera PPG), artifact-corrected, run through real time- and
> frequency-domain HRV — the same math as lab software. Blood pressure, orthostatic
> response and sleep, each scored against published clinical thresholds, each transparent
> about *why* it scored that way. Then a report built for the 15 minutes you get with a
> specialist.
>
> And there is no backend. No account, no cloud, no telemetry — everything on-device, and
> your export is a JSON file you own outright.
>
> Built for POTS, dysautonomia and long COVID recovery. iOS and Android, out now.
>
> iOS → {IOS_LINKEDIN}
> Android → {ANDROID_LINKEDIN}

*LinkedIn note: outbound links suppress reach. Consider posting the image + copy with the
links moved to your own first comment (same tracked URLs — attribution is unaffected).*

### X

> Most health apps give you a wellness score.
>
> Autonomic gives you a number your cardiologist will read — HRV, BP, orthostatic tests and
> sleep, scored against medical thresholds.
>
> Nothing ever leaves your phone.
>
> iOS {IOS_X}
> Android {ANDROID_X}

*270/280 characters (X counts every URL as 23 regardless of length). If you add anything,
move the Android link to a reply.*

---

## 2. The tracked links

### iOS — App Store campaign tokens

Apple tracks the `ct` (campaign token) parameter appended to any App Store URL. Max 40
characters, lowercase, no spaces.

| Channel | URL |
| --- | --- |
| Facebook | `https://apps.apple.com/app/id6789786971?ct=social-og-facebook` |
| LinkedIn | `https://apps.apple.com/app/id6789786971?ct=social-og-linkedin` |
| X | `https://apps.apple.com/app/id6789786971?ct=social-og-x` |

Optional: append `&pt=<provider-token>` if you want the clicks bucketed under your provider
in App Analytics. The provider token is the numeric ID in App Store Connect → your app →
App Analytics → Acquisition → Campaigns (the built-in link generator shows it). `ct` alone
is enough for the report.

### Android — Play Store install referrer

Play reads UTMs from a single `referrer` parameter whose value must be **URL-encoded**
(`=` → `%3D`, `&` → `%26`). `utm_source` and `utm_medium` are required; `utm_campaign` is
what you'll filter on.

| Channel | URL |
| --- | --- |
| Facebook | `https://play.google.com/store/apps/details?id=com.autonomic.journal&referrer=utm_source%3Dfacebook%26utm_medium%3Dsocial%26utm_campaign%3Dsocial-og` |
| LinkedIn | `https://play.google.com/store/apps/details?id=com.autonomic.journal&referrer=utm_source%3Dlinkedin%26utm_medium%3Dsocial%26utm_campaign%3Dsocial-og` |
| X | `https://play.google.com/store/apps/details?id=com.autonomic.journal&referrer=utm_source%3Dx%26utm_medium%3Dsocial%26utm_campaign%3Dsocial-og` |

Decoded, each referrer is `utm_source=<channel>&utm_medium=social&utm_campaign=social-og`.

`&hl=en` is deliberately dropped from the canonical URL in `landing/src/lib/site.ts` — it
forces English on non-US visitors and adds nothing to attribution.

### Optional: one smart link instead of two

`https://autonomic.care/?utm_source=linkedin&utm_medium=social&utm_campaign=social-og`

The site sniffs the platform and either deep-links a phone to its store or opens the
dual-download modal on desktop. Useful on X where characters are tight, and on LinkedIn
where the audience is desktop-heavy.

**Caveat:** the redirect in `landing/src/app.html` uses fixed store URLs and does **not**
currently forward campaign params, so a click through the site lands in the store
untracked. You still get the `app_store_click` / `play_store_click` events on the site
itself. Forwarding `ct` / `referrer` through the router is a small change if you want the
smart link to carry full attribution.

---

## 3. Where the numbers show up

**iOS** — App Store Connect → your app → App Analytics → Acquisition → **Campaigns**, filter
by campaign token. Two things to expect: attribution is aggregate-only (no device-level
data, by design), and Apple **suppresses metrics below a privacy threshold**, so a
low-volume campaign can legitimately report nothing at all. Don't read an empty row as a
broken link.

**Android** — Play Console → **Grow → Acquisition reports → Retained installers**, break
down by UTM source/campaign. The referrer also reaches the app itself via the Play Install
Referrer API if you ever want in-app attribution.

**Both** — data lags. Give it 48–72 hours before drawing conclusions.

### Sanity check before you post

Paste each URL into a phone browser and confirm it opens the right store listing. A typo in
the encoded `referrer` value degrades silently: Play still installs the app, it just files
the install as organic.
