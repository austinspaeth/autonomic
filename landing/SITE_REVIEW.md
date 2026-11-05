# Landing site pre-launch review — 2026-11-04

Scope: the full redesigned site in `landing/` (home, pricing, download, story, press,
features/\*, conditions/\*, compare/\*, the /insights article system with the new
question + app-tie-in frontmatter, and the SEO plumbing: sitemap, llms.txt, RSS,
redirects, JSON-LD, OG cards, analytics). Build and all tests pass (164 articles
validate; og/download/master suites green).

## Verdict: **GO, after the Must-fix list below.**

The redesign is structurally sound — this is a real website now, and the hard
SEO plumbing is in better shape than most production sites. Nothing here needs a
rethink. What stands between you and launch is a short list of **copy and claims
fixes** (about a day of work), most of them places where the site promises
something the app doesn't do, says something false about a competitor, or breaks
one of your own stated rules. None require new pages or design changes.

---

## What's good

- **The foundation is genuinely strong.** Sitemap covers all 203 URLs, every one
  exists, is self-canonical, and none is a redirect stub. Trailing slashes are
  consistent everywhere (config, sitemap, canonicals, internal links). Every
  internal href in the build resolves. No TODO/placeholder/lorem anywhere.
- **No broken migration.** Old `/blog/<slug>/` URLs all get prerendered redirect
  stubs to the new `/insights/<topic>/<slug>/` form; article URLs themselves
  didn't change, so existing organic traffic survives the redesign.
- **llms.txt is excellent** — built from the same registries as the pages (~72 KB:
  facts, pricing, features, conditions, compare rows, every article). robots.txt
  names the AI crawlers. This is ahead of the curve for LLM discovery.
- **Conversion structure is right.** Clear primary CTA on every page (hero badges
  + QR, match-panel, mid-page, plans, closing). GA4 is wired with real conversion
  events (`download_click` with placement/plan/feature), and store URLs carry
  Apple `ct` / Play `referrer` campaign tags.
- **Pricing is consistent and derived**, never typed twice: $7.99 / $49.99 /
  14 days / save 48% all flow from `site.ts`. The three product rules all pass:
  capture is never sold as a Pro benefit, no "free week of pacing" anywhere,
  and the pricing table is honest.
- **The article conversion rework is complete and safe.** All 164 articles carry
  `question:` + `app:` blocks; every `app.feature` points at a real feature page
  (0 dangling); `pitchFor()` falls back gracefully when anything is missing; the
  question renders as a styled paragraph, not a competing h1; exactly one h1 and
  one FAQPage block per built article page.
- **Medical tone is mostly careful**: "Linked, never proven", "What Autonomic
  will not do" sections on every condition page, disclaimers in footer and FAQs,
  the NICE graded-exercise position cited.
- **OG cards**: every feature/condition/compare page has its own 1200×630 card.
- The press page is a complete, honest press kit; the expired giveaway URL
  redirects instead of 404ing.

---

## 🔴 Must fix before launch

1. **False competitor claim: "Visible works only with its own band."**
   Your own cited source (#8) says Visible membership works with the Visible
   Band 2.0 **or a Polar Verity Sense**. Stating something false about a named
   competitor on a page built to outrank them is the one legal risk on the site.
   - `src/lib/v2/compare.ts:92`, `:119`, `:128` ("the armband Visible used to ship")
   - `src/lib/v2/CompareTable.svelte:15`, `:17` ("No, their band only")
   - `src/routes/(site)/features/pacing-budget/+page.svelte:53-54`
   - Fix: "Only its own band or a Polar Verity Sense — no Apple Watch, Garmin or
     Fitbit." Still a strong contrast, and now defensible.

2. **"Pacing like Visible, without the band."** —
   `src/routes/(site)/conditions/me-cfs/+page.svelte:158`. This uses a
   competitor's name as our slogan, which is your own standing rule (and invites
   trademark attention on the exact page that compares against them). Fix:
   "Pacing without buying a band." The CompareTeaser context below it still names
   Visible legitimately.

3. **Android HRV import is promised and can't happen.** Health Connect has no
   beat-to-beat series, so the app imports **no** HRV on Android, ever — yet the
   hrv-readings page says "Imports from Apple Health and Health Connect"
   (`features/hrv-readings/+page.svelte:10`), answers the FAQ "Does Autonomic
   import HRV from Apple Health or Health Connect?" with "Yes…" (`:68`), repeats
   it at `:120`, and `compare.ts:186` says Welltory's HRV "arrives on its own"
   via Health Connect. An Android user who downloads on this promise finds it
   false on day one. Fix: scope HRV import to Apple Health / iPhone; on Android
   say sleep, heart rate and workouts come in, HRV comes from the camera, a
   strap or a Garmin.

4. **The 4.9★ claim doesn't match the public store page.** Apple's public
   lookup currently returns **4.69★ from 16 ratings** (US storefront) for
   id6789786971, while the site shows "4.9 · App Store" everywhere and ships
   `aggregateRating 4.9 / 26` in JSON-LD. Connect's worldwide number may well be
   4.9/26, but Google and visitors check against the public store page, and a
   rating in structured data that the store page contradicts is the kind of
   mismatch that gets rich results pulled. Fix: state what the public US store
   page shows (or drop the count from JSON-LD until the two agree). Also confirm
   the three quoted reviews are really 5★ — `StarRow` draws 5 full stars on each.

5. **Long COVID page over-promises prediction and recovery.**
   `conditions/long-covid/+page.svelte:79` "warns you before a crash … shows the
   slow recovery you cannot feel"; `:82` tagline "See the crash coming. See the
   climb back." The page's own FAQ (`:57`) says "nothing can promise that." This
   contradicts the app's entire design ethos (the trends engine won't even report
   declines by name). Fix: "flags a slide early", "Catch a slide early. See the
   long view." Same softening for `conditions/+page.svelte:260` ("Good days come
   back." — many ME/CFS readers' days don't) and
   `homeData.ts:33` / `pricing:55` ("Hear about a slide before it lands").

6. **"Yes." answering the wrong question, inside FAQ structured data.**
   `conditions/long-covid/+page.svelte:56`: Q "What is the best app for tracking
   long COVID?" → A begins "Yes. Autonomic is built…". Reads broken and ships in
   FAQPage JSON-LD. Delete the "Yes."

7. **The bulk "Reviewed November 4, 2026" stamp.** 153 articles now carry
   `reviewed: 2026-11-04`, rendered as "Reviewed {date}" + `lastReviewed` schema.
   On a health site with a non-clinician author this reads as a medical review
   claim, and stamping ~150 articles in one day contradicts ARTICLES.md's own
   "never bump a date on an article nobody checked." Fix: render it as "Sources
   checked {date}" and keep the field only on articles actually re-read. (The
   `updated:` bump itself is fine — the diff shows real content changes.)

8. **RSS will re-announce 155 old posts on launch day.**
   `rss.xml/+server.ts:38` sets `pubDate` from `updated || date`, so every feed
   subscriber gets 155 "new" items dated Nov 4. One-line fix: `pubDate` from
   `date`.

9. **23 articles build at two indexable URLs.**
   `insights/[topic]/[slug]/+page.ts` never checks the topic, so internal links
   that use a secondary category (e.g. `/insights/pots/science-of-salt-and-fluids-for-pots/`,
   linked from ~10 articles) prerender a full second copy — 187 article pages for
   164 articles, each duplicate carrying full Article + FAQPage JSON-LD.
   Canonicals are correct on both copies, which is why this is last on the list,
   but the fix is five lines: in `load`, when `params.topic !==
   categories[0]`, `throw redirect(308, articleHref(meta))`; then fix the
   markdown links and pin it in `tests/articles.test.mjs`. (Pre-exists on main,
   but launch is the moment to kill it.)

---

## 🟠 Should fix (launch week)

**Conversion / honesty**

- **Homepage & story "four answers" grid reads as all-free.** Two of the four
  (pacing, Insights) are Pro, unmarked, directly above "Free on iPhone and
  Android" (`+page.svelte:216-236`, `story/+page.svelte:72-74`). Add the PRO pill
  the pricing page already uses. Trial-then-paywall surprise is the #1 source of
  angry reviews.
- **Sample journal stats read as real.** The stat tiles ("+16 pts better than day
  one", "2 crash days this month") are fabricated figures with only the chart
  header saying "sample journal" (`+page.svelte:286-291`). Label the whole board.
- **QR codes mis-attribute conversions.** The site-wide QR points at `/download`,
  which tags everything with the **Videos** campaign (`download/+page.svelte:61-65`)
  — every hero QR scan will be counted as video traffic. Give the site QR its own
  campaign path. Also: `/download`'s visible title leaks "| Videos" to users
  (`:19`), and the page has two conflicting robots metas (`:120` `noindex,follow`
  vs `:134` `noindex,nofollow`) — delete one.
- **Welltory savings math uses their top price.** "$70 less a year (58%)"
  (`pricing/+page.svelte:181`) vs our own table's "$99.99 to $119.99". Say "up to".
- **"Generated on-device" is misleading** (`+page.svelte:371`): the prompt is
  built on-device; the answer comes from a cloud AI. Say so — the honest version
  is still a great privacy story.
- **"From each company's own listing and help pages"** (`ComparePage.svelte:79`)
  — Visible/Welltory prices actually come from third-party reviews. Cite directly
  or say "and independent reviews".
- **Redrawn competitor screenshots** (`ComparePage.svelte:57-59`) contradict
  compare.ts's own "never their screens" comment and are derivative of their
  trade dress. Drop `heroMock` or get a legal read.
- **3 vs 5 minutes.** Home FAQ/body say a camera reading takes "three minutes"
  (`+page.svelte:88,370`); the meta description, feature page and llms.txt say
  five. Pick one — LLMs will repeat the contradiction verbatim.

**Product accuracy**

- Cycle tracking badge should be `FREE · BETA`, not `FREE · NEW`
  (`features/cycle-tracking/+page.svelte:76`) — it's Beta in the app.
- The stand-test page omits the guided by-hand test the app actually has
  (`pots-stand-test/+page.svelte:10,61,72`) — it undersells to the no-device
  reader, who is exactly the one deciding whether to download.
- "Runs, syncs and saves" (`pots-stand-test:51`) vs "nothing to sync"
  (`compare.ts:122`) — say "saves to your phone".
- "scores … against medical thresholds" (`site.ts:6`) — say "published reference
  ranges and your own baseline".

**Technical**

- **Homepage ships two different SoftwareApplication entities** — the hand-built
  one (`+page.svelte:44-75`, no `@id`, single $0 offer) vs `appLd()` everywhere
  else. Use `appLd()` on the home page too.
- **Render-blocking Google Fonts** on every page (`app.html:92-95`). Self-host
  the woff2s with preload + `font-display: swap`. This is your biggest cheap LCP
  win; LCP is a ranking signal.
- **Hero video is 2.9 MB and autoplays on mobile** (`+page.svelte:135`). Serve a
  ~720p sub-1 MB file or start it on IntersectionObserver.
- `MidCta.svelte:25,35` renders "null App Store ratings" if `rating.reviews` is
  ever set back to null — wrap in `{#if}`.

---

## 🟡 Nice to have

- A real 301 for `/blog/*` via a CloudFront Function (the meta-refresh stubs are
  fine for Google, invisible to non-JS LLM crawlers).
- Point the expired-giveaway redirect at the giveaway article, not `/` (a
  redirect-to-home often reads as a soft 404).
- `/insights/articles/<topic>/` pages (12) are indexable near-duplicates of the
  topic hubs and missing from the sitemap — noindex or canonical them to the hub.
- Dedupe repeated FAQPage questions across pages (stand-test Q on two pages,
  "Is it a medical device?" on two) — and don't expect FAQ rich results at all;
  Google has withdrawn them for most sites.
- Own OG cards for /pricing, /story, /press (they fall back to the 615 KB
  `og.png` — also worth compressing); `/conditions/` index should use its
  existing card (`FeatureSeo.svelte:20` only maps the children).
- Article covers: `alt="Autonomic"` everywhere and no width/height — use the
  title as alt.
- The "On this page" script numbers and counts the new `## Sources` heading when
  placing the mid-article app card — skip it.
- 404.html links two favicons that don't exist; confirm CloudFront's custom
  error response actually returns status 404.
- Press page store links lack `data-dl-store`, so they count as `link_click` not
  `download_click`.
- Nav's "NEW · The pacing budget" promo lacks the PRO tag its sibling menu items
  have.
- `precompress: true` writes .br/.gz files S3+CloudFront never serve — turn on
  CloudFront compression instead.
- Build-output test: every sitemap URL exists + self-canonical + not noindex; every
  `/blog/<slug>/` stub targets `articleHref`; no duplicate-topic article pages.
  Nothing currently tests the features/conditions/compare pages at all.
- Giveaway article's app hook still pitches the ended giveaway ("Ten mornings of
  readings, ten chances to win") — swap to the evergreen hrv-readings hook.
- Inline app.html script (~94 KB inlined into every page) → a cached `/site.js`.
- Weak citation fits: `cycle-tracking:151` (Jarjour 2013 doesn't cover heavy
  periods), `conditions/pots:101` (Peggs 2012 is cycle-only), `hrv-readings:151`.
- ARTICLES.md is untracked — commit it; and its line 201 (rail uses feature copy)
  no longer matches the code.
- Stale comments in `site.ts:169-179` ("both read 5.0") invite a wrong "fix".

---

## Verify on launch day (can't be checked from the repo)

- The open items in PRE_LAUNCH.md still stand: DNS/cert/origin match for
  `https://autonomic.care`, Search Console + Bing sitemap submission, social-card
  validators, Rich Results test on the live URLs.
- CloudFront behavior for `/path/` → `index.html`, slashless-URL redirects, and
  the 404 custom error response status.
- Live competitor facts before the compare pages go up: Visible pricing +
  supported hardware, Welltory free-plan reading limit and AI-coach price,
  Bearable's HRV behavior ("Not measured" — confirm it doesn't import HRV from
  Apple Health), and the three hardcoded competitor store ratings.

---

## Bottom line

The redesign does what you built it to do: the site now has real landing pages
for the queries that matter, the article → app tie-in is implemented cleanly
with zero dangling references, and the technical SEO (sitemap, canonicals,
llms.txt, redirects, analytics) is launch-grade today. The must-fix list is
almost entirely **words, not architecture** — one false competitor claim, one
impossible Android promise, one rating mismatch, a handful of over-promises to
the sickest readers, two one-line feed/redirect fixes. Fix those nine and ship.
