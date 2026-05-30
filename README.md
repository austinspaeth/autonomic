# Autonomic Journal

A private, offline-first **PWA** for tracking autonomic-nervous-system recovery.
No backend, no accounts — everything lives in your browser's `localStorage` and
can be exported/imported as JSON. Installable to your home screen and works fully
offline.

## Features

- **Journal view** — one day at a time, with `‹ / ›` arrows or a tap-to-open
  **calendar** (days with data are dotted) to jump around.
  - **Sleep** — bed time & wake time.
  - **Readings** — HRV, Breathing HRV, and Blood Pressure (systolic / diastolic /
    pulse). Add as many per day as you like, each with a time and optional note.
  - **Activities** — a checklist you curate (Indoor bike, Walk, Legs up, …).
  - **Medications & Supplements** — a persistent checklist; tick what you took.
  - **Symptoms** — a checklist (High BP, Pressure, Labile HR, Light headed, Sick,
    …); any symptom can be flagged to also record a value (e.g. the BP number).
- **Add / edit / remove** any checklist item. **Removing only affects today
  forward** — past days keep whatever you recorded.
- **Analysis view** — averages, HRV / Breathing HRV / BP trend charts, and
  symptom & activity frequency, over 7d / 30d / 90d / all.
- **Light & dark mode** (follows your system on first run; toggle any time).
- **Import / Export** the full JSON dataset from the ☰ menu.

## Run locally

It's plain static files — serve the folder over HTTP (a service worker needs
`http(s)`, not `file://`):

```bash
npm start          # python3 -m http.server 8000  ->  http://localhost:8000
```

Then open it on your phone and **Add to Home Screen** to install.

## Data

Everything is one JSON blob under the `autonomic.journal.v1` key in
`localStorage`. **Export regularly** — clearing site data wipes it. Import
replaces the current dataset (after a confirmation).

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | App shell |
| `styles.css` | Theming + layout |
| `app.js` | All logic (state, rendering, calendar, analysis) |
| `sw.js` | Service worker (offline cache) |
| `manifest.webmanifest` | PWA manifest |
| `icons/` | App icons + SVG favicon (regenerate with `npm run icons`) |
| `tools/` | `gen_icons.py` (icon generator), `smoke.mjs` (jsdom tests) |

## Test

```bash
npm test           # jsdom smoke test of the full render + interaction paths
```
