# Pre-launch checklist — Autonomic landing & blog

Outstanding work before the marketing site (`landing/`) goes live at
**https://autonomic.app**. Grouped by priority. Checked items are done; the rest
are open. SEO/structured-data groundwork is complete (see the "Done" section at
the bottom) — this list is what's left.

---

## 🔴 Blockers — the site is not launch-ready without these

- [ ] **Wire up the waitlist forms.** Both the hero form (`#heroForm`) and the
      Android waitlist form (`#wlForm`) currently just show an inline "success"
      message and throw the data away. See the `TODO: POST the form data to your
      waitlist endpoint` comments in `src/app.html`. Pick a destination
      (e.g. a form service, an email provider list, or a serverless endpoint) and
      POST `email` / `name` / `condition` / `tracks`. Add spam protection
      (honeypot or captcha) since it's an unauthenticated public POST.
- [ ] **Real App Store link.** The "Download on the App Store" badge in
      `src/routes/+page.svelte` links to `href="#"`. Point it at the live App
      Store URL once the app is published, then also:
  - [ ] add `"downloadUrl"` / `"installUrl"` to the `SoftwareApplication` JSON-LD
        on the homepage.
- [ ] **Confirm the app's launch status matches the copy.** The homepage says
      both "Autonomic is in private build / join the waitlist" *and* "Download
      for iOS now / live on iPhone." Reconcile these before launch so the page
      isn't self-contradictory.
- [ ] **Deploy target + DNS.** Confirm `autonomic.app` DNS points at the host,
      HTTPS/cert is valid, and the static `build/` output is what's served.
      Every canonical URL, the sitemap, and all structured data hard-code
      `https://autonomic.app` — the live origin must match exactly (no `www`
      vs. apex mismatch, no trailing-slash redirects fighting
      `trailingSlash: 'always'`).

---

## 🟠 High priority — do before or right at launch

- [ ] **Google Search Console**: verify the property, submit
      `https://autonomic.app/sitemap.xml`, and confirm pages are indexable.
- [ ] **Bing Webmaster Tools**: verify + submit the sitemap (also feeds
      DuckDuckGo/ChatGPT search surfaces).
- [ ] **Social handles / `sameAs`** (deferred per owner). When ready:
  - [ ] add `sameAs` (X, Instagram, App Store, etc.) to the `Organization`
        JSON-LD in `src/app.html`.
  - [ ] add `twitter:site` / `twitter:creator` meta (site-wide in `app.html`,
        or per-page) so X cards attribute the account.
- [ ] **Verify social cards render** by pasting a few live URLs into the
      [X Card Validator], [LinkedIn Post Inspector], and
      [Facebook Sharing Debugger] — confirm the new `og.png` shows and there are
      no duplicate-tag warnings.
- [ ] **Validate structured data** with Google's
      [Rich Results Test] and the [Schema.org validator] for: the homepage
      (Organization / WebSite / SoftwareApplication / FAQ), an article
      (Article / BreadcrumbList / FAQ), a topic hub (CollectionPage), and a
      writer page (ProfilePage). Build output already parses clean locally.

---

## 🟡 Nice to have — polish, can trail launch

- [ ] **Regenerate `og.png` if branding changes.** It was generated from an
      HTML template via headless Chrome (1200×630). If the tagline, palette, or
      wordmark changes, re-render and re-drop it in `static/og.png`. Consider a
      per-article OG image later (each article already has a `photoLocation`
      cover it falls back to).
- [ ] **Fonts / Core Web Vitals.** Space Grotesk + Space Mono load render-
      blocking from Google Fonts (`src/app.html`). Self-hosting the woff2 files
      (or `preload` + `font-display: swap`) would improve LCP, which is a
      ranking signal. Run [PageSpeed Insights] on the live URL and address any
      LCP/CLS flags.
- [ ] **Analytics decision.** The site currently ships no analytics (consistent
      with the privacy story). If you want launch metrics, choose a
      privacy-friendly, cookieless option and make sure it doesn't contradict the
      "no tracking" messaging on the homepage and privacy policy.
- [ ] **`aggregateRating`** on `SoftwareApplication` once there are real App
      Store reviews (never fabricate this — Google penalizes fake review markup).
- [ ] **404 page.** Add a branded `src/routes/+error.svelte` so bad URLs and
      dead links land somewhere on-brand with a path back to the blog.
- [ ] **Legal review.** Have someone confirm the Privacy Policy and Terms of
      Service copy is accurate for the shipping app (data handling, iCloud
      backup, subscription terms, medical-disclaimer language).
- [ ] **Proofread pass** over homepage + all published articles for typos,
      pricing consistency ($50/yr, 7-day trial), and factual/medical accuracy.

---

## ✅ Already done (SEO & structured data)

- Branded **1200×630 `og.png`** created and shipped (was a 404 referenced
  everywhere).
- Site-wide **Organization + WebSite** JSON-LD, `og:site_name`, `og:locale`,
  light/dark `theme-color`, app-name meta in `app.html`.
- **Complete Open Graph + Twitter cards** on every page (home, blog index, topic
  hubs, writer profiles, all-articles, per-topic lists, privacy, terms) — with
  image dimensions/alt and no duplicate tags.
- **Article pages**: `article:*` OG namespace tags + enriched `Article` JSON-LD
  (`url`, `image`, `isPartOf`, square `publisher.logo` with dimensions).
- **Listing structured data**: `CollectionPage` + `ItemList`, `BreadcrumbList`,
  and `ProfilePage`/`Person`.
- **Sitemap** `lastmod` now uses each article's `updated` date; home + blog
  index reflect the freshest post.
- **RSS** channel link fixed (`/blog/` → `/insights/`), plus `lastBuildDate`,
  per-item author, `generator`, and channel image.
- **robots.txt** left fully open with explicit AI/answer-engine crawler allows
  (GPTBot, PerplexityBot, ClaudeBot, Google-Extended, Applebot, Bingbot…).
- All article frontmatter already carries strong `description` + `keywords`.

<!-- link refs -->
[X Card Validator]: https://cards-dev.twitter.com/validator
[LinkedIn Post Inspector]: https://www.linkedin.com/post-inspector/
[Facebook Sharing Debugger]: https://developers.facebook.com/tools/debug/
[Rich Results Test]: https://search.google.com/test/rich-results
[Schema.org validator]: https://validator.schema.org/
[PageSpeed Insights]: https://pagespeed.web.dev/
