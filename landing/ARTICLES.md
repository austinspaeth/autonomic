# Writing an article for Questions People Ask

The blog at `/insights/` is called **Questions People Ask**. Every article is the
answer to one real question a person with POTS, long COVID, ME/CFS or
dysautonomia types into Google or asks an AI. For most visitors an article is
the first page of Autonomic they ever see, so it has three jobs, in this order:

1. **Answer the question**, fully and honestly, in plain words.
2. **Be the source an AI quotes**: a direct short answer, clear sections,
   cited research, an FAQ.
3. **Lead to the app**, through the one feature that continues the question.

The page does most of the third job itself (see *What the page adds for you*),
so the markdown stays an answer, not an advert.

`npm run build` runs `tests/articles.test.mjs` first and **fails on a broken
article**. Run it on its own with `npm run test:articles`.

**Writing unattended (the daily routine)?** Follow *The daily routine* below,
step by step. It is the one source of truth; the routine's own prompt only
says to sync, follow this file and publish.

---

## The daily routine

Do every step in order. Skipping research or sourcing is how a wrong claim
reaches a person who is already unwell.

### 1. Choose the question (research, not guesswork)

1. **List what exists.** `ls landing/articles/` and skim titles and
   `question:` lines (`grep -h "^question:" landing/articles/*.md`). A new
   article must answer a question no existing article answers. If one is
   close, pick a different question rather than writing a near-duplicate:
   two pages fighting for one search hurts both.
2. **Find real questions people ask.** Use web search for the topic and note:
   - Google's "People also ask" questions and autocomplete phrasings
     ("why does my heart…", "is it normal to…", "does … help pots").
   - What people actually ask in r/POTS, r/dysautonomia, r/covidlonghaulers
     and r/cfs (search `site:reddit.com/r/POTS <topic>`).
   - Questions answered thinly or not at all by the big sites (Cleveland
     Clinic, Mayo, Healthline, Dysautonomia International). A gap is the
     opportunity.
3. **Pick ONE primary question** that is specific, common, evergreen and
   answerable from real evidence, and that an Autonomic feature naturally
   continues (see *The app block*). Prefer, in order: symptom questions
   ("Why do I get dizzy after eating?"), "does X help" questions about a
   common treatment or habit, test and number questions ("What is a normal
   HRV for my age?"), then condition-overlap questions.
4. **Write down the keywords** before drafting: the primary phrase (the
   question as people type it), 4 to 8 secondary phrases and the plain
   synonyms (dizzy, lightheaded; tired, fatigue). They go in `keywords`, the
   title, the first 100 words, two or three `##` headings and the FAQ.
5. **Choose the topic** (first category) it belongs under.

### 2. Gather the evidence (before writing a word)

1. Find **5 to 12 sources** for the claims the article will make. Prefer, in
   order: peer-reviewed papers (systematic reviews and meta-analyses first,
   then trials), clinical guidelines and consensus statements (Heart Rhythm
   Society, NICE, CDC, NIH, AHA, Dysautonomia International, Bateman Horne
   Center), then major medical centres (Mayo Clinic, Cleveland Clinic, Johns
   Hopkins). Never Wikipedia, blogs, forums, product or company pages, or
   another app's site.
2. **Verify every one** by opening it (web fetch, PubMed or Europe PMC
   record, or the DOI): it must load, and the title, authors, year and
   finding must match what you will say. Link the DOI
   (`https://doi.org/...`) or the PubMed / PMC page. If a source cannot be
   verified, do not use it.
3. **Check the newest evidence.** Search for the topic plus the current
   year. If a large trial or a newer guideline has changed the picture, the
   article says so. An article built on an outdated finding is wrong.
4. **Write numbers only from sources.** Every threshold, percentage, range,
   dose or timeframe must come from a source you opened. If you cannot find
   one, describe it without the number ("varies widely from person to
   person").
5. Where the evidence is mixed, weak or negative, **say so plainly**. Never
   round "one small uncontrolled study" up to "research shows".

### 3. Write it

Follow everything from *Frontmatter* to *Components* below: the question
title, the `question` / `tldr` / `app` / `faq` fields, the structure, at least
one table and one dual (`fig-d` + `fig-m`) figure, 3 to 6 internal links,
inline citations, the not-medical-advice callout and `## Sources`.

### 4. Check your own work

1. **Re-read every factual sentence against its source**, including the ones
   repeated in `tldr`, the FAQ, tables, figure labels and the `social` posts.
   Fix any that the source does not say.
2. Only then set `reviewed:` to today.
3. Check the app claims in `app.hook` / `app.line` against the feature table
   in *The app block*. Nothing the app does not do.
4. Run `cd landing && npm run test:articles` and then `npm run build`. Both
   must pass. Fix and re-run; never publish a failing build.

---

## The question rule

**Every new article is titled as a question.** The title ends with `?` and
says what a person would actually type:

| Not this | This |
| --- | --- |
| Hot Showers and POTS: Heat, Blood Pooling, and How to Shower Safely | Why Do Hot Showers Make POTS Worse? |
| Magnesium for POTS: Forms, Doses and Evidence | Does Magnesium Help POTS? |
| The NASA Lean Test at Home | How Do I Do the NASA Lean Test at Home? |

Lead with the words people search for ("Why do I…", "Does X help…", "Is it
normal…", "How do I…"), then keep the condition in the title. 70 characters or
fewer is ideal (the page adds " | Autonomic"). The check enforces this for
anything dated after 2026-11-04. Older articles keep the titles they rank
with, and carry the question in their `question` field instead.

**So the `question` field is no longer shown on a new article, and that is
correct.** It is still written, always: the blog's typeahead searches it and it
ships as `alternativeHeadline`. But the page only puts it in the bubble above
the title when it is not the title again (`restatesTitle` in
`src/lib/v2/questionBubble.ts`, which compares the two on content words, so
"Does stress make **my** POTS worse?" over "Does Stress Make POTS Worse?" is a
restatement and the bubble is dropped). Do not write it as the title with a
first-person pronoun inserted and do not reach for a looser phrasing to force
the bubble back: on a question-titled article the H1 IS the question, and the
bubble belongs to the older catalogue, whose essay titles it translates
("Coat Hanger Pain: Why Your Neck and Shoulders Ache When You Stand" over
"Why do my neck and shoulders ache when I stand?").

---

## Frontmatter

Copy this, then fill it in. Comments say what each field is for.

```yaml
---
title: "Why Do Hot Showers Make POTS Worse?"   # the question. H1, <title>, share card
slug: hot-showers-pots                          # matches the file name. Never change it once live
published: true
date: 2026-11-05                                # first published
updated: 2026-11-05                             # bump whenever the content changes (shown as "Updated")
reviewed: 2026-11-05                            # the day it was last checked against its sources (shown as "Reviewed")
author: "Austin Spaeth"                         # a key in src/lib/writers.ts

# The question, in the reader's own words. Searched by the blog's typeahead and
# sent to search engines as the alternative headline. First person, under 80
# characters, ends with "?". Shown in a bubble above the title ONLY when it is
# not a restatement of it, which on a question-titled article it usually is.
question: "Why do hot showers make me dizzy with POTS?"

summary: "One or two sentences under the title and on every card."
description: "110 to 160 characters for the search result. Leads with the question's main words."
keywords: "primary keyword, secondary, the question as people phrase it, related terms"

# The direct answer in 2 to 4 sentences. The FIRST sentence is set in bold
# and is the line an AI will quote, so it must answer the question alone.
tldr: "Hot showers make POTS worse because heat widens your blood vessels while you stand still, so blood pools in your legs. Use cooler water, sit down and keep it short."

# How the page sells the app for this article. See "The app block" below.
app:
  feature: insights
  hook: "See what a hot shower does to your numbers."
  line: "Log showers and symptoms as triggers next to your readings, and Autonomic shows what lines up with your dizzier days."

photoLocation: "https://images.unsplash.com/photo-XXXX?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Name / Unsplash"

categories:
  - pots          # FIRST entry is the topic and the URL: /insights/<first>/<slug>/
  - recovery      # any others are extra topics it is listed under

faq:              # 3 to 6, mirrored on the page and sent as FAQ structured data
  - q: "Should I stop taking hot showers if I have POTS?"
    a: "No. A cooler, shorter, seated shower..."

social:           # ready-to-post copy, see "Social" below
  linkedin: |
    ...
  reddit: |
    ...
  x: |
    ...
  facebook: |
    ...
---
```

**Topics** (the first category, and the URL): `pots`, `postviral` (long COVID),
`mecfs`, `dysautonomia`, `hrv`, `food`, `recovery`, `research`, `basics`,
`just-diagnosed`, `supporting-someone`, `app`.

### The app block

`app.feature` picks the ONE feature that continues this article's question.
The page draws that feature's real screen, links its page and tracks clicks by
it, so choose the one a reader would actually reach for next:

| `feature` | What it is | Use it for |
| --- | --- | --- |
| `hrv-readings` | Morning HRV reading and the daily score out of 100, plus the journal (symptoms, meds, sleep, BP, water, food) | HRV, baselines, sleep, symptoms in general, blood pressure |
| `pacing-budget` | A daily energy budget in minutes, learned from what the body handled, with alerts | PEM, crashes, pacing, energy envelope, activity, exercise |
| `insights` | What lines up with better and worse days, and "since you started X" | Does X help, supplements, diet, triggers, weather |
| `pots-stand-test` | A guided home stand test (Apple Watch, chest strap or by hand) | POTS diagnosis, orthostatic, lean tests, dizziness on standing, POTS meds |
| `cycle-tracking` | HRV, heart rate and symptoms read against the cycle | Periods, hormones, PMS, perimenopause |
| `doctor-reports` | AI prompts that turn your data into a doctor summary | Appointments, getting diagnosed, tests, talking to doctors |
| `apple-watch` | The Apple Watch companion | Articles about the Apple Watch itself |

- `hook`: 4 to 9 words tying THIS article to what the reader can do in the
  app. It is the headline of the app card in the middle of the article.
- `line`: one or two sentences, under 200 characters, on how Autonomic helps
  with exactly this problem. It is the body of that card.

The "Your answer" box under the short answer and the rail use the feature's
own copy (`FEATURE_PITCH` in `src/lib/v2/articlePitch.ts`), so one page never
says the same sentence twice.

Only claim what the app really does. The app measures, tracks and shows
patterns; it never diagnoses, treats, or tells anyone to change a medication.
No prices, no "Pro", no "free trial". Leave `app` out and the page falls back
to the topic's feature and that feature's own copy, but a tailored block
converts better.

---

## The body

**Length.** 1,500 to 2,500 words. Long enough to be the best answer, short
enough to finish.

**Structure.**

1. An opening paragraph that names the reader's experience and answers the
   question again in one plain sentence. Primary keyword in the first 100 words.
2. `##` sections, 5 to 8 of them, each one a sub-question a reader has next
   ("Why does heat make it worse?", "What helps?", "When should I worry?").
   They become the numbered table of contents, so keep each under ~60 characters.
3. `### ` subsections only where a section genuinely splits.
4. A `## The bottom line` section that restates the answer in a short paragraph.
5. The not-medical-advice callout (below).
6. `## Sources`, with every study cited in the text (below). Required.

**Voice.** Warm, plain, calm, specific. An informed peer, not a brochure.
Second person. Short paragraphs. No scare tactics: describe, then say what
helps. Non-diagnostic throughout ("talk to your clinician before changing...").

**Banned.** Em dashes (—) anywhere, en dashes in prose, and these words:
delve, navigate, journey, unlock, empower, elevate, game-changer, "in today's",
"it's worth noting", "in conclusion". Exclamation marks in headings.

**Links.** 3 to 6 links to other articles (`/insights/<topic>/<slug>/`),
especially the pillar guides, and at most one or two to app pages
(`/features/...`, `/conditions/...`) where they are the natural next step.

### Citations

Cite studies inline as `([Author et al., 2019](https://doi.org/...))` and list
them all at the end:

```markdown
## Sources

- Grayston R, et al. [A systematic review and meta-analysis of the prevalence of small fiber pathology in fibromyalgia](https://doi.org/10.1016/j.semarthrit.2018.08.003). *Seminars in Arthritis and Rheumatism*, 2019.
```

Every external link in the Sources section is sent to search engines as a
`citation` on the article, so use real, stable URLs (DOI or PubMed). Never
invent a study, a number or a quote.

### Components

mdsvex passes raw HTML through. These are the house pieces; use them, do not
invent new ones.

**Callouts.** One idea each, bold lead-in first.

```html
<div class="callout callout-note"><strong>Overlap is not one cause.</strong> ...</div>
<div class="callout callout-tip"><strong>Try this first.</strong> ...</div>
<div class="callout callout-warn"><strong>Not medical advice.</strong> This article is educational... If your symptoms are new, worsening or frightening, get medical care.</div>
```

`callout-warn` with "Not medical advice." goes at the end of every article.
Do **not** write a sales callout: the page adds the app card itself. One
natural sentence pointing at the app inside the text is fine.

**Every link inside an HTML block is an `<a href>`, never `[text](url)`.**
mdsvex passes raw HTML through without parsing markdown inside it, so a
markdown link in a callout, a `table-wrap` or a `figure` renders as literal
`[text](url)` on the page, brackets and all. On a phone the bare URL is one
unbreakable string and pushes the whole page wider than the screen. The rule
starts at a line opening with `<div` and runs to the next blank line, so it
covers a callout written across several lines; external links take
`target="_blank" rel="noopener"`, internal ones do not. `tests/articles.test.mjs`
fails the build on any markdown link in that span.

**Tables.** Plain markdown tables, at least one per article (normal ranges, a
comparison, a "what to try" list). Keep to 4 columns or fewer so they read on
a phone; wrap a wider one in `<div class="table-wrap">` so it scrolls.

**Figures.** Every article gets one or two inline SVG charts or diagrams.
Draw each twice, a wide one for desktop (`fig-d`, `viewBox="0 0 720 …"`) and a
narrow one for phones (`fig-m`, `viewBox="0 0 360 …"`), inside one figure:

```html
<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 270" role="img" aria-label="What the chart shows, in a sentence">...</svg>
  <svg class="fig-m" viewBox="0 0 360 300" role="img" aria-label="The same sentence">...</svg>
  <figcaption>One sentence on what to take from it.</figcaption>
</figure>
```

Colours: green `#54d98a`, brand red `#e03127`, `var(--line)`, `var(--dim-2)`.
Fonts: `Space Grotesk` for labels, `Space Mono` for small print. Label every
bar or line with its number. Show only real, cited figures, and say when two
studies are side by side for scale rather than combined.

**Calculators** (optional). Define the script as a string in a `<script>`
block and inject it once with `{@html yourScript}`. Inside the string, write
single quotes as `\\x27`, never use backticks or `${`, and use
`addEventListener`. See `rmssd-and-pnn50-vagal-tone-metrics.md`.

### Photos

Hero image from Unsplash (or a local `/articles/<slug>/cover.webp`). Warm,
human, calm; a young woman when a person suits it; never alarming or clinical.
Unsplash URLs are resized per placement automatically, so any width works.
Run `npm run og` after adding an article to build its share card (the build
does this too, softly).

### Social

`social` holds ready-to-post copy. Links carry
`?utm_source=<platform>&utm_medium=social&utm_campaign=<slug>`.

- **linkedin**: 2 to 4 short paragraphs, a specific insight first, the link, 3 to 5 hashtags.
- **reddit**: lines one and two are `Subreddit: r/...` and `Title: ...`. Sounds
  like a patient sharing what helped, no hashtags, no marketing.
- **x**: one post, 280 characters total including the link.
- **facebook**: warm, 1 to 2 paragraphs, a gentle question, 2 to 4 hashtags.

---

## What the page adds for you

Do not repeat these in the markdown:

- The **question bubble** above the title (from `question`), when it says
  something the title does not. See *The question rule*.
- **The short answer** box (from `tldr`), first sentence in bold.
- **Your answer**: the feature's headline, a download button and a link to the feature.
- The **app card** in the middle of the article, moved there by script: the
  article's `app.hook` and `app.line` beside the feature's real app screen,
  with the store badges and the rating.
- The **table of contents** (from the `##` headings) and the rail's download card.
- The **FAQ** ("Questions people also ask about this"), the author box, the
  topic's video band and "Questions people also ask" (related articles).
- **Structured data**: Article with the question, short answer, word count,
  reading time, condition, sources and author; FAQ; breadcrumbs; the app.
- **Share card** (`npm run og`), reading time, dates, canonical URL.

---

## Before you publish

- [ ] Title is a question; `question`, `tldr`, `app` and `faq` are filled in
- [ ] First `tldr` sentence answers the question on its own
- [ ] Description 110 to 160 characters
- [ ] At least one table and one figure (both `fig-d` and `fig-m`)
- [ ] Every claim about a study is cited and listed under `## Sources`
- [ ] Not-medical-advice callout at the end; no sales callout
- [ ] No em dashes; 3 to 6 internal links
- [ ] Links inside callouts and other HTML blocks are `<a href>`, not `[text](url)`
- [ ] `reviewed` is today's date (you checked every claim against its source)
- [ ] `npm run build` passes

## Reviewing an older article

Re-read it against its sources, fix anything the research no longer supports,
add or repair the `## Sources` section, then set `reviewed` (and `updated` if
the text changed) to today. Never bump a date on an article nobody checked:
the date is a claim to the reader.
