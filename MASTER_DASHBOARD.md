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
framework-free — plain HTML, one stylesheet and eight scripts, edited in
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
| `storeimport.js` | Reader for App Store Connect / Play Console CSV exports — pure, unit-tested |
| `app.js` | Store, cohort derivation, all views, import/export |
| `charts.js` | Dependency-free SVG chart engine |
| `styles.css` | Dark theme tokens, layout, gate |

## Getting data in

Three ways, in the Data view. The single-day form and the bulk grid are typing.
The third is **Import a store export**, which reads the CSVs the consoles hand
you — App Store Connect → Analytics, Play Console → Statistics / Download
reports — so the daily numbers no longer have to be copied by hand.

`storeimport.js` is the reader and is pure: text in, a plan out. `app.js` owns
the card and is the only thing that writes to the store. Four things about it
are load-bearing:

- **A file states only the metrics it contains.** App Store Connect exports one
  file per chart, so impressions and downloads for the same day arrive
  separately. A parsed value is therefore `null` when the cell is empty and `0`
  only when the file really says zero, the plan carries fields rather than whole
  rows, and the commit assigns just those fields. Importing a page-views file
  cannot blank out that day's downloads. The dashboard's own `importCSV` still
  follows the opposite rule — missing column means zero — which is right for its
  own wide CSV and wrong for these, and is why this is a separate path.
- **Nothing commits before the mapping is shown.** Columns are matched against
  header names that Apple and Google both rename without notice, so the card
  lists every column it saw — mapped, ignored as a breakdown, or unrecognised —
  and each one can be re-pointed at a field before merging. A guess that is
  wrong is then visibly wrong rather than silently destructive.
- **The platform is never guessed from nothing.** It comes from the filename,
  the header vocabulary, or a platform column in the file; failing all three the
  file is held back until the user picks, because filing a month under the wrong
  store is not something the dashboard can undo.
- **Apple's `Sales` is money, not a count.** It is customer spend, the sibling of
  `Proceeds`, so it maps to the dashboard's `revenue` and loses to `Proceeds`
  when both appear. Mapping it to `sales`, which counts conversions, would file
  dollars as purchases.

Smaller things the exports actually do: Play's statistics CSVs are UTF-16 (read
as UTF-8 the header matches nothing), consoles put a title and a date range
above the header row, a territory- or device-split export repeats a date and has
to be summed, and some exports run dates across the top instead of down the
side. All four are handled and all four are tested.

## Backend

`sls/` at the repo root — one DynamoDB table and one Lambda behind an HTTP API
with a Cognito JWT authorizer. It deploys from the same CodePipeline as the
landing site on push to `main`.

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
npm run test:master     # build + all three suites
npm run test:import     # just the import suites, against the last build
```

`master-gate.test.mjs` builds the site, then drives `build/master/index.html` in
jsdom through the whole path: the sign-in challenge (wrong code, then right), token persistence,
the boot `LOAD`, hydrate, and the first diffed `SYNC` push. It runs against the
**built** page rather than the sources, because the route that assembles them
is now part of what can break — the test asserts that the stylesheet and all
eight scripts are inlined and that the document references nothing relative.

`store-import.test.mjs` exercises the export reader directly — date and value
parsing, column matching, UTF-16, pivoted and split files, the plan and its
conflicts. `store-import-ui.test.mjs` drives the card in the built page from
dropped file to stored entry, and holds the line the feature rests on: a
single-metric import must leave the other five metrics of an existing day
untouched.
