# Autonomic Journal

A private, offline-first **PWA** for tracking autonomic-nervous-system recovery.
**Pure HTML / CSS / JS — no build step, no dependencies, no backend.** Everything
lives in your browser's `localStorage` and can be exported/imported as JSON.
Installable to your home screen and works fully offline.

## Run it

It's just static files. Any of these work:

- **GitHub Pages** — the app lives in and is served from the `docs/` folder
  (the GitHub Pages source is configured to point at `docs/`).
- **Open locally** — double-click `docs/index.html`. (Note: the offline service
  worker only activates over `http(s)`, not `file://`, but the app still runs.)
- **Local server** (enables full PWA/offline testing):
  ```bash
  cd docs && python3 -m http.server 8000   # then open http://localhost:8000
  ```

Open it on your phone and **Add to Home Screen** to install.

## Features

- **Journal view** — one day at a time, with `‹ / ›` arrows or a tap-to-open
  **calendar** (days with data are dotted) to jump around. Arrow keys work too.
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

## Data

Everything is one JSON blob under the `autonomic.journal.v1` key in
`localStorage`. **Export regularly** — clearing site data wipes it. Import
replaces the current dataset (after a confirmation).

## Files

Everything (markup, styles, and logic) is inlined in the single **`docs/index.html`** —
no separate `.css` or `.js` files.

| File | Purpose |
| --- | --- |
| `docs/index.html` | The whole app — markup + inline `<style>` + inline `<script>` |
| `docs/sw.js` | Service worker (offline cache) |
| `docs/manifest.webmanifest` | PWA manifest |
| `docs/icons/` | App icons + SVG favicon |
| `docs/tools/gen_icons.py` | Optional: regenerate the PNG icons (`python3 docs/tools/gen_icons.py`) |
