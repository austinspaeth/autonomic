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
| `blog_to_site` | A reader on a blog page clicks through to a non-blog page of the site (feature, condition, comparison, pricing, home). Downloads are not counted here; they are `download_click` | `target` (the page they went to), `cta` (what they clicked), `from_type` (`blog_article` / `blog_hub`) |

A store badge **inside the download modal** has `placement: download_modal`
but `cta` set to the CTA that **opened** the modal, so a desktop download is
credited to the article card or page CTA that started it.

## The CTA names

| Name | Where |
| --- | --- |
| `nav_get_app`, `nav_promo_pacing` | Header button, Features menu promo |
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
| `nav_click`, `section_view` | |

## One-time setup in GA

GA4 only shows a custom parameter in reports once it is registered. In
**Admin → Custom definitions → Create custom dimension** (scope: Event), add:

`cta`, `cta_type`, `feature`, `placement`, `via`, `plan`, `platform`,
`target`, `article`, `article_target`, `page_type`, `from_type`, `percent`,
`network`, `query`, `symptom`, `section`, `link_type`, `destination`, `campaign`.

**Key events:** `cta_click`, `download_click`, `blog_to_site` and `download_redirect`.
`download_click` is the one to optimise; `cta_click` counts every CTA
(downloads included) and `blog_to_site` counts readers the blog sent into
the rest of the site.
