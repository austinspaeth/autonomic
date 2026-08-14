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
framework-free — plain HTML, one stylesheet and a dozen scripts, edited in
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
| `sales.js` | Pure subscription arithmetic behind the Sales view |
| `costs.js` | Pure money arithmetic behind the Costs view |
| `releases.js` | Generated release log, read as timeline annotations |
| `charts.js` | Dependency-free SVG chart engine |
| `alerts.js` | Live alerts: what changed since the last refresh, said out loud |
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
  "all"; the **Platform on <day>** tile and the **iOS vs Android, day by day**
  card carry the split instead, and both are always unfiltered, since they are
  what the rest of the view is a slice of.
- **A subscribe ping carries the buyer's store in the same cohort key an open
  ping does**, so "which store paid" needs no second source: `subPlatformsOn` /
  `purchasePlatformsOver` read it back, and both **Purchases on <day>** (the
  newest day alone, beside *Active on <day>*) and **Purchases in range** show
  the iOS / Android split under their number. Those splits follow the same rule
  as the platform tile — always unfiltered, `no store` broken out and disclosed
  in the meta line rather than folded into either store.
- **A ping that names no store is an install whose store we failed to record,
  not an install on a third platform.** Builds that shipped before the platform
  marker existed send a bare `082126`, which reads back as `U`. Excluding those
  from both slices put them in *no* view at all, which is exactly how a
  dashboard whose history predates the marker came to read as "no pings" the
  moment a platform filter was switched on. They are counted into **both**
  platform views, totalled separately as `unattributed`, and drawn as their own
  band rather than folded into either store. The deliberate consequence — with
  a filter on, iOS + Android exceeds the day's total by that count — is
  disclosed wherever it shows and asserted in `tests/analytics.test.mjs`.
- The **weekday pattern** chart carries five bars: store downloads, first runs,
  returning activity, purchases from the sales ledger, and subscribe pings. The
  last two count the same event at different moments (the app only notices a
  subscription on its next launch), so they should track rather than match — and
  charting only one of them is how a weekday pattern in the *lag* gets read as a
  weekday pattern in buying.
- Cohorts born before the counter shipped have no day 0, so they are counted as
  active but carry no percentage. The view says how many days that affects
  rather than quietly averaging them in.

Joining the two sources is where it gets useful: **activation** is first runs
against that day's store downloads (how many people who downloaded ever opened
the app), and the purchases chart puts subscribe pings beside store sales as a
cross-check. They count different moments — the app only notices a subscription
on its next launch — so they should track, not match.

## Auto-refresh and live alerts

The page refetches itself **every 10 minutes while it is visible**, and
announces what changed. `alerts.js` is the announcement; the timer is
`initAutoRefresh()` in `app.js`, which reuses the header refresh's own path with
`{ silent: true }` — the "Refreshed." toast is suppressed, and nothing else is.

Three conditions gate the timer, all load-bearing:

- **Visible only.** `document.hidden` is read on every tick rather than trusted
  to `setInterval` throttling, so a backgrounded tab does not burn a
  pull-and-hydrate for a screen nobody is looking at, and does not fire its
  celebration into an empty room. `visibilitychange` checks immediately, so a
  laptop reopened after an hour is current in a frame rather than up to ten
  minutes stale.
- **App usage and Timeline only.** The ping counter is the only source on this
  page that changes on its own, and `refreshView` only refetches it on those two
  views. Anywhere else an auto-refresh would re-pull store CSVs it already holds
  and have nothing to say.
- **Signed in only.** A pull behind the gate would 401 at somebody who has not
  typed their code yet.

The clock is a timestamp compared on a 30-second tick, not a ten-minute
interval: an interval cannot be paused for the hours a tab spent in the
background, so it would fire the moment it returned and then again on its old
cadence. Any refresh, including one you pressed, resets it.

### What gets announced

Everything is fed by the **ping counter**, deliberately and only. Store
downloads and the sales ledger are hand-imported, so a burst of "new sales" from
a CSV paste would be an alert about your own typing.

| Event | Definition | Reaction |
|---|---|---|
| Visitors | a rise in open pings | two-note blip, no card |
| Downloads | a rise in **first runs** — an open ping whose cohort key IS the day it arrived on | three-note rising chime, confetti falling from the top, a card naming the store(s) |
| Sales | a rise in subscribe pings | brass fanfare, confetti from the top AND the bottom, a card naming the store(s) that paid |

The three cues are meant to be told apart across a room with your back to the
screen, so they differ in SHAPE and not only in pitch — two notes, three notes,
a fanfare with a held chord — and climb in weight in the order the events
matter. The visitor blip fires most often and is the one most easily made
useless: the first version was a single sine at 0.055 gain, a sound you have to
already know is coming to hear at all.

**More than one arrival runs the confetti in WAVES**, one per item 320ms apart
and capped at eight, so four downloads is a few seconds of falling rather than
the same one-second puff four times over — which is not distinguishable from
one. The cap is what stops a backfill of fifty pings burying the dashboard for
half a minute. Downloads landing in the same refresh as a sale extend the sale's
waves rather than starting a competing pattern.

`snapshot` / `diff` are pure and are what `tests/alerts.test.mjs` pins;
`tests/master-alerts.test.mjs` covers the cards on the built page. The rules:

- **A download is a first run, not an open.** That is the closest thing to a
  live download this dashboard has — the store's own number arrives a day late
  in a CSV, and the two are never added together.
- **The platform comes off the ping's own cohort key**, so a card can say which
  store without a second source. A ping from a build predating the platform
  marker reads as "unknown store" rather than being folded into either one — the
  same rule the App usage view runs on.
- **A delta is never negative.** The report is a sliding 400-day window, so the
  oldest day leaves it as the calendar turns and a total can fall with nothing
  having gone wrong. A drop is not an event: it clamps to zero and the new
  snapshot becomes the baseline anyway.
- **The first report of a session is a baseline, not news**, or every sign-in
  would open with a fanfare for a month of history.
- **One sound per refresh**, the loudest thing that happened. Cards do stack,
  because they are read rather than heard.
- **Cards do not expire.** The toast disappears on a timer; the whole point of
  this stack is to still be there when you come back to the laptop, so the only
  thing that removes a card is a press — the card itself, or "Clear all" above
  the stack once there are two. What that costs is bounded rather than
  unbounded: the stack scrolls past the viewport, and past `MAX_CARDS` (40) the
  oldest is dropped, since a dashboard left open over a weekend should not hold
  nine hundred DOM nodes to say the same thing.

The sounds are **synthesized**, not sampled: this page is inlined into one
self-contained document with nothing to resolve at runtime, so an `<audio src>`
is out and a base64 fanfare would be a hundred kilobytes of the page. A handful
of oscillators costs nothing and can be retuned in a diff you can read. A
browser will not let a page make noise before it has been touched, so the audio
context is built on the first gesture of the session — signing in is one.

The bell in the header mutes the sound and remembers it in `localStorage`, not
in the synced store: a mute is a property of the room you are sitting in, not of
the account. **Muted means silent, not blind** — the cards still appear, because
they are the record of what happened. Confetti is skipped entirely under
`prefers-reduced-motion`.

## The Sales view

Every purchase, one row each. Sales used to be two numeric columns on a store
entry — `sales` (a count) and `revenue` (an amount) summed per day per platform
— and that shape cannot answer either of the questions this view exists for,
because both are properties of a purchase rather than of a day: **what plan was
bought**, since an annual subscription and a monthly one at the same monthly
rate are wildly different cash, and **when did the buyer install**, since "how
long do people take to decide?" is about a person and a daily total has averaged
the people away.

So `sales` is now its own collection, synced beside entries, events, ads and
costs, and the arithmetic is pure and lives in `sales.js`
(`tests/sales.test.mjs`). A row is `{ id, date, platform, plan, price, qty,
cohort?, cancelled?, refunded?, note? }`. Four rules run through it.

**Cash and recurring revenue are never the same number.** An annual plan at
29.99 is 29.99 of *bookings* on the day it is bought and 2.49 of *MRR* every
month for a year. The view always shows both and never a blend, because a month
with one annual sale is a record on one and an ordinary month on the other, and
a single figure called "revenue" that silently picked one is the thing this view
was built to stop. `recognised` is the third: the slice of every purchase that
belongs to a given month, which is what the bookings chart draws against.

**A plan whose term we do not know is not counted in MRR.** Rows migrated from
the old daily columns carry `plan: 'unknown'` — real money of an unknown term.
They count in bookings, in conversion and in every per-install rate; they are
excluded from MRR and disclosed wherever that matters, because spreading them
over an assumed term would invent the one fact that is missing. Lifetime
purchases are the same shape for a different reason: real cash, zero MRR.
`active` therefore counts recurring plans only — "13 active subscriptions" beside
an MRR of zero means nothing.

**A subscription is assumed to still run until it is marked cancelled.** The
stores tell this dashboard nothing about churn, so there is nothing to derive it
from, and assuming a monthly plan lapses after 30 days would make MRR decay on
its own and read as churn nobody observed. `cancelled` is a date you type;
`refunded` removes a row from money entirely and from the unit counts, so an
average price is never a real total divided by a sale that returned nothing.
Churn is booked against the **cancellation's** window and not the purchase's —
almost everything that churns was bought before the window it churns in.

**Cohort-day statistics only count purchases carrying an install date.**
`cohortDay` is purchase date minus install date, exact and per buyer. A row
without one is not a zero and not an average: it is left out of the
days-to-purchase histogram and counted in `withoutCohort`, and the view reports
what share of purchases it is actually drawn from. A `qty > 1` row — which is
what a migrated daily total is — can never carry one, since four buyers do not
share an install date.

The **migration** out of the old columns runs once, guarded by
`settings.salesMigrated`. Each (date, platform) with a count or an amount becomes
one `unknown` row holding the count as `qty` and the average price, and the
columns are stripped off the entries so the same money cannot be counted twice.
It runs in `init()` and in `refreshView()`, both of which are **after**
`Sync.adopt` — a migration run inside `hydrate()` would be adopted as though the
server had sent it, and neither the rewritten entries nor the new ledger rows
would ever leave the browser.

`base()` folds the ledger back into the same `sales` / `revenue` fields the
entries used to carry, so Overview, Costs, Trial & conversion and the weekday
chart read one source of truth without knowing the shape underneath them
changed.

Entry lives under **Edit data → Sales**: a purchase form, a paste box that
reports the lines it could not read rather than dropping them, and the full
ledger with edit and delete. The paste box reads a **header row** when one is
there and falls back to the documented column order when it is not, which is
what lets the ledger's own **Export CSV** come back in unchanged: that file
carries `qty` and `refunded`, and read positionally its columns land one apart —
a count taken for an install date, a refund taken for a note.

Two things had to follow the money out of the daily columns, and both were
silent failures rather than loud ones, since a `sales` column still parses and
still syncs:

- **The demo data.** It wrote `sales` / `revenue` back onto the days, so
  "Load demo data" produced a book whose Overview, Costs, forecast and Sales
  view all read zero. It builds a real ledger now — a plan mix rather than one
  price, install dates so days-to-purchase has something to draw, a few
  cancellations so MRR is not a straight line, and the odd refund.
- **The event before/after table.** Its purchase row came from subscribe pings,
  which fire a launch or two after the transaction, so a shift in the LAG read
  as a shift in buying — the same trap the weekday chart's five bars exist to
  avoid, in a table that is read to judge a release or an ad spot.
  `A.beforeAfter` now takes the ledger, sliced to the platform the ping index is
  sliced to, and reports **Purchases** and **Revenue** from it with the ping
  kept beside them under its own name.

The store CSV out (**Backup → Export CSV**) is store days only and says so: a
purchase is not a property of a day any more. The ledger has its own CSV, and
the JSON backup carries everything.

## The forecast, and why it has two prices

The forecast's default model is **Plan mix**, driven by the ledger: an annual
share, a monthly price and an annual price, all read from real sales over the
last 180 days. Running one pool at one average price — which is what it did
while sales were a daily total — gets the cash curve and the MRR curve wrong in
opposite directions the moment the mix is not what the average assumed. Two
consequences worth knowing:

- **Annual plans churn at renewal, not continuously.** Someone who has paid for
  a year cannot leave in month three, so annual cohorts are held whole and
  tested once a year; applying a monthly churn to them understates MRR for
  eleven months out of twelve.
- **Price and mix are not scenario levers.** You know what you charge and
  roughly who picks what, so the bear/optimistic band swings conversion, volume,
  growth and churn and leaves those two alone rather than widening the band with
  uncertainty that is not there.

`monthly` used to be the default model, so every saved UI carries it whether or
not anyone chose it. A model nobody pressed a button for is upgraded to the mix
once; `fc.modelChosen` is stamped the moment they do, so a deliberate "all
monthly" is never overridden.

## The Costs view

What the app costs to run, against what it earns. It replaced the metric
explorer, which asked a question — "chart any two of these together" — that
every other view already answered better for its own subject.

Two collections, synced alongside entries and events:

- **`ads`** — an AD SPOT: one thing bought once, carrying its own price. A name,
  the platform it ran on (Facebook, Apple Search Ads, Reddit… from a fixed
  list), what it cost, the day it starts, an end date that may not exist yet,
  and the impressions / clicks / installs the platform reported back. Its start
  and end appear as flags on every calendar chart in the dashboard, derived the
  same way releases are, so nobody hand-enters a second copy that can drift.
- **`costs`** — everything else the app costs to run: a dated amount with a
  category, optionally recurring. Advertising is **not** offered as a category
  here (`CS.ENTRY_CATEGORY_KEYS` is what the form reads), because the same money
  would then be enterable twice in two shapes that no longer add up.

The two are put together in exactly one place, `CS.allCosts(ads, costs)`, which
projects each spot into a derived cost row on its start date. Every rollup —
`daily`, `spend`, `summary`, `breakeven` — reads that, so nothing downstream
knows there are two collections.

The arithmetic is pure and lives in `costs.js` (`tests/costs.test.mjs`). Five
rules run through it, and they are the reason to read that file before changing
a number here.

**A cost lands on the day it is charged.** A recurring row is expanded into its
occurrence dates, not smeared across the days between them: a yearly developer
fee is a real 99 on one day. Monthly recurrences clamp short months from the
original day, so a bill first paid on the 31st recurs on Feb 28 and then on
Mar 31 rather than sliding to the 28th forever.

**An ad spot is bought, not run daily.** This view used to model advertising as
a campaign plus a row of daily spend — how a network's dashboard reports it, and
not how the money is actually spent here. A spot is one line item with one
price, so the price lands whole on the day it starts and nothing is spread
across the days it runs. `end` describes the booking, not the money, which is
why a spot appears in the range its cost landed in rather than every range it
overlapped. A journal opened on the old shape is migrated once (`migrateAdSpots`
in `app.js`, guarded by `settings.adSpotsMigrated`): each campaign collapses to
one spot at the sum of its daily rows, an ADS row that belonged to no campaign
becomes a spot of its own, and the totals before and after are identical.

**Revenue is netted before profit is claimed.** Entries record the
customer-facing price; the store keeps 15% or 30% of it. `settings.storeCutPct`
(Edit data → Store commission) is applied everywhere profit appears, and the
gross figure is always shown beside the net one so the cut is visible rather
than silently applied.

**Blended and reported acquisition costs are never mixed.** Blended is marketing
spend ÷ every store download, which charges organic installs to marketing and is
therefore the honest ceiling. Reported is spend ÷ the installs the ad network
claims, and the network is marking its own homework. The tiles and the
cost-per-acquisition chart are blended and say so; the ad-spot and platform
tables are reported and say so.

**Deleting an ad spot deletes its money.** The spot IS the line item now, so
there is nothing left behind to detach — and the delete confirmation says the
amount out loud rather than letting it go quietly.

**Reading and entering are separate tabs.** The Costs tab is the analysis —
tiles, charts, and the by-category / by-platform / by-ad-spot tables, all scoped
to the filter bar and all read-only. Everything you type lives under **Edit
data**, which is broken into six sections: Store data, Sales, Spending (ad spots
and the cost ledger), What happened (the events editor, moved off the Timeline
for the same read/enter split), Settings and Backup & account. Each section
heading is full size and every card under it is a `<details>` accordion, because
that page is navigated rather than read top to bottom; the disclosure state
lives in the DOM and is deliberately not synced. The ad-spot list there is
unbounded in time rather than range-scoped — a spot bought today to start next
month must still appear in the list you manage it from.

The platform filter is hidden on the Costs view. A hosting bill is not iOS or
Android, and no ad network splits spend the way the stores split downloads.

Two numbers leak into other views deliberately: the Overview tile strip gains
net profit and cost per install once there is any spend to report, and the
Timeline gains a Spend metric — entered by hand, so unlike every store metric
there it is complete for today.

## Dates are US Eastern, everywhere

The ping counter buckets every arrival on the **US Eastern** day
(`easternDay` in `sls/lambdas/ping/main.js`, duplicated verbatim in
`mobile/src/lib/ping.ts`). The dashboard used to derive its own "today" from the
browser's local calendar, so for part of every day the page and its own data
disagreed about which day it was — opened from a machine on UTC it started
calling tomorrow "today" at 8pm Eastern and showed a fresh, nearly empty day
hours before one existed.

`easternDay()` in `app.js` is now a third copy of the same arithmetic, and
`today()` / `reportDay()` derive from it. **Move one and you must move all
three.** Anchoring the dashboard rather than shifting the data is deliberate:
the page then reads the same wherever it is opened, which is the point — these
are the business's numbers, read against the business's calendar.

### The UTC era, and why it lasted three days longer than the fix

Ping rows written before the Lambda started stamping Eastern days are
UTC-bucketed and cannot be re-stamped: pings arriving between 8pm and midnight
Eastern were booked to the following day. Nothing records what time within a day
a ping arrived, so there is no honest repair — any reallocation would be a guess
about which share of a day's count came in after 8pm. **The counts are left
alone.** The affected window is **2026-08-10 through 2026-08-13**, and the shape
it leaves behind is a small deficit on each day paired with a matching surplus on
the next; read as a trend it looks like a nightly dip that is not there.

The fix itself landed in the repo on 2026-08-12 and did not reach production
until 2026-08-13, because **`sls deploy` had been failing since 2026-08-10 and
nothing said so.** Two things about that are worth carrying forward:

- **The build half-succeeded, which is why it went unnoticed.** `post_build`
  syncs the site to S3, invalidates CloudFront, and only then runs `sls deploy`.
  The first two kept working, so articles and dashboard changes shipped normally
  the whole time and everything looked healthy from the outside. Only the
  backend was frozen. A pipeline that can partially fail is a pipeline whose
  green-looking output means less than it appears to.
- **Nothing in the repo caused it.** `buildspec.yml` installed `serverless`
  unpinned; v4.41 began resolving its deployment bucket through an SSM parameter
  (`/serverless-framework/deployment/s3-bucket`) that the CodeBuild role had no
  grant for, and v4 also moved from a per-stack deployment bucket to one shared
  bucket per account and region. Both grants are now in
  `infrastructure/pipeline.yml`, and the serverless version is pinned so the
  next behaviour change is one you opt into. The first failure had no commit to
  blame, which is exactly what made it hard to spot.

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

`tests/sales.test.mjs` pins the subscription arithmetic against a hand-worked
book — an annual plan's MRR, the gap between cash and recognised revenue, what a
refund is counted in (nothing but its own two fields), and what the migration
makes of the old daily columns. `tests/master-sales.test.mjs` drives the view in
the built page, and its store fixture is deliberately in the **old** shape so
that booting has to migrate it: if that ever half-happens, every revenue figure
in the dashboard is wrong and nothing else in the suite would notice. It also
covers the platform filter no longer emptying the App usage view.

`tests/costs.test.mjs` pins the money arithmetic against a hand-worked fixture,
and `tests/master-costs.test.mjs` drives the Costs view itself in the built
page — buying an ad spot, watching its price land whole on its start day,
deleting it and watching its money go with it, and the header's refresh doing a
round trip rather than a reload. It also boots a third page against a LEGACY
server copy (campaigns plus daily ADS rows) and checks the migration comes out
with the same total it went in with. Its fetch stub is a small in-memory server that
applies the pushes it receives, because against a stub that always answers
"nothing stored" a passing refresh test would only prove the data had been
thrown away.
