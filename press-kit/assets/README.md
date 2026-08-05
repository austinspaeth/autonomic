# Press assets: what to drop in this folder

This is the **visual** half of the kit. Most of it you already have; only the
founder photo and the raw screenshots are real work. Drop files here with the
suggested names so the `/press` page can link them.

---

## 1. Screenshots: the main thing to gather

**These are NOT your App Store screenshots.** Those are marketing (device frames,
caption text, colored backgrounds). Press screenshots must be **clean and
un-captioned** so a journalist can drop them straight into an article.

- **Format:** native device resolution, **portrait**, PNG. e.g. 1290×2796
  (iPhone 15/16 Pro). **Not 16:9**, that's landscape/video; phone shots are tall.
- **No text overlays, no marketing copy, no colored ad background**, just the app.
- **Provide two versions if easy:**
  - `unframed/`: the pure screen capture (Cmd+S in the iOS simulator, or
    device screenshot).
  - `framed/`: the same screen dropped into a plain iPhone/Pixel mockup on a
    transparent or white background. Writers pick whichever fits.
- **Resolution over polish:** bigger is better; they can downscale, not upscale.

### Shot list (grab these 6)
1. `01-live-hrv.png`: the live 5-minute HRV session (the hero; your product's
   payoff shot)
2. `02-autonomic-score.png`: the daily Autonomic Score + outlook
3. `03-graded-reading.png`: a scored reading showing the great/good/ok/warning/
   crash grading
4. `04-analysis.png`: a week/month trend chart
5. `05-privacy.png`: the "no account, no cloud" / data-ownership screen
6. `06-watch-stand-test.png`: the Apple Watch stand test (standing phase, big
   delta), the POTS story in one image

*(Android equivalents welcome as `*-android.png` if you want both platforms
represented.)*

## 2. Founder photo: only you can make this
- A real, high-res photo of you (headshot, or you using the app). Genuine beats
  polished; patient-founder authenticity is the whole point.
- Name it `founder-austin.jpg`, ideally ≥ 2000px on the long edge.

## 3. Logo & icon: you already have these
- App icon: reuse `favicon.png` from the repo root → save here as `app-icon.png`
  (512×512, the store icon).
- Wordmark/logo: `logo.svg` from the repo root → copy here as `logo.svg`.

## 4. Data-flow diagram: done, in the parent folder
`../data-flow-diagram.svg` is ready to use. If a publication wants a raster,
export it to `data-flow-diagram.png` at 2x.

## 5. Optional: a press asset zip
Once the above are in place, zip this folder as `autonomic-press-assets.zip` and
link it from the press page so a writer can grab everything at once.

---

### Checklist
- [ ] 6 clean portrait screenshots (unframed; framed too if easy)
- [ ] Founder photo (`founder-austin.jpg`)
- [ ] `app-icon.png` copied from repo `favicon.png`
- [ ] `logo.svg` copied from repo root
- [ ] (optional) `autonomic-press-assets.zip`
