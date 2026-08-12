# /master — app analytics dashboard

The store-performance dashboard, living in `landing/master/` and served at
**https://autonomic.care/master/** behind a passwordless sign-in. It started life
as a standalone folder that ran from `file://` and kept everything in
`localStorage`; it now stores its data in DynamoDB and gates access through
Cognito.

What the views mean, how the trial/wall cohorts are derived and the CSV import
format are documented in the dashboard's own README in the source repo
(`autonomic-dashboard`). This file covers what changed when it moved here.

## How it is served

`/master/` is a **prerendered SvelteKit route**. The dashboard itself is still
framework-free — plain HTML, one stylesheet and seven scripts, edited in
`landing/master/` — and `src/routes/master/+page.svelte` is a shell that
`?raw`-imports all of it and inlines it into a single self-contained document.
Nothing is bundled, minified or scoped, so what runs in the browser is
byte-for-byte what is in this folder.

Two things follow from that, and both are load-bearing:

- **The page has no assets to resolve.** No sibling stylesheet, no
  `<script src>`, no logo file — the brand mark is an inline `<symbol>`. It
  used to ship as `static/master/index.html` with *relative* asset URLs, which
  meant a request for `/master` without the trailing slash resolved every one
  of them against `/`: the page arrived unstyled, with the gate inert and the
  dashboard on display behind it. A self-contained document cannot fail that
  way however the URL is reached.
- **`csr = false` is why the inlining works at all.** The site ships no
  framework runtime, so `{@html}` output is parsed by the browser out of
  server-rendered HTML and its `<script>` tags execute normally. Turn CSR on
  for this route and Svelte would hydrate that markup instead — `innerHTML`
  never runs a script — and the dashboard would render with nothing driving it.
  `src/routes/master/+page.ts` restates `csr = false` for that reason.

The dashboard shares none of the marketing site's chrome: `app.css`, the nav
and the footer live in the `(site)` route group, and the root layout is empty
so that a page outside that group inherits nothing. A stylesheet imported by
the root layout would be linked into every page in the graph regardless of any
runtime condition, and `app.css` and `styles.css` both style `body`, `.btn`
and `.card`.

There is still no build step for the dashboard's own code. `npm run build` in
`landing/` assembles the page; that is all.

## Sign-in

Passwordless, the same flow DiscoveryMark uses and against **the same Cognito
user pool** (`us-west-2_0YCieUoYt`): enter your email, Cognito's
`CreateAuthChallenge` trigger emails a four-digit code, answering it issues
JWTs. `auth.js` speaks the Cognito IDP REST API directly rather than pulling in
Amplify — a ~2MB dependency for three API calls, in an app that otherwise has
none.

Two consequences of sharing DiscoveryMark's pool are worth knowing:

- **The sign-in email is DiscoveryMark-branded**, because the trigger belongs to
  DiscoveryMark's serverless stack. It contains a magic link that points at
  discoverymark.com and will *not* sign you in here — the code is the only way
  in, and the sign-in screen says so.
- **A valid token from that pool proves nothing about authorization.** Every
  DiscoveryMark customer holds one. Access control is the `ALLOWED_EMAILS`
  allowlist enforced in the Lambda (`sls/lambdas/api/main.js`); the client-side
  gate is only there so the page doesn't render a useless shell. Never remove
  the server-side check.

## Storage

DynamoDB is the store of record. `localStorage` is kept as a cache so the page
paints instantly and keeps working offline, but nothing renders from it before
the pull lands — otherwise a second device would flash the first one's numbers.

`sync.js` diffs the whole store against the last state the server confirmed and
pushes the difference, debounced. `app.js` calls `save()` from about thirty
places without saying what changed, so diffing is both cheaper to maintain than
instrumenting each call site and impossible to leave stale. A push that fails
does not advance the baseline, so the retry re-sends the same work.

Boot order lives in `boot.js`: sign in → `LOAD` → hydrate → render.

There is no sync-status pill. "Saved" was on screen essentially always, which
made it furniture rather than information, so **silence is the success state**
and only `error` and `offline` speak — once per transition, as a toast, rather
than on every tick of a retry loop. The header's refresh button re-runs the same
path (flush any pending push, pull, hydrate keeping the current view, then
re-fetch the ping counter on the two views that read it). A refetch **holds what
is already on screen** and swaps it when the new data lands; the ping view used
to repaint into its loading state and tear every chart down first.

## Files

Everything below is in `landing/master/`, except the route that assembles them.

| File | Role |
|---|---|
| `src/routes/master/+page.svelte` | The shell: inlines the files below into one prerendered document |
| `src/routes/master/+page.ts` | `prerender = true`, `csr = false` |
| `body.html` | Markup, the sign-in gate, view shells. Plain HTML, no `<html>`/`<head>`/`<script>` |
| `config.js` | Pool / client / endpoint constants (all public) |
| `auth.js` | Cognito `CUSTOM_AUTH` over REST + the gate's behaviour |
| `api.js` | The single authenticated POST to `api.autonomic.care` |
| `sync.js` | Diff-and-push mirror of the store into DynamoDB |
| `boot.js` | Boot order and sync-status/sign-out wiring |
| `app.js` | Store, cohort derivation, all views, import/export |
| `analytics.js` | Pure cohort/retention arithmetic behind the App usage view |
| `costs.js` | Pure money arithmetic behind the Costs view |
| `releases.js` | Generated release log, read as timeline annotations |
| `charts.js` | Dependency-free SVG chart engine |
| `styles.css` | Dark theme tokens, layout, gate |

## The App usage view

Every other view is fed by store CSVs you paste in. This one is fed by the app
itself, through the `PINGS` action (`sls/lambdas/ping/`): each install asks a
counter to add one, at most once per Eastern day (the day boundary the counter
buckets on), carrying nothing but the day that install first ran and one letter
for its platform. The data is fetched once per session, cached on `pings`, and
is **read-only** — it lives outside `db`, so `sync.js` never sees it and there
is nothing here to edit.

One rule governs all the arithmetic, and every metric in the view is shaped by
it: **counts can be compared across days but never summed into one.** With no
identifier there is no way to tell one install from another, so adding up seven
daily numbers counts the same person seven times. Consequences you will see in
the UI, each of them deliberate:

- The grain filter is hidden. There is no weekly or monthly active count, only
  daily ones, and pretending otherwise would be the easiest lie to tell here.
- "Active in the last 7 days" takes each cohort's **busiest single day**, never
  a sum, and is labelled as a floor rather than a figure.
- Cohort size is exact, because a cohort's day 0 count is one day. Retention is
  therefore exact too: day N's count over day 0's.
- The filter bar's platform selector applies here: `A.index(report, platform)`
  slices the whole matrix to one store, so retention and conversion can be read
  per platform rather than only in aggregate. `compare` has no meaning for a
  retention matrix (it is one population, not two side by side) and reads as
  "all"; the **Platform on <day>** tile carries the split instead, and is always
  unfiltered, since it is what the rest of the view is a slice of. Pings from
  builds that predate the marker show as `pre-marker`, never folded into either
  store.
- Cohorts born before the counter shipped have no day 0, so they are counted as
  active but carry no percentage. The view says how many days that affects
  rather than quietly averaging them in.

Joining the two sources is where it gets useful: **activation** is first runs
against that day's store downloads (how many people who downloaded ever opened
the app), and the purchases chart puts subscribe pings beside store sales as a
cross-check. They count different moments — the app only notices a subscription
on its next launch — so they should track, not match.

## The Costs view

What the app costs to run, against what it earns. It replaced the metric
explorer, which asked a question — "chart any two of these together" — that
every other view already answered better for its own subject.

Two collections, synced alongside entries and events:

- **`ads`** — a campaign: a name, a channel from a fixed list, the store it
  targets and the days it ran. Its start and end appear as flags on every
  calendar chart in the dashboard, derived the same way releases are, so nobody
  hand-enters a second copy that can drift.
- **`costs`** — a dated amount with a category, optionally attributed to a
  campaign. Ad spend is nothing special: it is a cost row per campaign per day
  with category `ADS`, which is why the daily grid and the spread-a-total box
  can both write it and either can correct the other.

The arithmetic is pure and lives in `costs.js` (`tests/costs.test.mjs`). Four
rules run through it, and they are the reason to read that file before changing
a number here.

**A cost lands on the day it is charged.** A recurring row is expanded into its
occurrence dates, not smeared across the days between them: a yearly developer
fee is a real 99 on one day. Monthly recurrences clamp short months from the
original day, so a bill first paid on the 31st recurs on Feb 28 and then on
Mar 31 rather than sliding to the 28th forever.

**Revenue is netted before profit is claimed.** Entries record the
customer-facing price; the store keeps 15% or 30% of it. `settings.storeCutPct`
(Edit data → Store commission) is applied everywhere profit appears, and the
gross figure is always shown beside the net one so the cut is visible rather
than silently applied.

**Blended and reported acquisition costs are never mixed.** Blended is marketing
spend ÷ every store download, which charges organic installs to marketing and is
therefore the honest ceiling. Reported is spend ÷ the installs the ad network
claims, and the network is marking its own homework. The tiles and the
cost-per-acquisition chart are blended and say so; the campaign and channel
tables are reported and say so.

**Deleting a campaign keeps its money.** The spend happened either way, so its
rows are detached and reported as unattributed advertising. Totals do not move.

**Reading and entering are separate tabs.** The Costs tab is the analysis —
tiles, charts, and the by-category / by-channel / by-campaign tables, all scoped
to the filter bar and all read-only. Everything you type lives under **Edit
data**, which is broken into four sections: Store data, Spending (campaigns, the
daily ad-spend grid, the spread box and the cost ledger), Settings and Backup &
account. The management tables there are all-time rather than range-scoped,
because that view has no filter bar and "what has this campaign cost" is a
lifetime question when you are deciding whether to keep running it.

The platform filter is hidden on the Costs view. A hosting bill is not iOS or
Android, and no ad network splits spend the way the stores split downloads.

Two numbers leak into other views deliberately: the Overview tile strip gains
net profit and cost per install once there is any spend to report, and the
Timeline gains a Spend metric — entered by hand, so unlike every store metric
there it is complete for today.

## Backend

`sls/` at the repo root — one DynamoDB table and two Lambdas behind an HTTP API,
the dashboard's own behind a Cognito JWT authorizer and the app's ping counter
public. It deploys from the same CodePipeline as the landing site on push to
`main`.

## Running locally

```bash
cd landing
npm run dev            # http://localhost:5173/master/
```

`http://localhost:5173` and `http://localhost:8080` are in the API's CORS
allowlist, so sign-in and sync work against production data. There is no
separate dev stage. To exercise exactly what ships instead:

```bash
npm run build && (cd build && python3 -m http.server 8080)
```

## Testing

```bash
npm run test:master
```

Builds the site, then drives `build/master/index.html` in jsdom through the
whole path: the sign-in challenge (wrong code, then right), token persistence,
the boot `LOAD`, hydrate, and the first diffed `SYNC` push. It runs against the
**built** page rather than the sources, because the route that assembles them
is now part of what can break — the test asserts that the stylesheet and every
script are inlined and that the document references nothing relative. It also
fails the build if `app.js` declares the same top-level function name twice:
the file is one long IIFE of hoisted declarations, so a duplicate is not an
error — the later one silently wins and the earlier caller renders nothing,
which is exactly how the Overview's weekday chart once went blank.

A second file, `tests/master-ping.test.mjs`, renders the App usage view against
a three-cohort fixture built relative to today, and checks the numbers on screen
against ones worked out by hand in its header: retention at day 1 and day 7,
activation against store downloads, the unlived cells of the grid staying blank
rather than reading 0%, and the tiles refusing to answer where the data is too
young. If you change how a metric is derived, that fixture is where you find out
whether you meant to.

`tests/costs.test.mjs` pins the money arithmetic against a hand-worked fixture,
and `tests/master-costs.test.mjs` drives the Costs view itself in the built
page — adding a campaign, filling the spend grid, spreading a total, deleting
the campaign and watching its money survive, and the header's refresh doing a
round trip rather than a reload. Its fetch stub is a small in-memory server that
applies the pushes it receives, because against a stub that always answers
"nothing stored" a passing refresh test would only prove the data had been
thrown away.
