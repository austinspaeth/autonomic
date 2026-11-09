# Site analytics (GA4)

One property, `G-3R3E75CLGQ`, loaded from `src/app.html`. Every custom event
goes through `ajEvent(name, params)`, which adds `location` (path),
`page_type` (`home`, `blog_hub`, `blog_article`, `features_…`) and, on an
article, `article` (its slug). Nothing fires on `localhost` or `/master`, and
nothing fires for a visitor who blocked cookies.

To test locally without sending hits, open the dev server on `http://[::1]:5173`
in a browser that blocks `googletagmanager.com`, and read `window.dataLayer`.

## Naming a CTA

**Every CTA carries `data-cta="<name>"`** on the element or the block around
it. That name is what every report is split by, so a new CTA without one
reports as an anonymous section. Rules:

- snake_case, saying where it is and what it is: `article_mid_card`, `page_cta`.
- A shared component names itself once (`mid_cta`, `review_strip`); the page
  is already on every event as `location`.
- A name used twice on one page is numbered automatically in page order
  (`mid_cta`, `mid_cta_2`). Where a block repeats by subject, put the subject
  in the name instead (`symptom_pitch_dizzy`, `topic_pitch_mecfs`).
- On an article, `data-feature` (the app feature it sells) rides along.

## Every CTA click fires two events

| Event | When | Key params |
| --- | --- | --- |
| `cta_click` | **Every** CTA click, download or pitch. The one report for "which CTA works" | `cta`, `cta_type` (`download` / `store` / `pitch`), `platform`, `plan`, `feature`, `via` (`direct` / `download_modal`), `target` |
| `download_click` | A download CTA or store badge | `platform`, `placement`, `cta`, `plan`, `feature` |
| `app_store_click` / `play_store_click` | The same, split by store (kept for older reports) | `placement`, `cta`, `plan`, `feature` |
| `app_pitch_click` | A named link into a feature, condition or comparison page | `cta`, `target`, `feature` |
| `download_modal_open` | A download CTA on desktop opens the QR modal | `placement`, `cta` |
| `cta_view` | A named CTA is half on screen (once per page load). Click-through = `cta_click` / `cta_view` | `cta`, `feature` |
| `download_redirect` | Every pass through `/download` or a campaign link (QR codes land here); also fires `app_store_redirect` / `play_store_redirect` / `site_redirect` | `platform`, `destination` (`app_store` / `play_store` / `site`), `campaign` |
| `blog_to_site` | **Key event.** A reader on a blog page leaves it for anywhere that is NOT the blog, by any route: a link in the prose, a mid-article pitch, the nav, the burger menu, the footer or the brand logo. The DESTINATION is the whole rule, so the only exclusions are the blog itself (`/insights`, `/blog`), an anchor on the page they are already on, and `/master`. Once per page load. Downloads are not counted here; they are `download_click` | `target` (the page they went to), `via` (`body` / `chrome`), `cta` (what they clicked), `from_type` (`blog_article` / `blog_hub`) |
| `download_intent` | **Key event.** The visitor asked for the app: a store badge, a phone deep-link tap, or the desktop QR modal opening. **Once per session** | `how` (`store_link` / `store_badge_in_modal` / `download_modal`), `placement`, `cta`, `platform`, `plan`, `feature` |

A store badge **inside the download modal** has `placement: download_modal`
but `cta` set to the CTA that **opened** the modal, so a desktop download is
credited to the article card or page CTA that started it.

## The CTA names

| Name | Where |
| --- | --- |
| `nav_get_app`, `nav_promo_pacing` | Header button, Features menu promo |
| `sticky_cta_score`, `sticky_cta_button` | Mobile sticky bar on blog pages |
| `hero_download` | The download box in every hero (home, features, conditions, comparisons) |
| `review_strip` | The rating + reviews strip with store badges |
| `mid_cta` (`_2`…) | Mid-page download bar |
| `page_cta` | The download section at the foot of a page |
| `plans_free`, `plans_pro`, `home_plans_free`, `home_plans_pro` | Plan buttons |
| `home_match`, `home_inline`, `home_end_cta`, `features_match`, `story_start_trial` | One-off home / features / story CTAs |
| `compare_teaser_link`, `compare_teaser_card` | "Autonomic vs X" teaser on condition pages |
| `article_answer_box`, `article_answer_link` | "Your answer" box under an article's short answer |
| `article_mid_card`, `article_mid_card_link` | The app card in the middle of an article |
| `article_rail` | "Get it on your phone" card in the article rail |
| `app_band`, `app_band_row_<feature>`, `app_band_link` | The video band (blog, topics, articles) |
| `symptom_pitch_<symptom>` | The app pitch closing a symptom list on the blog home |
| `topic_pitch_<topic>` | The app link on a blog-home topic card |
| `blog_end_cta` | The download card at the foot of blog list pages |
| `footer` | Footer store badges |

## Content events

| Event | Params |
| --- | --- |
| `article_click` | `article_target`, `placement` (`blog_latest`, `blog_new`, `blog_start_here`, `blog_topics`, `blog_symptom`, `topic_start_here`, `topic_group`, `topic_newest`, `topic_more`, `related`, `condition_latest`) |
| `article_scroll` | `percent` 25 / 50 / 75 / 100 of the article body |
| `article_link_click` | `target`, `link_type` (internal / external / anchor), `text` |
| `article_share` | `network` (Facebook, X, LinkedIn, Reddit) |
| `article_copy`, `article_details_open`, `toc_click` (`section`) | |
| `topic_click`, `author_click`, `symptom_open` (`symptom`) | |
| `blog_search_select` (`query`, `target`, `rank`, `kind`), `blog_search_none` (`query`) | The blog typeahead. `blog_search_none` is the list of questions nobody has answered yet |
| `faq_open` (`question`), `calc_use`, `calc_change` | |
| `link_click` | Any other link: `target`, `placement`, `link_type`, `text` |
| `nav_click`, `section_view`, `sticky_cta_view`, `sticky_cta_dismiss` | |

## One-time setup in GA

GA4 only shows a custom parameter in reports once it is registered. In
**Admin → Custom definitions → Create custom dimension** (scope: Event), add:

`cta`, `cta_type`, `feature`, `placement`, `via`, `plan`, `platform`,
`target`, `article`, `article_target`, `page_type`, `from_type`, `percent`,
`network`, `query`, `symptom`, `section`, `link_type`, `destination`, `campaign`,
`how`.

**Key events: `download_intent` and `blog_to_site`. Those two only.**

They are the two questions the site is answered by — did this visitor ask for
the app, and did the blog send this reader into the product — and each is a
HEADCOUNT: `download_intent` fires once per session, `blog_to_site` once per
page load.

Three events used to be marked alongside them, and all three were wrong for the
job. None of them is a headcount, so marking them put the same visitor in the
conversion column several times over and made the four key events read as one
number:

- `cta_click` fires on every CTA of any kind, pitch included, and fires TWICE on
  a desktop download (opening the modal, then the badge inside it).
- `download_click` fires per store badge, so one visitor weighing up iPhone
  against Android is two conversions.
- `download_redirect` is INBOUND traffic through `/download`, not an action
  taken on the site at all. It belongs to acquisition, and as a key event it
  books every QR-code arrival as a conversion before the visitor has done
  anything.

All three stay exactly as they are, as the reporting splits underneath the two
key events. Do not add them together with each other or with the key events.

## Two things that make the numbers lie, and what was done about them

**Scripted browsers.** A link checker, an SEO auditor, an uptime or
accessibility scanner and an AI browsing agent all enumerate a page by
DISPATCHING CLICKS at every anchor they find, and inside a listener a dispatched
click is indistinguishable from a finger. One pass over an article therefore
fires the whole engagement set at once, which is how a visitor who never left an
article comes to look like a conversion. GA's own bot filtering only knows
DECLARED crawlers, and these declare nothing. `_ajBlocked` in `src/app.html` now
includes `navigator.webdriver`, the W3C automation flag that a browser under
automation is required to set and that no ordinary browsing mode sets: the tag
never loads, no event is queued, and `/download` redirects immediately instead
of waiting on a callback.

**Realtime pools a session, not a page.** GA's realtime user view shows every
event in the visitor's last 30 minutes whatever page it came from, and its
event-name card is site-wide across all visitors. A visitor who arrived through
`/download`, was bounced to the home page, then read an article will show
`download_redirect` while sitting on the article — correctly. Every event this
site sends carries a `location` param naming the page that fired it; that param
is the only way to tell "this page fired it" from "an earlier page in the
session did", and realtime does not show params.

**DebugView on any device.** Add `?aj_debug=1` to any URL. It sets GA's
`debug_mode` for the rest of that browser session (sessionStorage, so it cannot
leak into an ordinary visit) and makes the page log every event and its
parameters to the console; `?aj_debug=0` turns it off. Debug hits are still
counted in reports, so it is safe to leave on while watching.

`landing/tests/tracking.test.mjs` drives a built article in jsdom and pins all
of it: that a page load fires no key event, that leaving the blog fires
`blog_to_site` once from the prose AND once from the chrome (tagged `via`),
that a link back into the blog fires nothing, and that two store badges are
one `download_intent`.
