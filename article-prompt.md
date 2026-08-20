# Daily Article Routine — Autonomic

You are running unattended inside a 5am automation. Your job: publish one excellent new article to the Autonomic (autonomic.care) landing site by pushing to `main`. Work end to end and autonomously. A push publishes immediately, so be careful. This is health content, so accuracy matters.

You are already in the repo root (`/Users/austinspaeth/autonomic`).

---

## Step 0 — Sync main first (before writing anything)

1. `git status`. If a prior run left uncommitted changes to TRACKED files, reset just those with `git checkout -- .`. Do NOT run `git clean` and do NOT delete untracked files. This `article-prompt.md` is an untracked file that must survive for future runs, so leave it and anything else you did not create in place.
2. `git checkout main`
3. `git fetch origin`
4. `git pull --no-rebase origin main`
5. On conflicts: take `origin/main` for code/config, resolve, `git add`. If you cannot reach a clean, current `main`, STOP and do not push.

## Step 1 — What Autonomic is (context for a natural product tie-in)

Autonomic (full name "Autonomic Journal") is a private, offline-first, native iOS/Android app for tracking autonomic-nervous-system recovery. Users log daily readings (HRV, blood pressure, resting heart rate, sleep, symptoms, triggers) plus live 5-minute HRV capture, and the app scores each reading against medical thresholds AND the user's own rolling baseline to show whether their nervous system is recovering. Fully private: no account, no cloud, all data on-device, export/import as JSON. Brings your own devices (chest strap, ring, cuff, stand tests) into one scored timeline; also has breathing/coherence, Apple Watch HR monitor, and AI-generated doctor/insight reports.

Audience: people recovering from or managing POTS, dysautonomia, long COVID / post-viral illness, and related conditions who want to track HRV and orthostatic metrics at home, read the trend without spiraling, and bring reports to clinicians.

Public site: `https://autonomic.care`

**Important accuracy rules:**
- Autonomic is medical-adjacent, NOT a medical device. It does not diagnose or treat. Every article must keep a non-diagnostic framing and note that readers should discuss changes with a clinician.
- Do not overclaim what the app does. Claims about the app/watch must match reality: it scores readings into grade zones (great/good/ok/bad/crash, plus a cautionary warning band) against thresholds and a rolling baseline; it is offline with no backend.
- No fabricated statistics, studies, or reviews. Cite real, well-established physiology (RMSSD, SDNN, HF/LF power, orthostatic thresholds) accurately.

**Product tie-in rule:** Lead with genuinely useful, standalone education. Mention Autonomic only where it is the natural next step, near the end, as a single `callout-tip` box or one linked sentence, framed as the thing that operationalizes the article's concept (scoring against thresholds and your rolling baseline, private/offline, bring-your-own-device). Never a repeated pitch.

## Step 2 — Choose a fresh, high-value topic

Read 2 or 3 existing articles first (e.g. `landing/articles/hrv-complete-guide.md`, `landing/articles/rmssd-and-pnn50-vagal-tone-metrics.md`) to match style, the `<figure class="prose-figure">` SVG pattern, callouts, and the reassuring voice.

`ls landing/articles/`. Do not duplicate existing slugs (HRV guide, ANS/dysautonomia guide, POTS/long-COVID/MCAS overlap, post-viral recovery, scoring explainer, RMSSD/pNN50, frequency-domain HRV, POTS diagnosis, Levine protocol, POTS treatment, low-histamine diet, POTS diet, resonant breathing, PEM, is-it-long-covid-or-pots, and the app pillars).

Target SEO keywords (one primary per article): HRV / heart rate variability, RMSSD, SDNN, HF/LF power, vagal tone, parasympathetic, POTS, dysautonomia, orthostatic intolerance / stand test, long COVID, post-viral recovery, MCAS / low-histamine, blood pressure (systolic/diastolic/MAP), resting heart rate, HRV normal range, how to improve HRV, best wearable/chest strap for POTS, POTS diet, pacing / post-exertional malaise, resonant breathing / HRV biofeedback. Pick a specific, searchable, evergreen angle a patient would Google or ask an AI assistant.

## Step 3 — Write the article

Create `landing/articles/<slug>.md`. Slug: short, keyword-rich, hyphenated.

### Frontmatter (match existing articles)

```yaml
---
title: "Primary keyword led, clear and reassuring"
slug: your-slug
published: true
summary: "One or two sentences for the index."
description: "150-160 char meta description with the primary keyword."
keywords: "comma, separated, primary and secondary keywords, question phrasings"
date: YYYY-MM-DD     # today
updated: YYYY-MM-DD  # today
author: "Austin Spaeth"
photoLocation: https://images.unsplash.com/photo-XXXX?q=80&w=1760&auto=format&fit=crop
photoAttribution: "Name / Unsplash"
tldr: "Direct, calm 1-2 sentence answer for readers and AI answer engines."
categories:
  - hrv     # FIRST entry is the URL topic. MUST be one of:
            # hrv | food | pots | postviral | recovery | app | research | basics
  - secondary-tag
faq:
  - q: "..."
    a: "..."
social:
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

Canonical URL: `https://autonomic.care/insights/<first-category>/<slug>/`. The FIRST `categories` entry MUST be one of: `hrv`, `food`, `pots`, `postviral`, `recovery`, `app`, `research`, `basics`.

### Choosing photos (Unsplash)

All images come from Unsplash. Choose photos that genuinely look good and clearly fit what the article is about (calm wellness, recovery, home health, movement, everyday life with chronic illness). An abstract or conceptual shot is fine when it still connects to the topic, but keep the overall feel warm and human, not cold, clinical, or obviously generic stock. When a person suits the image, favor young women; otherwise favor calm, professional or reassuring settings. Never alarming or distressing imagery. Apply this to the hero `photoLocation` and any inline photos. Use your best judgment so the picture feels intentional and supportive, never like filler. Use a stable Unsplash photo URL you are confident resolves.

### The `social:` block (REQUIRED)

Ready-to-post copy per platform. Build every link with per-platform UTM parameters:
`https://autonomic.care/insights/<first-category>/<slug>/?utm_source=<platform>&utm_medium=social&utm_campaign=<slug>`

- **linkedin**: 2 to 4 short paragraphs, credible and warm, useful to patients and clinicians. Lead with a specific, accurate insight. Value that stands alone, then the link, then 3 to 5 hashtags (e.g. `#POTS #Dysautonomia #LongCovid #HRV #ChronicIllness`).
- **reddit**: Like a knowledgeable, empathetic patient sharing what helped, NOT marketing. NO hashtags. Give the real takeaway, then reference the writeup. First two lines: `Subreddit: r/...` and `Title: ...`. Communities: r/POTS, r/dysautonomia, r/covidlonghaulers, r/cfs (match to topic). Be especially careful to sound human and supportive, and keep the non-diagnostic tone.
- **x**: ONE post, hard limit 280 characters TOTAL including link and hashtags (free tier). Hook + 1 to 2 hashtags + link. Count characters.
- **facebook**: Warm and plain, for patient support groups. 1 to 2 short paragraphs, a gentle question, the link, 2 to 4 hashtags.

Tailor each to its community. Never be alarmist; keep the anti-anxiety, supportive tone.

### Body

- Match the house voice: warm, credible, plain-spoken, anti-anxiety, evidence-based but explicitly non-diagnostic ("educational field notes, not medical advice"), practical over hype.
- Length: roughly 1,500 to 2,500 words, scannable H2/H3 sections.
- **SEO + AI discoverability:** primary keyword in title, H1, first 100 words, and naturally throughout. Question-style H2s. A short TL;DR near the top. An FAQ section, mirrored in the `faq` frontmatter so the page emits FAQ schema. At least one comparison table or reference table (e.g. normal ranges). Cross-link 2 to 4 existing `/insights/<topic>/<slug>/` articles, especially the pillars.
- **Rich media and interactive content:** mdsvex passes raw HTML through and the site prerenders with CSR off. Include the hero photo, plus at least one or two inline SVG figures authored directly in the markdown using the house pattern:

  ```
  <figure class="prose-figure">
    <svg viewBox="0 0 720 220" role="img" aria-label="DESCRIPTIVE LABEL">
      ...
    </svg>
    <figcaption>Short caption.</figcaption>
  </figure>
  ```

  Use theme colors (green `#54d98a`, brand red `#e03127`, and CSS vars `var(--line)`, `var(--dim-2)`) and fonts `Space Grotesk`, `Space Mono`, `Manrope`. Always include `role="img"` and a descriptive `aria-label`. Good options: HRV waveform comparison, a grade-zone scale, an orthostatic BP/HR timeline, a baseline-vs-reading chart. For a small in-article calculator (optional), use the existing `{@html scriptVar}` injection pattern seen in `rmssd-and-pnn50-vagal-tone-metrics.md`: define the script string in a `<script>` block and inject once with `{@html yourScript}`. Inside the template literal, write single quotes as `\\x27`, em dashes as `\\u2014`, and prefer `addEventListener`. Use `<div class="callout callout-note|callout-tip|callout-warn">` for tips, warnings, and the product CTA.
- **Product tie-in:** one natural mention near the end, ideally a `callout-tip` box with one bolded action linking to `/`, framed as operationalizing the article (private, offline, scores against thresholds and your rolling baseline, brings your devices into one timeline). Keep the non-diagnostic disclaimer present.

### Writing quality (strict)

- **Never use em dashes (—).** Use commas, colons, or parentheses. Hard rule. Inside inline SVG/JS strings use `\\u2014`.
- No AI tells. Avoid "in today's fast-paced world," "delve," "it's worth noting," "navigating," "in conclusion," "unlock," "elevate," "game-changer," "journey" as filler, "empower." Vary sentence length. Be concrete and calm. Sound like an informed peer, not a brochure.
- Medically responsible: general education, not diagnosis; note individual variation and "discuss changes with your clinician." No scare tactics.

## Step 4 — Validate

```
cd landing && npm run build
```

Fix until the build passes (a broken `{@html}` template will fail here). Do not push a broken build.

## Step 5 — Commit and publish

```
git add -A
git commit -m "Add article: <title>"
git pull --no-rebase origin main
git push origin main
```

`article-prompt.md` is listed in `.git/info/exclude`, so `git add -A` will not stage it. Resolve any final-pull conflict (keep your article, take main for the rest), rebuild, push. Confirm success. Done.
