/* releases.js — GENERATED, do not edit.
 *
 * Source: mobile/src/lib/whatsNew.ts (the app's customer-facing release log).
 * Regenerate with `npm run releases` in landing/ after cutting a version.
 *
 * The dashboard draws these as release annotations on every calendar chart.
 * They are not editable events: the app's log is the source of truth for what
 * shipped and when, and a second hand-maintained copy would only drift.
 */
window.RELEASES = [
  {
    "version": "1.1",
    "date": "2026-07-10",
    "notes": [
      "Phone-camera HRV capture as a third signal source, alongside straps and the watch."
    ]
  },
  {
    "version": "1.3",
    "date": "2026-07-11",
    "notes": [
      "Sleep stage summaries from Health, and local reminders.",
      "Faster saves and on-device backups."
    ]
  },
  {
    "version": "1.2",
    "date": "2026-07-11",
    "notes": [
      "Refinements across HRV, scoring and health syncing."
    ]
  },
  {
    "version": "1.5",
    "date": "2026-07-12",
    "notes": [
      "POTS Episode capture on the watch: stairs, sit-to-stand and lay-to-stand, with a complication shortcut."
    ]
  },
  {
    "version": "1.4",
    "date": "2026-07-12",
    "notes": [
      "Apple Watch companion: live heart-rate monitor and a guided POTS stand test.",
      "Milestones filtering and a completed-today card."
    ]
  },
  {
    "version": "1.8",
    "date": "2026-07-13",
    "notes": [
      "Android is a first-class platform: Health Connect, camera HRV and Google Play billing."
    ]
  },
  {
    "version": "1.7",
    "date": "2026-07-13",
    "notes": [
      "A much bigger type catalog: more workout types, and far more POTS, long-COVID and MCAS symptoms and triggers.",
      "Types are alphabetized, with the \"Other\" options last."
    ]
  },
  {
    "version": "1.6",
    "date": "2026-07-13",
    "notes": [
      "Clearer, less clinical wording throughout the app."
    ]
  },
  {
    "version": "1.9",
    "date": "2026-07-14",
    "notes": [
      "The app is free to use, with a seven-day trial of everything and a subscription for the rest.",
      "Phone-camera HRV capture with a guided setup flow."
    ]
  },
  {
    "version": "1.11",
    "date": "2026-07-15",
    "notes": [
      "Progress and Insights show a sample month until you have data of your own, so you can see what they become. The Journal never shows fake entries.",
      "Morning reminder.",
      "Clean-day protocol editor."
    ]
  },
  {
    "version": "1.10",
    "date": "2026-07-15",
    "notes": [
      "Richer AI reports and tappable metric charts.",
      "A perfect 100 day score is now reachable."
    ]
  },
  {
    "version": "1.13",
    "date": "2026-07-16",
    "notes": [
      "\"Take an HRV reading\" joins the clean-day protocol.",
      "A large Score and Daily Protocol widget on Android.",
      "Reworked Analysis tab and day summary."
    ]
  },
  {
    "version": "1.12",
    "date": "2026-07-16",
    "notes": [
      "Home-screen widgets on both platforms, including a start-HRV shortcut.",
      "A crash warning notification alongside the morning reminder."
    ]
  },
  {
    "version": "1.14",
    "date": "2026-07-17",
    "notes": [
      "Milestones gained SDNN, cumulative exercise, protocol adherence and hydration groups, with longer streak tiers.",
      "HRV Progress: a pooled average across sources by default, plus a compare overlay.",
      "Day summary now shows what would raise confidence in your score."
    ]
  },
  {
    "version": "1.15",
    "date": "2026-07-18",
    "notes": [
      "The watch app no longer bounces back to the clock face after an interrupted session.",
      "A five-minute rolling heart-rate chart one swipe left of the watch readout."
    ]
  },
  {
    "version": "1.16",
    "date": "2026-07-22",
    "notes": [
      "Camera HRV is trustworthy. Beats found while the signal does not read as a pulse are discarded, long artifact bursts are caught, and metrics no longer reason across dropouts. Strap, watch and ECG results are unchanged.",
      "Heart-rate zones for workouts, and HRV pulled out of workouts imported from Health.",
      "Per-reading, per-workout and per-event AI insights.",
      "Reworked HRV setup flow."
    ]
  },
  {
    "version": "1.17",
    "date": "2026-07-25",
    "notes": [
      "A quiet pill now offers new Apple Health or Health Connect data the journal does not already have, grouped into Sleep, Readings, Exercise and Medications.",
      "Pull down on the Journal to check for new health data on demand.",
      "New multi-select sheet for medications, symptoms and triggers: search or create, tick several, log them in one tap."
    ]
  },
  {
    "version": "1.18",
    "date": "2026-07-26",
    "notes": [
      "Connecting Health can now bring in a full year of history: sleep nights with stages, workouts with their heart-rate trace, readings and medications, with live progress as it runs.",
      "Add a note to an HRV or POTS result right on the keep-or-discard screen.",
      "Apple Watch heart-rate monitor gains Night mode and Low Power mode.",
      "Smoother range switching on Progress."
    ]
  },
  {
    "version": "1.19",
    "date": "2026-07-28",
    "notes": [
      "Imported HRV only counts when it carries four or more minutes of real beat-to-beat data. Passive one-minute watch samples no longer drag your averages around. Nothing is deleted, it just stops counting.",
      "Delete an imported entry and it stays gone. The import pill will never offer that sample again.",
      "Sleep hours follow the times you enter, so correcting bed or wake time updates the night.",
      "POTS episodes chart the biggest rise from your pre-episode baseline, matching how the entry is graded.",
      "Medication dose fields accept units like \"400mg\" or \"1 scoop\"."
    ]
  },
  {
    "version": "1.21",
    "date": "2026-07-30",
    "notes": [
      "Camera readings start reliably again, including the second and every later time you use a saved layout.",
      "A camera that cannot start now tells you why instead of sitting on a black circle, and falls back to a simpler setting rather than giving up.",
      "Bluetooth scans explain themselves. Bluetooth off, permission denied or no radio at all each say so, instead of quietly finding nothing."
    ]
  },
  {
    "version": "1.20",
    "date": "2026-07-30",
    "notes": [
      "Health imports no longer double up when two sources recorded the same reading.",
      "Analysis readouts say which period they describe, so a value reads as a sentence at every zoom level."
    ]
  },
  {
    "version": "1.22",
    "date": "2026-08-05",
    "notes": [
      "Imported workouts now offer a recovery card the first time you open them, so you can log your heart rate one minute after stopping while it still means something.",
      "Your water goal is editable straight from the water drawer, and the same goal is used everywhere.",
      "Analysis readouts follow the chart you are looking at, so the number on the card matches the point you tapped."
    ]
  },
  {
    "version": "1.23",
    "date": "2026-08-10",
    "notes": [
      "The app now tells you what changed in each new version. This card is it, and it is always here under Settings.",
      "Small refinements to the reading cards."
    ]
  }
];
