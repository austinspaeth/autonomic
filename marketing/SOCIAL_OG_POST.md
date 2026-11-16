# Social launch post — OG image + tracked store links

**Asset:** `landing/static/og.png` (upload the image directly — don't rely on a link preview).
**Channels:** Facebook · LinkedIn · X
**Campaign:** `social-og` (July 2026)

Product-led copy — the founder story is held back for the Reddit/press launch, where it
earns more. Every version opens by saying what the app *is*. Message discipline from
`MARKETING_PLAN.md` §2 still holds: no recovery/cure promises, no second-person diagnosis
("Do you have POTS?"), data over lifestyle.

**The hook, reused across all three:** you can feel the bad days — you can't feel what
caused them.

This is the correction that matters. Nobody in this audience needs an app to tell them
today was bad; they felt it at 6am. The unmet need is *attribution* (what drove it) and
*trajectory* (is any of this working), and those are the two things a body cannot self-report.
The copy is built on features that already ship:

- **Attribution** — `scoring/downturn.ts` flags a sustained slide and names the cause from
  the journal: triggers logged, heavy exertion, short sleep, a slipped protocol. When the
  logs are clean it says so rather than inventing a reason.
- **Ahead of symptoms** — the same module fires the crash warning, on the premise that the
  autonomic system shifts before symptoms do. Phrase this as "often," never as a guarantee.
- **Trajectory** — milestones, Analysis buckets and the AI reports cover recovery
  trajectory, trigger/setback patterns, sleep→next-day impact, and "best days and what made
  them work."

---

## 1. Post copy

### Facebook

> You can feel the bad days. What you can't feel is what caused them — the trigger three
> days ago, the short night, the workout that took more than it gave.
>
> **Autonomic** tracks what goes in (food, triggers, meds, activity, sleep) against what
> your body actually does: HRV, blood pressure and orthostatic response, each scored
> against published medical thresholds. When your numbers start sliding, it names what in
> your journal is driving it — often before the symptoms arrive.
>
> Then it shows you the part that's hardest to see from the inside: whether you're
> genuinely improving, week over week and month over month.
>
> Built for POTS, dysautonomia and long COVID recovery. Measure HRV with a chest strap or
> just your phone camera. Nothing ever leaves your phone — no account, no cloud. The
> journal is free, and every install opens with 7 days of full Pro, no card.
>
> iPhone → {IOS_FACEBOOK}
> Android → {ANDROID_FACEBOOK}

### LinkedIn

> Nobody recovering from POTS, dysautonomia or long COVID needs an app to tell them it was
> a bad day. They felt it at 6am. What they can't feel is *why* — or whether any of it is
> trending the right way.
>
> **Autonomic** is built for those two questions. Chest-strap RR intervals (or camera PPG),
> artifact-corrected, run through real time- and frequency-domain HRV — the same math as
> lab software. Blood pressure, orthostatic response and sleep, each scored against
> published clinical thresholds. When the trend turns, it reads back the journal and names
> the likely driver — triggers, exertion, short sleep, a slipped protocol — and when the
> logs are clean, it says that instead of inventing a reason.
>
> And there is no backend. No account, no cloud, no telemetry — everything on-device, and
> your export is a JSON file you own outright.
>
> iOS and Android, out now.
>
> iOS → {IOS_LINKEDIN}
> Android → {ANDROID_LINKEDIN}

*LinkedIn note: outbound links suppress reach. Consider posting the image + copy with the
links moved to your own first comment (same tracked URLs — attribution is unaffected).*

### X

> You can feel the bad days. You can't feel what caused them.
>
> Autonomic tracks what you log against what your body does — HRV, BP, orthostatic
> response, sleep — and names what's driving a slide before symptoms show.
>
> iOS {IOS_X}
> Android {ANDROID_X}

*275/280 characters (X counts every URL as 23 regardless of length). The privacy line had
to go to fit — the OG image says PRIVATE · OFFLINE across the top, so the post still
carries it visually. Put "No account, no cloud. Everything stays on your phone." in a reply
if you want it in text.*

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
