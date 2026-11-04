<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import JournalScreen from '$lib/v2/screens/JournalScreen.svelte';
  import InsightsTabScreen from '$lib/v2/screens/InsightsTabScreen.svelte';
  import ProgressScreen from '$lib/v2/screens/ProgressScreen.svelte';
  import QuestionGrid from '$lib/v2/QuestionGrid.svelte';
  import Explainer from '$lib/v2/Explainer.svelte';
  import TrackTable from '$lib/v2/TrackTable.svelte';
  import Founder from '$lib/v2/Founder.svelte';
  import CompareTeaser from '$lib/v2/CompareTeaser.svelte';
  import LatestArticles from '$lib/v2/LatestArticles.svelte';
  import MidCta from '$lib/v2/MidCta.svelte';
  import Cite from '$lib/v2/Cite.svelte';
  import Sources from '$lib/v2/Sources.svelte';
  import { pickSources } from '$lib/v2/sources';
  import Faq from '$lib/v2/Faq.svelte';
  import Related from '$lib/v2/Related.svelte';
  import ConditionCards from '$lib/v2/ConditionCards.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';

  const path = '/conditions/dysautonomia/';
  const answers = [
    { q: 'What is my nervous system doing?', a: 'A five-minute morning reading, with your sleep and resting heart rate, becomes a score out of 100 and plain guidance, graded against your own normal.', feature: 'Journal + HRV', href: '/features/hrv-readings/', icon: 'journal' },
    { q: 'Am I about to crash?', a: 'When your score slides for days, or the markers that move first drift from your own normal together, the Journal flags it and lists what moved.', feature: 'Crash warnings', href: '/features/hrv-readings/#crash-warnings', icon: 'alert' },
    { q: 'Why does my heart race when I stand?', a: 'A guided lie-and-stand test on your Apple Watch or chest strap measures your rise minute by minute, and keeps every result to compare.', feature: 'POTS stand test', href: '/features/pots-stand-test/', icon: 'stand' },
    { q: 'Is it the weather, or is it me?', a: 'Barometric pressure is recorded quietly in the background. If your own log ties low-pressure days to worse days, Insights tells you, and the Journal warns you on the next one.', feature: 'Insights', href: '/features/insights/', icon: 'insights', pro: true },
    { q: 'How much can I do today?', a: 'A budget in hours and minutes, set each morning by your own readings, that spends down as you move and warns you before the ceiling.', feature: 'Pacing budget', href: '/features/pacing-budget/', icon: 'pacing', pro: true },
    { q: 'Will my doctor take this seriously?', a: 'Turn weeks of readings, stand tests, blood pressure and symptoms into a clear summary for your appointment, written by the AI you choose.', feature: 'AI reports', href: '/features/doctor-reports/', icon: 'doctor', pro: true }
  ];
  const track: [string, string, string][] = [
    ['HRV (RMSSD and SDNN)', 'How much your rest-and-digest side is in play. A morning reading under your own normal often comes before a harder day.', 'Five minutes with your phone camera, Apple Watch, Garmin or a chest strap'],
    ['Resting heart rate', 'A resting rate creeping up for a few days is one of the earliest signs your system is under load. A fast heart at rest is its own question for your clinician.', 'From your morning reading, or logged sitting or standing'],
    ['Standing heart rate', 'How hard your heart works to keep you upright, at the core of POTS and orthostatic intolerance.', 'A guided stand test on Apple Watch or a chest strap, plus one-tap episode captures'],
    ['Blood pressure', 'Highs, lows and swings across the day, and how they line up with symptoms, meals and standing.', 'Typed in from any cuff, lying or sitting, and graded'],
    ['Sleep and overnight heart rate', 'Broken nights show up in the next morning’s numbers, and a heart that never settles overnight is worth knowing about.', 'Nights from Apple Health or Health Connect, with stages and overnight heart rate'],
    ['Digestion', 'Gut motility is autonomic too. Hard days, loose days and long gaps often move with a flare.', 'Bowel movements logged by form and graded, with a quiet day counted only when you were logging'],
    ['Temperature and sweating', 'Heat intolerance, temperature swings, cold hands and feet, flushing and excess sweating are all autonomic symptoms.', 'Built-in symptoms in two taps, with heat as a trigger'],
    ['Barometric pressure', 'Plenty of people feel the weather turn. Your own log can say whether it really moves your days.', 'Recorded from your phone’s barometer (with your permission on iPhone), shown only once your data links it'],
    ['Symptoms and triggers', 'Dizziness, palpitations, brain fog, fatigue, nausea, near fainting, and what came before each one.', 'Built-in dysautonomia symptoms and triggers, plus any you create']
  ];
  // Insights' Barometric pressure card, on the same sample as the Journal warning (symptom load 1.3 higher).
  const PRESSURE_CARD = { metric: 'symptom load', unit: '', low: '4.1', other: '2.8', delta: '+1.3', confidence: 'Moderate', conf: 55 };
  const faq = [
    { q: 'What is the best app for tracking dysautonomia?', a: 'Measure the same few signals the same way, every day, and read them against your own normal. A five-minute morning HRV reading, your resting heart rate, a stand test now and then, blood pressure from a home cuff, and a log of sleep, symptoms and triggers cover most of what moves with dysautonomia. Autonomic brings all of it into one journal and turns it into a daily score and a trend.' },
    { q: 'Can an app tell me which type of dysautonomia I have?', a: 'No. Dysautonomia is diagnosed by a clinician, often with autonomic function tests, a tilt-table test or a skin biopsy, after other causes are ruled out. What an app can do is keep a careful, repeatable record of your heart rate, blood pressure, HRV and symptoms, which gives your clinician far more to work with than a single visit.' },
    { q: 'Why track HRV with dysautonomia?', a: 'Heart rate variability is one of the few direct, daily windows on your autonomic nervous system. It reflects how much your rest-and-digest side is in play. A single reading means little on its own, but a morning reading taken the same way each day, compared with your own baseline, shows the good stretches, the slides and the slow recovery that are otherwise hard to see.' },
    { q: 'Do I need a wearable?', a: 'No. Your phone camera can take the morning HRV reading with a fingertip on the lens, and blood pressure can be typed in from any cuff. An Apple Watch or a chest strap records the stand test for you, or the app times it and you enter your heart rate by hand. A strap gives the cleanest HRV signal if you already own one.' },
    { q: 'Can I bring my data to autonomic testing or a specialist?', a: 'Yes. With Pro, Autonomic builds a doctor summary from your readings, stand tests, blood pressure and symptoms, written by the AI you choose. Every stand test and reading also stays on your phone to show in the room.' },
    { q: 'Is Autonomic free?', a: `The journal is free forever, including unlimited HRV readings, your daily score, crash warnings and every stand test capture. Autonomic Pro is ${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year and adds Insights, the pacing budget, your full history, stand test results and AI reports. Every install starts with ${pricing.trialDays} days of Pro, with no card.` },
    { q: 'Does it work on Android?', a: 'Yes, at the same price. On Android, HRV readings run with your phone camera or a Bluetooth chest strap, the stand test and episode capture run with a chest strap or by hand, Garmin watches work, and sleep and workouts come in from Health Connect. The Apple Watch app needs an iPhone.' }
  ];
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['freeman2011', 'sheldon2015', 'davis2023', 'taskforce1996']);
  const about = [{ name: 'Dysautonomia', alternateName: ['Autonomic dysfunction', 'Autonomic neuropathy'] }];
  const features = ['Five-minute morning HRV readings graded against your own normal', 'Blood pressure and resting heart rate logging', 'A guided POTS stand test', 'Crash warnings', 'Symptom, sleep and digestion journal', 'Doctor summaries'];
  // "Am I about to crash?": the Journal on a sliding day, as the home page draws it.
  const slidingFigs = [
    { text: '21', unit: 'ms', color: '#f97316', label: 'HRV' },
    { text: '76', unit: 'bpm', color: '#eab308', label: 'Resting HR' },
    { text: '5h 40m', color: '#f97316', label: 'Sleep' }
  ];
  const slidingNotice = { emoji: '⚠️', text: 'Autonomic score trending down 12 points over the last 3 days', chevron: true };
</script>

<FeatureSeo
  name="Dysautonomia"
  {path}
  {faq}
  {sources}
  {about}
  {features}
  section={{ name: 'Conditions', path: '/conditions/' }}
  title="Dysautonomia Tracker App: HRV, Heart Rate & Symptoms | Autonomic"
  description="A dysautonomia tracker that turns a five-minute morning reading into a daily score, follows HRV, blood pressure and symptoms, and flags a slide early. Private."
/>

<FeatureHero crumb={{ label: 'Conditions', href: '/conditions/' }} here="Dysautonomia" badge="FOR DYSAUTONOMIA" name="Answers for life with dysautonomia." tagline="Your nervous system, measured every morning.">
  <svelte:fragment slot="lead">Autonomic is a dysautonomia tracker for iPhone and Android. A five-minute reading becomes a daily score against your own normal, beside your blood pressure, standing heart rate, sleep, digestion and symptoms. It warns you when things start to slide, and all of it stays on your phone.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-dysautonomia.webp);--pos:55% 40%" role="img" aria-label="A woman sitting on the edge of her bed in the morning, looking at her phone"><Phone w={270}><div class="v2-ph-full"><JournalScreen time="7:06" /></div></Phone></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>5 min</b><em>a window on your whole system</em><span>One still reading each morning sets your score and guidance, graded against your own normal rather than an athlete’s.</span></div>
    <div class="v2-stat"><b>Early</b><em>warning when you start to slide</em><span>The Journal flags a sliding score, and earlier still the markers that move first. One wobbling number never raises it.</span></div>
    <div class="v2-stat"><b>Free</b><em>journal, readings and score</em><span>Logging, unlimited HRV readings, your daily score and crash warnings cost nothing, forever.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions dysautonomia leaves you with, answered." sub="Each one is a part of the app. Tap a question to see how it works." items={answers} />

<Explainer tone="white" title="What dysautonomia is, and why it is so hard to see.">
  <div class="v2-facts" slot="aside">
    <small>Common forms at a glance</small>
    <dl>
      <div><dt>POTS</dt><dd>Heart rate up 30+ bpm standing</dd></div>
      <div><dt>Orthostatic hypotension</dt><dd>BP down 20/10 in 3 min</dd></div>
      <div><dt>IST</dt><dd>Resting rate over 100</dd></div>
      <div><dt>Vasovagal syncope</dt><dd>A reflex faint</dd></div>
    </dl>
    <a href="/insights/basics/autonomic-nervous-system-and-dysautonomia-guide/">The complete dysautonomia guide →</a>
  </div>
  <p>Your <strong>autonomic nervous system</strong> runs everything you never have to think about: heart rate, blood pressure, breathing rhythm, digestion, sweating and temperature. It has two branches, the sympathetic side (“fight or flight”) and the parasympathetic side (“rest and digest”), and they are meant to balance each other moment to moment. <strong>Dysautonomia</strong> is the umbrella term for when that balancing goes wrong.</p>
  <p>It takes many forms. <a href="/conditions/pots/">POTS</a> is a heart rate that races when you stand. Orthostatic hypotension is blood pressure that falls when you stand, by 20 mmHg systolic or 10 diastolic within three minutes<Cite n={1} />. Inappropriate sinus tachycardia is a fast heart even at rest<Cite n={2} />. Vasovagal syncope is a reflex faint. Small fiber and autonomic neuropathies damage the nerves that carry the signals in the first place. Dysautonomia also travels with <a href="/conditions/long-covid/">long COVID</a>, <a href="/conditions/me-cfs/">ME/CFS</a>, mast cell activation and hypermobility, and many people meet the criteria for more than one<Cite n={3} />.</p>
  <h3>You cannot feel your nervous system, but you can measure it</h3>
  <p>The regulation itself happens out of sight, and its symptoms (dizziness, fatigue, brain fog, palpitations, nausea, temperature swings) are easy to dismiss and hard to describe. What you can measure are its fingerprints:</p>
  <ul>
    <li><strong>HRV</strong>, the beat-to-beat variation in your heart rhythm, is one of the most direct daily windows on how much your rest-and-digest side is in play<Cite n={4} />.</li>
    <li><strong>Heart rate at rest and on standing</strong> shows how hard your system works to keep you upright.</li>
    <li><strong>Blood pressure across the day</strong>, because a single seated number misses the <a href="/insights/pots/labile-blood-pressure-dysautonomia/">swings many people live with</a>.</li>
    <li><strong>Sleep, digestion and symptoms</strong>, kept on the same timeline so a bad week has context.</li>
  </ul>
  <p>Taken once, any of these is a snapshot. Taken every morning and read against your own normal, they become a trend you and your clinician can use: a baseline, an early warning when things slide, and a record of what changed when you tried something new.</p>
  <h3>What Autonomic will not do</h3>
  <p>It will not tell you which form of dysautonomia you have, and it will never tell you to start, stop or change a treatment. <a href="/insights/pots/autonomic-function-tests-what-to-expect/">Autonomic testing</a>, tilt tables and skin biopsies belong with a clinician. What the app gives you is a careful record to bring to them, and it is honest when it has nothing to say.</p>
  <div class="v2-note"><span>If you faint without warning, have chest pain, or your symptoms change suddenly, seek medical care. Autonomic is not a medical device.</span></div>
  <Sources items={sources} />
</Explainer>

<TrackTable eyebrow="" title="What to track with dysautonomia, and why." sub="Your autonomic system touches nearly everything. These are the signals worth keeping, and how each one reaches your journal." rows={track} />

<section class="v2-sec white">
  <div class="v2-wrap v2-split rev">
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><ProgressScreen time="8:15" /></div></Phone></div>
    <div>
      <h2 class="v2-h2">One reading a morning. The whole system in view.</h2>
      <p class="v2-sub">Recovery from dysautonomia is slow and uneven. The daily habit is small so the record can be long.</p>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>Before you get up</b>Five minutes lying still, with your finger on the camera, a watch or a strap. Your score and guidance are waiting before you stand.</span></li>
        <li><i>2</i><span><b>Through the day</b>Blood pressure, symptoms, meals, water and bowel movements in a few taps. Sleep, steps and workouts arrive from Apple Health or Health Connect on their own.</span></li>
        <li><i>3</i><span><b>When something slides</b>The Journal flags it early and lists what moved, so you can ease off before the floor falls out.</span></li>
        <li><i class="hot">4</i><span><b>Over the months</b>Progress draws the long view against your own baseline, and Insights shows what lines up with your better days.</span></li>
      </ol>
    </div>
  </div>
</section>

<MidCta title="Take your first reading tomorrow morning." sub="Free on iPhone and Android, with {pricing.trialDays} days of Pro. No card, no account." />

<section class="v2-sec plum2" id="early-warning">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2 on-dark">Hear about a slide before it lands.</h2>
      <p class="v2-sub on-dark">Two detectors watch for you. One notices when your daily score has been sliding for days. The other speaks earlier, when the markers that move first, like resting and overnight heart rate or how quickly your heart settles after a workout, drift from your own normal together.</p>
      <p class="v2-fine on-dark">An early flag, not a prediction. It can be wrong, and it never replaces how you feel.</p>
      <a class="v2-link on-dark" href="/features/hrv-readings/#crash-warnings">How crash warnings work →</a>
    </div>
    <div class="v2-arch dark"><Phone w={260}><div class="v2-ph-full"><JournalScreen time="7:12" score={61} grade="Moderate" gradeRgb="234,179,8" delta={-12} confidence={90} guide="Reduced reserves. Keep the day easy and stay with the basics of your protocol. Lean on hydration, pacing, and rest, and hold back on anything demanding." figs={slidingFigs} notice={slidingNotice} /></div></Phone></div>
  </div>
</section>

<section class="v2-sec white">
  <div class="v2-wrap v2-split">
    <div>
      <span class="v2-propill v2-propill-lead">PRO</span>
      <h2 class="v2-h2">Find out if the weather really is part of it.</h2>
      <p class="v2-sub">Pressure is recorded quietly each time you open the app. If your own journal ties low-pressure days to worse symptoms or readings, Insights shows you the link, and the Journal warns you on the next low day. If there is no link, you never hear about it.</p>
      <a class="v2-link" href="/insights/pots/barometric-pressure-weather-changes-pots/">Read about weather and dysautonomia →</a>
    </div>
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><InsightsTabScreen time="7:24" pressure={PRESSURE_CARD} /></div></Phone></div>
  </div>
</section>

<CompareTeaser slug="welltory" title="Comparing Autonomic with Welltory?" sub="Both read HRV. Autonomic grades it for recovery, against your own normal, and adds the rest of the picture." keys={['Built for', 'Free HRV readings', 'Grading', 'Where your data lives']} />

<Founder />

<Faq title="Dysautonomia questions, answered" items={faq} />

<Related
  eyebrow=""
  title="About dysautonomia"
  hub={{ label: 'All basics articles', href: '/insights/basics/' }}
  items={[
    { q: 'What is dysautonomia, really?', slug: 'autonomic-nervous-system-and-dysautonomia-guide' },
    { q: 'Why does my blood pressure swing?', slug: 'labile-blood-pressure-dysautonomia' },
    { q: 'Is it POTS or orthostatic hypotension?', slug: 'orthostatic-hypotension-vs-pots' },
    { q: 'Is it IST or POTS?', slug: 'inappropriate-sinus-tachycardia-vs-pots' },
    { q: 'What happens at autonomic testing?', slug: 'autonomic-function-tests-what-to-expect' },
    { q: 'Could it be small fiber neuropathy?', slug: 'small-fiber-neuropathy-pots-long-covid' }
  ]}
/>

<ConditionCards current="dysautonomia" />

<LatestArticles topic="dysautonomia" title="The latest on dysautonomia" white />

<PageCta title="Meet your nervous system tomorrow morning." sub="Free on iPhone and Android. Your phone camera is enough to start." />
