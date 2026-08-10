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
| `charts.js` | Dependency-free SVG chart engine |
| `styles.css` | Dark theme tokens, layout, gate |

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
npm run test:master
```

Builds the site, then drives `build/master/index.html` in jsdom through the
whole path: the sign-in challenge (wrong code, then right), token persistence,
the boot `LOAD`, hydrate, and the first diffed `SYNC` push. It runs against the
**built** page rather than the sources, because the route that assembles them
is now part of what can break — the test asserts that the stylesheet and all
seven scripts are inlined and that the document references nothing relative.
