# CLAUDE.md — project notes

**Autonomic Journal** is a private, offline-first **PWA** for tracking autonomic
recovery. It is **pure static HTML / CSS / JS — no build step, no dependencies,
no backend.** It is served from the repo root via GitHub Pages, and all state
lives in `localStorage` under the key `autonomic.journal.v1`.

Everything (markup, CSS, and JS) lives in the single **`index.html`** — the CSS
is in a `<style>` block in the `<head>` and the logic is in a `<script>` block
(one IIFE, no framework) at the end of `<body>`. There are no separate `.css`
or `.js` files; edit them inline in `index.html`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app — markup + inline `<style>` + inline `<script>` (must stay at repo root for GitHub Pages) |
| `sw.js` | Service worker (offline cache) |
| `manifest.webmanifest` | PWA manifest |
| `icons/` | App icons + SVG favicon |
| `tools/gen_icons.py` | Optional helper to regenerate the PNG icons (not part of the site) |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

Keep it dependency-free and build-free. Do not introduce a bundler, framework,
or `package.json`, and do not split the CSS/JS back out into separate files
unless asked. Edit `index.html` directly.

## State shape (the localStorage JSON)

```jsonc
{
  "version": 1,
  "settings": { "theme": "light" | "dark" },
  "meta": {
    "lastUpdated": "<ISO timestamp>",      // see rule below
    "lastImport":  { "name": "file.json", "at": "<ISO timestamp>" }
  },
  "days": {
    "YYYY-MM-DD": {
      "sleep":      { "bed": "HH:MM", "wake": "HH:MM", "quality": "good"|"interrupted", "hrLow?", "hrHigh?" },
      // readings/activities/meds/symptoms are all logged-entry ARRAYS, each item
      // { id, type, time, note, ...templateFields }, where `type` keys into a
      // programmatic map (READING_TYPES / ACTIVITY_TYPES / MED_TYPES /
      // SYMPTOM_TYPES) — no user-defined/custom items. Entries use an ordered,
      // typed field schema (number / select / time / check / text / textarea /
      // {divider:true}); see buildFieldInputs(). Time + a Notes textarea are
      // auto-added when a type doesn't define them. A type may set custom:"bike"
      // for a bespoke form (indoor bike) and summary()/detail() for its row.
      "readings":   [ { "id", "type", "time", "note", ...fields } ],
      "activities": [ { "id", "type", "time", "note", ...fields } ],
      "meds":       [ { "id", "type", "time", "amount", "note" } ],
      "symptoms":   [ { "id", "type", "time", "note", ...fields } ]
    }
  }
}
```

## Important behaviors / conventions

- **Every change to the app must update `meta.lastUpdated`.** This is centralized
  in `save()` in `app.js`: it stamps `meta.lastUpdated = new Date().toISOString()`
  on each call. **Always persist mutations by calling `save()`** — never write to
  `localStorage` directly — so the timestamp stays accurate. The "Last updated …"
  time (plus the last imported filename) is shown at the bottom of the hamburger
  **menu drawer**, not in the header.
- **Imports** record `meta.lastImport` (`{ name, at }`) before calling `save()`,
  and that filename is shown in the menu drawer footer.
- **All four logged sections share one pattern**: a section lists the day's
  entries; "+ Add" opens a filterable picker of programmatic types; choosing one
  stacks its form (`openEntryForm` / `bikeForm`) to capture fields. There are no
  user-defined/custom items and nothing to archive. To add a new type, add it to
  the relevant `*_TYPES` map (and an icon).
- **Drawers/modals are bottom sheets (~90% height) and stack iOS-style.**
  `openModal(build)` pushes a sheet (`sheetStack`); opening one while another is
  up scales the one beneath (`.behind`). Each sheet has a fixed ✕ (top-right) and,
  if the builder added a `.modal-actions`, a fixed blurred footer. `closeModal()`
  pops just the top sheet (the ✕ and backdrop use it); `closeAll()` closes the
  whole stack and is what completion actions (Save, etc.) call. Builders append
  content to a scrollable `.modal-scroll`.
- **Icons must be monochrome** where they should inherit color (tab bar, theme
  toggle). Use inline SVG with `stroke="currentColor"`, or text-presentation
  glyphs (append U+FE0E), not colored emoji.

## Running / testing

No build. Open `index.html`, or `python3 -m http.server 8000` for full
PWA/offline behavior. There is no committed test runner (keeping the repo
dependency-free); verify changes by loading the app.
