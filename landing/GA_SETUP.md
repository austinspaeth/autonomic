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
- [ ] `how` (how download intent was given: `store_link`, `store_badge_in_modal`, `download_modal`)

(21 of GA's 50 allowed.)

---

## 2. Mark the key events

GA → **Admin → Data display → Key events → New key event**. Type each name
exactly; this works before any data has arrived.

**Two, and only two:**

- [ ] `download_intent`: the visitor asked for the app (a store badge, a phone deep-link tap, or the desktop QR modal opening). **Once per session**, so a day's count is people
- [ ] `blog_to_site`: a blog reader left the blog for any other page of the site, by any route (prose link, pitch card, nav, footer, brand logo). **Once per page load**. Split it by `via` (`body` / `chrome`) and `target`

**Un-mark these three if they are currently marked** (Admin → Data display →
Key events → the row's ⋮ → *Unmark as key event*). They are all real events
worth reporting on, but none of them is a headcount, so as key events they
count the same visitor several times and the four numbers collapse into one:

- [ ] `cta_click` — every CTA of any kind, pitch included, and twice on a desktop download (modal open, then the badge inside)
- [ ] `download_click` — per store badge, so one visitor comparing iPhone and Android is two conversions
- [ ] `download_redirect` — INBOUND traffic through `/download` or a QR code. Acquisition, not an action on the site; as a key event it books every QR arrival as a conversion before the visitor does anything

They stay as the splits underneath the two key events. Never add them together.

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
   - a **nav, footer or brand logo** link off the blog → `nav_click` / `link_click` **plus** `blog_to_site` with `via: chrome`
   - the **breadcrumb**, or any link back into `/insights` → never `blog_to_site`
   - a second store badge → a second `download_click`, but **no** second `download_intent`

Notes:
- Nothing records on `localhost`; test on the live site.
- New custom dimensions take up to 24 hours to show in reports.

### Watching a real visitor's phone, without the Chrome extension

Add **`?aj_debug=1`** to any URL. It turns on GA's `debug_mode` for the rest of
that browser session, so the hits appear in **DebugView**, and it makes the page
log every event with its parameters to the browser console. `?aj_debug=0` turns
it off. It lives in sessionStorage, so it expires with the tab and cannot leak
into an ordinary visit, and debug hits are still counted in reports.

### Before believing "this visitor fired everything"

Two things make realtime read that way, and neither is a tracking fault:

1. **Realtime pools the whole session.** The user view lists every event in that
   visitor's last 30 minutes whatever page it came from, and the event-name card
   is site-wide across all visitors. Someone who arrived through `/download`,
   got bounced to the home page and then opened an article will show
   `download_redirect` while sitting on the article — correctly. Every event
   carries a **`location`** param naming the page that fired it; that is the
   only way to tell the two apart, and realtime does not show params. Use
   DebugView (above) or an Explore with `location` as a dimension.
2. **Scripted browsers click.** Link checkers, SEO and accessibility scanners
   and AI browsing agents walk a page by dispatching clicks at every anchor,
   which fires the whole engagement set in one pass. GA's bot filter only knows
   declared crawlers. `src/app.html` now blocks anything with
   `navigator.webdriver` set, so the tag never loads for them at all.
