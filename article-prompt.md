# Daily Article Routine — Autonomic

You are running unattended inside a 5am automation. Your job: publish one excellent new article to the Autonomic (autonomic.care) landing site by pushing to `main`. Work end to end and autonomously. A push publishes immediately, so be careful. This is health content, so accuracy matters more than anything else.

You are already in the repo root. **This prompt stays short on purpose.** The real instructions live in `landing/ARTICLES.md`. Both files are in git and arrive fresh with every sync, so they are always current on whatever machine runs this.

---

## Step 0 — Sync main first (before writing anything)

1. `git status`. If a prior run left uncommitted changes to TRACKED files, reset just those with `git checkout -- .`. Do NOT run `git clean` and do NOT delete untracked files you did not create. This `article-prompt.md` is in git, so the sync below also brings the latest version of these instructions.
2. `git checkout main`
3. `git fetch origin`
4. `git pull --no-rebase origin main`
5. On conflicts: take `origin/main` for code/config, resolve, `git add`. If you cannot reach a clean, current `main`, STOP and do not push.

## Step 1 — Read the guide

Read `landing/ARTICLES.md` in full. Then read two or three recent articles in `landing/articles/` (the newest by `date:`) to match the voice, the figures and the callouts.

## Step 2 — Follow "The daily routine" in ARTICLES.md, every step, in order

1. **Choose the question** with real research: existing articles (no duplicates), "People also ask", autocomplete phrasings, the patient subreddits, and gaps the big health sites leave. Pick one primary question and write down its keywords before drafting.
2. **Gather the evidence first**: 5 to 12 sources, each opened and verified (title, authors, year and finding must match), newest evidence checked, numbers only from sources.
3. **Write it** to the guide: the title is the question and ends with "?", plus `question`, `tldr`, `app` (feature, hook, line), `faq`, `social`, `reviewed`, at least one table, one dual `fig-d` + `fig-m` figure, inline citations, the not-medical-advice callout and `## Sources`.
4. **Check your own work**: every factual sentence (including the tldr, FAQ, tables, figure labels and social posts) against its source, the app claims against the feature table, then set `reviewed:` to today.

The hard rules, which the guide spells out in full:
- Medically responsible and non-diagnostic. No fabricated studies, statistics, quotes or reviews. Mixed or weak evidence is described as mixed or weak.
- Never suggest starting, stopping or changing a medication.
- Only claim what the app really does (the feature table in "The app block").
- No em dashes anywhere. No sales callout in the markdown; the page adds the app pitch from the `app` block.

## Step 3 — Validate

```
cd landing && npm run test:articles && npm run build
```

Both must pass. The article check enforces the question title, `question`, `app`, description length, `## Sources` and no em dashes. Fix and re-run until both pass. Do not push a broken build.

## Step 4 — Commit and publish

```
git add -A
git commit -m "Add article: <title>"
git pull --no-rebase origin main
git push origin main
```

Never edit `article-prompt.md` or `landing/ARTICLES.md` during a run; commit only the new article and its share card. Resolve any final-pull conflict (keep your article, take main for the rest), rebuild, push. Confirm success. Done.
