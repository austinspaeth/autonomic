# /master — app analytics dashboard

The store-performance dashboard, living in `landing/static/master/` and served at
**https://autonomic.care/master/** behind a passwordless sign-in. It started life
as a standalone folder that ran from `file://` and kept everything in
`localStorage`; it now stores its data in DynamoDB and gates access through
Cognito.

This file is kept out of `static/` deliberately — anything under `static/` is
published verbatim, and the notes below describe the access-control model.

What the views mean, how the trial/wall cohorts are derived and the CSV import
format are documented in the dashboard's own README in the source repo
(`autonomic-dashboard`). This file covers what changed when it moved here.

## How it is served

These are **static assets**, not SvelteKit routes. The landing site's
`static/` directory is copied verbatim into `build/`, and CloudFront's
viewer-request function already rewrites a directory request to
`index.html` — so `/master/` resolves with no routing work and none of
SvelteKit's `csr = false` prerendering applies to it. No build step: the files
that ship are the files in this folder.

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

| File | Role |
|---|---|
| `index.html` | Markup, the sign-in gate, view shells |
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
cd landing/static/master
python3 -m http.server 8080
```

`http://localhost:8080` is in the API's CORS allowlist, so sign-in and sync work
against production data. There is no separate dev stage.
