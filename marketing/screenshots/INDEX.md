# Screenshot library

Twenty-eight stills of the real app, for TikTok and marketing. Every one is a
screenshot of the product rendering a real journal — nothing here is mocked up,
composited or retouched, so the numbers on screen are the numbers the app
computed from the data behind them.

**Shot on:** iPhone 17 Pro simulator, iOS 26.5, 1206 × 2622, dark theme, Pro tier
unless noted. Status bar is full signal / full battery / the real clock at
capture, which is why the times differ between shots: the app's own copy names
the hour ("Pacing well for 8:04pm"), so a cosmetic 9:41 would contradict the
screen under it.

**The person in these shots** is 38F, two months into tracking, on a recovery arc
that starts in crash days and settles green, with a magnesium glycinate onset in
the middle. Age and sex are not decoration — they recenter the baseline RMSSD
ladder, so the grades shown are the grades this person would really see.

**To re-shoot or add one:** see `README.md`. The purposes below are copied from
the shot registry in `mobile/src/dev/shots.tsx`; that file is the source of
truth, so add a shot there and update this index.

---

## Journal — the hero surface

| Shot | What it shows | Reach for it when |
| --- | --- | --- |
| `journal-good.png` | 91, Excellent. The dial, the pacing strip with 2h 35m left, the three key figures, the Trend card. | The default hero. Any piece that needs "this is the app". |
| `journal-crash.png` | 30, Bad. Budget paused, "We recommend a recovery day", "Heading toward a crash, down 38 points over the last 3 days". | The honesty shot. Pair with any claim that it tells you the truth instead of gamifying you. Nothing else in the category shows you a red screen. |
| `journal-entries.png` | The logged sections: readings with grades and times, activities, meds, symptoms. | "One place for all of it", and any logging-focused piece. |
| `journal-fresh.png` | Day one. "FIRST READING — your baseline is waiting", placeholder tiles, Milestones 0 of 75. | Onboarding content, and the "it does not make things up" angle: no score exists until you have measured. |
| `journal-early.png` | Day 3 of a new journal, scoring 29. Honest about where most people start. | Expectation-setting, week-one content, anything aimed at someone who has just been diagnosed. |
| `journal-free.png` | The same day on the free tier: score, day and Trend card all live, pacing offered rather than taken away. | Freemium explainers and "what do I get for free" questions. |

## The score

| Shot | What it shows | Reach for it when |
| --- | --- | --- |
| `score-explain.png` | "How this was calculated": every component with its own grade — Baseline HRV, Training HRV, Total power, pNN50, LF peak, blood pressure, sleep. | The single best answer to "where does that number come from". Proof it is computed, not vibes. |
| `downturn-sheet.png` | "Something's off — down 38 points over the last 3 days", then what could be driving it, ranked, from the user's own log. | The crash-warning story, and the clearest demonstration that it reasons about causes rather than just plotting a line. |

## Pacing — the differentiator

| Shot | What it shows | Reach for it when |
| --- | --- | --- |
| `pacing-ahead.png` | Gold strip: "6m left of 3h 35m", "At this pace the budget runs out around 8:32pm". | The frame that makes pacing click in one sentence. Probably the single most explanatory still in the library. |
| `pacing-over.png` | Red strip: "Over by 2h 31m", "Resting now brings this back down". | PEM and post-exertional crash content. "It tells you before you pay for it." |
| `pacing-sheet.png` | The envelope: 3h 35m budget, what the day has spent, the pace marker explained, high confidence, built from 4 activities + steps + heart rate. | Explaining how the budget is arrived at. **Note:** leads with a "turn on pacing alerts" ask, because notification permission cannot be granted from the CLI — see README. |
| `pacing-spend.png` | "Minutes HR above 96 bpm — 4h 06m charged of 6h 06m spent", split by band, longest stretch, highest reading. | "Your own exertion line, not a fitness zone." The receipt behind the bar. |

## Readings

| Shot | What it shows | Reach for it when |
| --- | --- | --- |
| `reading-card.png` | A Training HRV reading graded Excellent, SDNN 62 / RMSSD 34.3 / pNN50 15% with 10-day sparklines. | What you actually get out of a reading. |
| `reading-picker.png` | Add reading: baseline HRV, training HRV, POTS standing test, POTS episode, blood pressure, resting HR. | "It is not just another HRV app." |
| `hrv-sensors.png` | Measuring with: Bluetooth strap (best accuracy), Apple Watch, Garmin, phone camera (no device needed). | The answer to "do I need to buy anything". Point at the camera row. |
| `hrv-setup.png` | What a paced training reading is, the 4/6 breathing pace, and Start. | Explaining paced breathing to people who have never heard of it. |
| `sleep-report.png` | 8h 9m, Excellent. Overnight heart rate 55–84, nocturnal dip 17% graded against the user's own daytime resting rate. | Sleep-led content. Strong standalone piece. |
| `milestones.png` | 49 of 75 achieved, with real recovery markers dated: first RMSSD 30+, 7 consecutive days RMSSD 30+. | Motivation content that is not a streak badge. |
| `calendar.png` | A month with every day coloured by its own score. | Cold opens and thumbnails. Reads instantly at small size. |

## Progress

| Shot | What it shows | Reach for it when |
| --- | --- | --- |
| `progress-arc.png` | Daily score across the range with a rolling average: average 84, best 91, worst 59, and a visible crash and recovery. | The clearest single image of "this is getting better". Most pieces will want this one. |
| `progress-week.png` | HRV power distribution by week, VLF/LF/HF stacked, climbing across two months. | Before/after cuts and scroll-throughs — the weekly grouping reads best in motion. |
| `progress-hrv.png` | The same power split day by day, plus SDNN with grade zones. | HRV-literate audiences, and contrasting this with a generic wearable chart. |
| `progress-locked.png` | The real Month document built and masked, with "Month trends are locked" over it. Free tier. | Upgrade prompts and store listings. Meeting your own faded data sells better than a price list. |

## Insights — what is linked to what

| Shot | What it shows | Reach for it when |
| --- | --- | --- |
| `insights.png` | "61 pts better than day one", biggest change, best vs hardest weeks with the week strip. | Lead shot for any "it finds your patterns" piece. |
| `insights-change.png` | Change details: before 26 pts, after 66.5, +40.5, confidence Very strong, with the days magnesium was logged shaded on the chart and the "correlation is not causation" note at the top. | The shot that answers "how would it even know that". The caveat line is a feature, not a problem — show it. |
| `insights-empty.png` | "0 of 14 days", "14 more days of logging. Nothing is being held back, there simply is not enough yet", and what is worth logging. | Trust content and honest onboarding. There is no demo data pretending to be yours. |
| `reports.png` | AI Insights & Reports: data for prompt, full health report, medical summary for doctor — with "nothing is sent anywhere by the app". | "Bring this to your appointment", and privacy content. |

## Selling

| Shot | What it shows | Reach for it when |
| --- | --- | --- |
| `paywall.png` | "See your nervous system recover with Pro": full history, pacing budget, insights, AI reports. $49.99/yr or $7.99/mo. | Store listings and upgrade pieces. |

---

## What is NOT in here yet

Honest gaps, so nobody goes looking:

- **Live capture.** A running HRV session, the breathing rings, the live RR
  trace, and a live stand test with the heart rate actually climbing. These need
  a real sensor: a simulator has no camera pulse and no Bluetooth, and faking
  the trace would break the one rule this library is built on. They need either a
  recorded RR series replayed through the capture engine, or shooting on a real
  phone with a strap.
- **Widgets, notifications and the Apple Watch.** All three live outside the app
  and are shot differently: the home screen, the lock screen, and the watch
  simulator.
- **Android.** Its own simulator, its own widgets, Health Connect instead of
  Apple Health.
- **Light theme.** Every shot here is dark.
- **Cycle tracking**, the POTS result cards, the export sheet and Settings.
