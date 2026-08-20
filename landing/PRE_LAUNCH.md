# Pre-launch checklist — Autonomic landing & blog

Outstanding work before the marketing site (`landing/`) goes live at
**https://autonomic.care**. Grouped by priority. Checked items are done; the rest
are open. Verified against source on 2026-07-10.

---

## 🔴 Blockers — the site is not launch-ready without these

- [x] **Real App Store link + reconcile launch status.** iOS is live. Every
      "Download on the App Store" CTA (hero, nav, pricing plans, waitlist badge,
      blog end-CTA, insights sidebar) now points at the real store URL via the
      shared `appStoreUrl` constant in `src/lib/site.ts`
      (`https://apps.apple.com/app/id6789786971`), and the `SoftwareApplication`
      JSON-LD carries `downloadUrl`/`installUrl`. (The waitlist stays
      Android-only, matching the "available now on iOS" copy.)
- [ ] **Deploy target + DNS.** Confirm `autonomic.care` DNS points at the host,
      HTTPS/cert is valid, and the static `build/` output is what's served. Every
      canonical URL, the sitemap, and all structured data hard-code
      `https://autonomic.care` — the live origin must match exactly (no `www`
      vs. apex mismatch, no trailing-slash redirects fighting
      `trailingSlash: 'always'`).

---

## 🟠 High priority — do before or right at launch

- [ ] **Google Search Console**: verify the property, submit
      `https://autonomic.care/sitemap.xml`, confirm pages are indexable.
- [ ] **Bing Webmaster Tools**: verify + submit the sitemap (also feeds
      DuckDuckGo/ChatGPT search surfaces).
- [ ] **Social handles / `sameAs`** (deferred per owner). When ready:
  - [ ] add `sameAs` (X, Instagram, App Store, etc.) to the `Organization`
        JSON-LD in `src/app.html`.
  - [ ] add `twitter:site` / `twitter:creator` meta (site-wide in `app.html`,
        or per-page) so X cards attribute the account. (None present yet.)
- [ ] **Verify social cards render** by pasting a few live URLs into the
      [X Card Validator], [LinkedIn Post Inspector], and
      [Facebook Sharing Debugger] — confirm `og.png` shows and there are no
      duplicate-tag warnings.
- [ ] **Validate structured data** with Google's [Rich Results Test] and the
      [Schema.org validator] for: the homepage (Organization / WebSite /
      SoftwareApplication / FAQ), an article (Article / BreadcrumbList / FAQ), a
      topic hub (CollectionPage), and a writer page (ProfilePage). Build output
      parses clean locally.

---

## 🟡 Nice to have — polish, can trail launch

- [ ] **Fonts / Core Web Vitals.** Space Grotesk + Space Mono still load
      render-blocking from Google Fonts (`src/app.html`). Self-hosting the woff2
      files (or `preload` + `font-display: swap`) would improve LCP, a ranking
      signal. Run [PageSpeed Insights] on the live URL and address LCP/CLS flags.
- [ ] **`aggregateRating`** on `SoftwareApplication` once there are real App
      Store reviews (never fabricate — Google penalizes fake review markup).
      Correctly absent today.
- [ ] **Legal review.** Privacy Policy + Terms of Service copy is drafted;
      have someone confirm it's accurate for the shipping app (data handling,
      iCloud backup, subscription terms, medical-disclaimer language).
- [ ] **Proofread pass** over homepage + all 50 published articles for typos,
      pricing consistency ($50/yr, 14-day trial), and factual/medical accuracy.
- [ ] **Regenerate `og.png` if branding changes** (1200×630). Consider a
      per-article OG image later (each article already has a `photoLocation`
      cover it falls back to).

---

## ✅ Already done

- **Canonical domain is `autonomic.care`** across `site.ts`, every canonical/OG
  tag, all JSON-LD, RSS, and the sitemap `BASE`.
- **Android waitlist form wired** — POSTs to FlowForm and fires a GA
  `waitlist_signup` event; App Store badge fires an `app_store_click` event.
  (The hero form was replaced by the App Store badge + an anchor link to the
  Android waitlist section.)
- **Waitlist form collects no health data** — the "What are you managing?"
  condition dropdown and the "What do you track today?" free-text field were
  removed (2026-07-12); the form now asks for email + optional first name only.
  The Privacy Policy's "The website" section discloses the form and FlowForm
  delivery, and must stay in sync if fields ever change.
- **Analytics live** — GA4 (`G-3R3E75CLGQ`) configured site-wide in `app.html`,
  gated by the cookie banner (opt-out: loads by default, "Block cookies"
  disables it now and on future visits), as described in the Privacy Policy.
- **Branded 404** — `static/404.html` (noindex, styled, favicons, Autonomic
  title).
- **SEO / structured data**: site-wide Organization + WebSite JSON-LD;
  `SoftwareApplication` with `offers` ($50/yr, 14-day trial); complete Open Graph
  + Twitter cards on every page with image dimensions/alt and no duplicate tags;
  `article:*` tags + enriched `Article` JSON-LD; `CollectionPage`/`ItemList`,
  `BreadcrumbList`, `ProfilePage`/`Person` on listings.
- **Sitemap** `lastmod` uses each article's `updated` date. **RSS** channel link,
  `lastBuildDate`, per-item author, `generator`, channel image all set.
- **robots.txt** open with explicit AI/answer-engine crawler allows (GPTBot,
  PerplexityBot, ClaudeBot, Google-Extended, Applebot, Bingbot…).
- **Branded 1200×630 `og.png`** shipped; all article frontmatter carries strong
  `description` + `keywords`.

<!-- link refs -->
[X Card Validator]: https://cards-dev.twitter.com/validator
[LinkedIn Post Inspector]: https://www.linkedin.com/post-inspector/
[Facebook Sharing Debugger]: https://developers.facebook.com/tools/debug/
[Rich Results Test]: https://search.google.com/test/rich-results
[Schema.org validator]: https://validator.schema.org/
[PageSpeed Insights]: https://pagespeed.web.dev/
