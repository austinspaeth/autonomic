# Press assets

The nine screenshots on autonomic.care/press, as full-size PNGs. The same files
live in `landing/static/press/` (with `-preview.jpg` thumbnails for the page) and
in `autonomic-press-kit.zip`. Clean and un-captioned, so a journalist can drop
them straight into an article.

| File | What it shows | Source |
| --- | --- | --- |
| `01-daily-outlook.png` | The Journal's Autonomic Outlook on a good day | Rendered from the site's drawn app screen, sample data, 1170 x 2529 |
| `02-pacing-budget.png` | The pacing sheet: budget left, spent, where it went | Rendered, sample data |
| `03-insights.png` | Insights: biggest change and correlations | Rendered, sample data |
| `04-live-hrv-reading.png` | A live paced-breathing reading with the RR trace | Rendered, sample data |
| `05-crash-warning.png` | The Journal on a sliding day with the downturn card | Rendered, sample data |
| `06-pots-stand-test-result.png` | A POTS test result | iPhone capture, Oct 2026, 1206 x 2622 |
| `07-stand-tests-over-time.png` | Progress: POTS stand tests by week | iPhone capture, Oct 2026 |
| `08-hrv-over-time.png` | Progress: HRV by day with the age norm | iPhone capture, Oct 2026 |
| `09-apple-watch-stand-test.png` | The Apple Watch mid stand test | Watch capture, 410 x 502 |

"Rendered" means the high-fidelity app screens the home page draws in HTML,
exported edge to edge at 3x. Swap any of them for a real capture when one is
taken: keep the file name, regenerate the preview
(`sips -s format jpeg -s formatOptions 82 -Z 760 X.png --out X-preview.jpg`), and
rebuild the zip.
