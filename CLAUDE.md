# CLAUDE.md — project notes

**Autonomic Journal** is a private, offline-first **PWA** for tracking autonomic
recovery. It is **pure static HTML / CSS / JS — no build step, no dependencies,
no backend.** It is served from the repo root via GitHub Pages, and all state
lives in `localStorage` under the key `autonomic.journal.v1`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell (must stay at repo root for GitHub Pages) |
| `styles.css` | Theming (CSS variables) + layout |
| `app.js` | All logic — single IIFE, no framework |
| `sw.js` | Service worker (offline cache) |
| `manifest.webmanifest` | PWA manifest |
| `icons/` | App icons + SVG favicon |
| `tools/gen_icons.py` | Optional helper to regenerate the PNG icons (not part of the site) |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

Keep it dependency-free and build-free. Do not introduce a bundler, framework,
or `package.json`. Edit the static files directly.

## State shape (the localStorage JSON)

```jsonc
{
  "version": 1,
  "settings": { "theme": "light" | "dark" },
  "meta": {
    "lastUpdated": "<ISO timestamp>",      // see rule below
    "lastImport":  { "name": "file.json", "at": "<ISO timestamp>" }
  },
  "defs": {
    "activities": [ { "id", "name", "archived" } ],
    "meds":       [ { "id", "name", "archived", "dose?" } ],
    "symptoms":   [ { "id", "name", "archived", "hasValue?" } ]
  },
  "days": {
    "YYYY-MM-DD": {
      "sleep":      { "bed": "HH:MM", "wake": "HH:MM" },
      "readings":   [ { "id", "type", "time", "note", ...fields } ],
      "activities": { "<defId>": { "time" } },
      "meds":       { "<defId>": { "time", "dose?" } },
      "symptoms":   { "<defId>": { "time", "value?" } }
    }
  }
}
```

## Important behaviors / conventions

- **Every change to the app must update `meta.lastUpdated`.** This is centralized
  in `save()` in `app.js`: it stamps `meta.lastUpdated = new Date().toISOString()`
  on each call and then refreshes the on-screen status line. **Always persist
  mutations by calling `save()`** — never write to `localStorage` directly — so
  the timestamp stays accurate. The status line under the top buttons shows this
  "Updated …" time plus the last imported filename.
- **Imports** record `meta.lastImport` (`{ name, at }`) before calling `save()`,
  and that filename is shown in the status line.
- **Removing a catalog item archives it** (`archived: true`) rather than deleting
  it, so past days keep whatever was recorded. Archived items only disappear from
  **today forward** (`visibleDefs()` still shows an archived item on any day that
  already has a record for it).
- **Drawers/modals slide in and out from the bottom.** `openModal()` slides up;
  `closeModal()` adds a `.closing` class to play the slide-down animation, then
  removes the node. Keep this pattern for any new drawer.
- **Icons must be monochrome** where they should inherit color (tab bar, theme
  toggle). Use inline SVG with `stroke="currentColor"`, or text-presentation
  glyphs (append U+FE0E), not colored emoji.

## Running / testing

No build. Open `index.html`, or `python3 -m http.server 8000` for full
PWA/offline behavior. There is no committed test runner (keeping the repo
dependency-free); verify changes by loading the app.
