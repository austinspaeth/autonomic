# GA4 setup for the CTA tracking

Do these after the new site is deployed. GA only records a custom parameter
from the day you register it (never retroactively), so do step 1 soon after
the deploy. Property: `G-3R3E75CLGQ`. The full event list is in
`ANALYTICS.md`.

---

## 1. Register the parameters (once, about 5 minutes)

GA → **Admin → Data display → Custom definitions → Create custom dimension**.

For each row: **Dimension name** and **Event parameter** are the same word,
**Scope = Event**.

- [ ] `cta`
- [ ] `cta_type`
- [ ] `feature`
- [ ] `placement`
- [ ] `via`
- [ ] `plan`
- [ ] `platform`
- [ ] `target`
- [ ] `from_type`
- [ ] `article`
- [ ] `article_target`
- [ ] `page_type`
- [ ] `link_type`
- [ ] `query`
- [ ] `symptom`
- [ ] `section`
- [ ] `network`
- [ ] `percent`
- [ ] `destination` (the download redirect: `app_store`, `play_store` or `site`)
- [ ] `campaign` (which QR code or campaign link a redirect came from)

(20 of GA's 50 allowed.)

---

## 2. Mark the key events

GA → **Admin → Data display → Key events → New key event**. Type each name
exactly; this works before any data has arrived.

- [ ] `download_click`: the real conversion, a tap on a store badge or link
- [ ] `cta_click`: any CTA tap
- [ ] `blog_to_site`: a blog reader moving on to the rest of the site
- [ ] `download_redirect`: someone came through `/download` or a campaign link / QR code. It also counts desktop visitors sent to the site (`destination: site`); if you want store sends only, mark `app_store_redirect` and `play_store_redirect` instead

`cta_click` includes downloads and `download_redirect` overlaps them, so do not add these together. Treat
`download_click` as the headline number.

---

## 3. The CTA report

GA → **Explore → Blank → Free form**.

1. **Dimensions** (the + next to it): import `cta`, **Event name**, `feature`, **Page path and screen class**.
2. **Metrics**: import **Event count** and **Total users**.
3. **Rows**: `cta`.
4. **Columns**: **Event name**.
5. **Values**: **Event count**.
6. **Filters**: **Event name** → *matches regex* → `cta_view|cta_click|download_click`.

Each row is one CTA: how often it was seen (`cta_view`), clicked
(`cta_click`) and turned into a download (`download_click`). Click-through is
clicks ÷ views.

To see which articles' tailored pitches convert, add `feature` or
**Page path** as a second row dimension.

Name it **CTA performance** and keep it.

---

## 4. Where the blog sends people

**Free form** again:

1. Filter **Event name** → *exactly matches* → `blog_to_site`.
2. **Rows**: `target` (the page they went to), then `cta` (what they clicked).
3. **Values**: **Event count**.

Name it **Blog to site**.

---

## 5. The funnel: blog → site → download

GA → **Explore → Funnel exploration**.

1. **Steps** (pencil icon):
   - Step 1: **page_view**, with a parameter condition *Page location contains* `/insights/`
   - Step 2: `blog_to_site`
   - Step 3: `download_click`
2. Leave **Make open funnel** OFF, so the steps must happen in order.
3. Optional breakdown: `cta` or **Session source / medium**.

Name it **Blog funnel**.

---

## 6. Check it's working

1. Open **https://tagassistant.google.com**, add `https://autonomic.care`, connect.
2. In GA open **Admin → DebugView**.
3. On the live site, open an article and click:
   - the "Get the free app" button under the short answer → expect `download_modal_open` + `cta_click` (`cta: article_answer_box`)
   - a store badge in the modal → `app_store_click` / `play_store_click` + `download_click` + `cta_click` (`cta_type: store`)
   - "How Insights works →" in the mid-article card → `app_pitch_click` + `cta_click` + `blog_to_site`
   - a related article → `article_click` (no `blog_to_site`, it stays on the blog)

Notes:
- Nothing records on `localhost`; test on the live site.
- New custom dimensions take up to 24 hours to show in reports.
