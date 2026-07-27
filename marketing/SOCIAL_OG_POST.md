# Social launch post — OG image + tracked store links

**Asset:** `landing/static/og.png` (upload the image directly — don't rely on a link preview).
**Channels:** Facebook · LinkedIn · X
**Campaign:** `social-og` (July 2026)

Copy follows the message discipline in `MARKETING_PLAN.md` §2: first-person founder
testimony, no recovery/cure promises, no second-person diagnosis ("Do you have POTS?"),
data over lifestyle.

---

## 1. Post copy

### Facebook

> I spent a long stretch of my recovery unable to answer one question: what is actually
> helping? Good days and bad days looked random. I was guessing.
>
> So I built the tool I needed.
>
> **Autonomic** measures real physiology — HRV from a chest strap or your phone camera,
> blood pressure, orthostatic (lying-to-standing) tests, sleep and its stages — and scores
> every reading against published medical thresholds. Not a wellness vibe. A number with
> the trend behind it, and a report you can hand your cardiologist.
>
> And none of it leaves your phone. No account, no cloud, no sign-up. I don't have your
> health data, because I never collect it — that's the architecture, not a privacy policy.
>
> Built by one person, for POTS, dysautonomia, long COVID and post-viral recovery. The
> journal is free; every install opens with 7 days of full Pro, no card required.
>
> iPhone → {IOS_FACEBOOK}
> Android → {ANDROID_FACEBOOK}

### LinkedIn

> For people recovering from POTS, dysautonomia or long COVID, the hardest part isn't the
> symptoms — it's that you cannot tell which of the fifty things you changed this week did
> anything. The signal is buried in noise, and most apps answer with a mood ring.
>
> So I built **Autonomic**.
>
> It captures chest-strap RR intervals (or camera PPG), corrects artifacts, and runs real
> time- and frequency-domain HRV — the same math as lab software — then scores HRV, blood
> pressure, orthostatic response and sleep against published clinical thresholds. Every
> score is transparent about why it's that score. It generates a report built for the
> 15 minutes you get with a cardiologist.
>
> The part I'm most proud of is what it doesn't do: there is no backend. No account, no
> cloud, no telemetry on your health data. Everything is on-device, and the export is a
> plain JSON file you own. For an audience carrying real disability-insurance and
> employment anxiety, "we can't lose or sell your data because we never have it" should be
> table stakes. It isn't.
>
> iOS and Android, out now. The journal is free; every install starts with 7 days of full
> Pro, no card.
>
> iOS → {IOS_LINKEDIN}
> Android → {ANDROID_LINKEDIN}

*LinkedIn note: outbound links suppress reach. Consider posting the image + copy with the
links moved to your own first comment (same tracked URLs — attribution is unaffected).*

### X

> I couldn't tell what was helping my recovery. So I built the tool.
>
> Autonomic scores your HRV, BP, orthostatic tests and sleep against medical thresholds —
> and none of it ever leaves your phone. No account, no cloud.
>
> iOS {IOS_X}
> Android {ANDROID_X}

*277/280 characters (X counts every URL as 23 regardless of length). If you add anything,
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
