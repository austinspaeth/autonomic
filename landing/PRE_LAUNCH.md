# Pre-launch checklist — Autonomic landing & blog

Outstanding work before the marketing site (`landing/`) goes live at
**https://autonomic.care**. Grouped by priority. Checked items are done; the rest
are open. Verified against source on 2026-07-10.

---

## 🔴 Blockers — the site is not launch-ready without these

- [ ] **Real App Store link + reconcile launch status.** The "Download on the
      App Store" badge in `src/routes/+page.svelte` (~line 461) still links to
      `href="#"`, and there is no `apps.apple.com` URL anywhere in `src/`. Yet the
      copy says "available now on the Apple App Store," "Download for iOS now,"
      and "live on iPhone" — while the hero + CTA also say "Join the waitlist."
      Decide which is true:
  - If **iOS is live**: point the badge at the real App Store URL, add
        `"downloadUrl"`/`"installUrl"` to the `SoftwareApplication` JSON-LD, and
        decide whether the waitlist becomes Android-only.
  - If **not live yet**: soften the "available now / live on iPhone" copy back to
        waitlist framing (and note Google can flag a `SoftwareApplication` whose
        `offers` price isn't actually purchasable).
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
      pricing consistency ($50/yr, 7-day trial), and factual/medical accuracy.
- [ ] **Regenerate `og.png` if branding changes** (1200×630). Consider a
      per-article OG image later (each article already has a `photoLocation`
      cover it falls back to).

---

## ✅ Already done

- **Canonical domain is `autonomic.care`** across `site.ts`, every canonical/OG
  tag, all JSON-LD, RSS, and the sitemap `BASE`.
- **Waitlist forms wired** — hero + Android forms POST to FlowForm and fire a GA
  `waitlist_signup` event; App Store badge fires an `app_store_click` event.
- **Analytics live** — GA4 (`G-3R3E75CLGQ`) configured site-wide in `app.html`.
- **Branded 404** — `static/404.html` (noindex, styled, favicons, Autonomic
  title).
- **SEO / structured data**: site-wide Organization + WebSite JSON-LD;
  `SoftwareApplication` with `offers` ($50/yr, 7-day trial); complete Open Graph
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
