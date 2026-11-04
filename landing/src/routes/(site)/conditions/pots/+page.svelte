<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import StandResultScreen from '$lib/v2/screens/StandResultScreen.svelte';
  import JournalScreen from '$lib/v2/screens/JournalScreen.svelte';
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

  const path = '/conditions/pots/';
  const answers = [
    { q: 'Why does my heart race when I stand?', a: 'A guided lie-and-stand test on your Apple Watch, a chest strap or with no device at all measures your rise minute by minute, and keeps every result so you can follow it for months.', feature: 'POTS stand test', href: '/features/pots-stand-test/', icon: 'stand' },
    { q: 'Is today going to be a bad day?', a: 'A five-minute morning reading, with your sleep and resting heart rate, becomes a score out of 100 and plain guidance before your feet touch the floor.', feature: 'Journal + HRV', href: '/features/hrv-readings/', icon: 'journal' },
    { q: 'Is the salt and compression actually helping?', a: 'Log what you take and do. Insights compares those days with your HRV, sleep and symptoms, and tells you what lines up, and when nothing does.', feature: 'Insights', href: '/features/insights/', icon: 'insights', pro: true },
    { q: 'Will my doctor believe me?', a: 'Turn weeks of stand tests, readings and symptoms into a clear summary for your appointment, written by the AI you choose.', feature: 'AI reports', href: '/features/doctor-reports/', icon: 'doctor', pro: true },
    { q: 'How much can I do before I pay for it?', a: 'A budget in hours and minutes, set each morning by your own readings, that spends down as you move and warns you before the ceiling.', feature: 'Pacing budget', href: '/features/pacing-budget/', icon: 'pacing', pro: true },
    { q: 'Why is it worse before my period?', a: 'Log your cycle and every reading is compared with the same phase of past cycles, so a predictable dip is never mistaken for a decline.', feature: 'Cycle tracking', href: '/features/cycle-tracking/', icon: 'cycle' }
  ];
  const track: [string, string, string][] = [
    ['Standing heart rate rise', 'How hard your heart works to keep you upright. The size of the rise, and whether it eases over ten minutes, is the core of a POTS picture.', 'A guided stand test on Apple Watch or a chest strap, or a result typed in by hand'],
    ['HRV (RMSSD)', 'How much your rest-and-digest side is in play. A morning reading under your own normal often comes before a harder day.', 'Five minutes with your phone camera, Apple Watch, Garmin or a chest strap'],
    ['Resting heart rate', 'A resting rate creeping up over a few days is one of the earliest signs your system is under load.', 'From your morning reading, or logged sitting or standing'],
    ['Sleep and overnight heart rate', 'Short or broken nights show up in the next morning’s numbers, and a heart that never settles overnight is worth knowing about.', 'Nights arrive from Apple Health or Health Connect, with stages and overnight heart rate'],
    ['Blood pressure', 'Helps separate POTS from orthostatic hypotension, and shows the swings many people with dysautonomia live with.', 'Typed in from any cuff, lying or sitting, and graded'],
    ['Episodes in real life', 'The stairs, the shower, getting out of bed: the moments a clinic never sees.', 'One tap on your Apple Watch, or in the app with a strap: before, during and one minute after'],
    ['Symptoms', 'Dizziness, palpitations, brain fog, fatigue, blood pooling, coat hanger pain, near fainting, and when each one hit.', 'Built-in POTS symptoms in two taps, plus any you create'],
    ['Triggers', 'Heat, prolonged standing, large meals, alcohol, dehydration and histamine-heavy foods.', 'A trigger list built for dysautonomia, and barometric pressure recorded on its own'],
    ['Treatments', 'Salt, fluids, compression, electrolytes and medication, and the day you started each.', 'Meds, supplements and water logged with their timing']
  ];
  const faq = [
    { q: 'What is the best app for POTS?', a: 'One that measures what POTS actually is, the heart rate rise when you stand, the same way every time, and reads your days against your own normal rather than a chart built for athletes. Autonomic runs a guided stand test on an Apple Watch, a chest strap or by hand, turns a five-minute morning reading into a daily score, logs POTS symptoms and triggers in two taps, and shows what lines up with your better days. It is free to download, works on iPhone and Android, and keeps everything on your phone.' },
    { q: 'Can an app diagnose POTS?', a: 'No. POTS is diagnosed by a clinician, usually with an active stand test or a tilt-table test and after other causes are ruled out. What an app can do is measure your standing heart rate the same way every time and keep the record, which gives you and your clinician something concrete to start from.' },
    { q: 'How do I do a POTS stand test at home?', a: 'Lie still for five minutes so your resting heart rate settles, then stand up and stay still for ten minutes while your heart rate is recorded. Autonomic guides the whole test, tells you when to stand, and saves the rise minute by minute: automatically with an Apple Watch or a Bluetooth chest strap, or with no device by buzzing you to enter your heart rate at 1, 3, 5 and 10 minutes. Have someone nearby, and sit or lie down at once if you feel faint.' },
    { q: 'What heart rate rise counts as POTS?', a: 'Clinicians look for a sustained rise of at least 30 beats per minute within ten minutes of standing in adults (40 in teenagers), without a large drop in blood pressure, alongside symptoms lasting at least three months. A home result over that line is a reason to talk to your clinician, not a diagnosis.' },
    { q: 'Do I need an Apple Watch to track POTS?', a: 'No. Your phone camera can take the daily HRV reading with a fingertip on the lens. An Apple Watch or a Bluetooth chest strap records the stand test for you. With no device at all, the app still runs it: it times five minutes lying and ten standing, and buzzes at 1, 3, 5 and 10 minutes for you to enter your heart rate from any blood pressure cuff or pulse oximeter.' },
    { q: 'Can I share my POTS data with my cardiologist?', a: 'Yes. With Pro, Autonomic builds a doctor summary from your stand tests, readings and symptoms, written by the AI you choose. Every stand test is saved minute by minute, so you can also open the result itself on your phone in the appointment.' },
    { q: 'Is Autonomic free?', a: `The journal is free forever, including unlimited HRV readings and every stand test and episode capture. Autonomic Pro is ${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year and adds your stand test results, Insights, the pacing budget, your full history and AI reports. Every install starts with ${pricing.trialDays} days of Pro, with no card.` },
    { q: 'Does it work on Android?', a: 'Yes, at the same price. On Android, HRV readings run with your phone camera or a Bluetooth chest strap, the stand test and episode capture run with a chest strap or by hand, Garmin watches work, and sleep and workouts come in from Health Connect. The Apple Watch app needs an iPhone.' }
  ];
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['vernino2021', 'sheldon2015', 'freeman2011', 'peggs2012']);
  const about = [{ name: 'Postural orthostatic tachycardia syndrome', alternateName: ['POTS', 'Postural tachycardia syndrome'] }];
  const features = ['A guided POTS stand test on Apple Watch, a chest strap, or by hand with no device', 'Five-minute morning HRV readings', 'POTS episode capture', 'Symptom, trigger and treatment journal', 'Insights into what lines up with better days', 'Doctor summaries'];
</script>

<FeatureSeo
  name="POTS"
  {path}
  {faq}
  {sources}
  {about}
  {features}
  section={{ name: 'Conditions', path: '/conditions/' }}
  title="POTS App & Tracker: Stand Test, Heart Rate & Symptoms | Autonomic"
  description="A POTS tracker app that measures your standing heart rate rise, scores daily HRV against your own normal, finds your triggers and builds doctor reports."
/>

<FeatureHero crumb={{ label: 'Conditions', href: '/conditions/' }} here="POTS" badge="FOR POTS" name="Answers for life with POTS." tagline="Put numbers on what standing does to you.">
  <svelte:fragment slot="lead">Autonomic is a POTS tracker for iPhone and Android. Run a guided stand test, take a five-minute morning reading, log symptoms and triggers, and see what lines up with your better days. All of it stays on your phone.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-pots.webp);--pos:44% 50%" role="img" aria-label="A woman kneeling on the floor with one hand on the wall, about to stand up"><Phone w={270}><div class="v2-ph-full"><StandResultScreen time="9:12" /></div></Phone></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>30 bpm</b><em>the rise clinicians look for</em><span>Sustained, within ten minutes of standing (40 in teens). The stand test measures yours the same way every time.</span></div>
    <div class="v2-stat"><b>5 min</b><em>each morning</em><span>One still reading becomes your daily score, graded against your own normal rather than an athlete’s.</span></div>
    <div class="v2-stat"><b>Free</b><em>to capture, every time</em><span>Stand tests, episode captures and HRV readings run and save on every plan, so a test is never lost.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions POTS leaves you with, answered." sub="Each one is a part of the app. Tap a question to see how it works." items={answers} />

<Explainer tone="white" title="What POTS is, and why it is so hard to pin down.">
  <div class="v2-facts" slot="aside">
    <small>POTS at a glance</small>
    <dl>
      <div><dt>Heart rate rise</dt><dd>30+ bpm (40+ in teens)</dd></div>
      <div><dt>Within</dt><dd>10 minutes of standing</dd></div>
      <div><dt>Blood pressure</dt><dd>No large drop</dd></div>
      <div><dt>Symptoms for</dt><dd>3 months or more</dd></div>
    </dl>
    <a href="/insights/pots/how-pots-is-diagnosed/">How POTS is diagnosed →</a>
  </div>
  <p><strong>Postural orthostatic tachycardia syndrome (POTS)</strong> is a form of dysautonomia, a disorder of the autonomic nervous system: the part of you that runs heart rate, blood pressure, digestion and temperature without being asked. When most people stand, blood vessels in the legs and belly tighten within seconds and the heart speeds up by a few beats. In POTS that adjustment falls short, blood pools low in the body, and the heart races to make up the difference<Cite n={1} />.</p>
  <p>Clinicians look for a <strong>sustained heart rate rise of at least 30 beats per minute</strong> (40 in teenagers) within ten minutes of standing, without a large drop in blood pressure, alongside symptoms that have lasted at least three months<Cite n={[2, 3]} />. Lightheadedness, palpitations, brain fog, fatigue, nausea, shakiness and exercise intolerance are common, and many people notice their symptoms move with heat, meals, sleep and their menstrual cycle<Cite n={4} />. <a href="/insights/pots/how-pots-is-diagnosed/">How POTS is diagnosed</a> covers the criteria and the tests in full.</p>
  <h3>Why tracking POTS changes the conversation</h3>
  <p>POTS is a condition of patterns. A clinic visit sees one heart rate on one afternoon, while you live with the good mornings, the bad weeks and the slow drift in between. Symptoms are easy to dismiss and hard to describe, and memory is a poor record when brain fog is one of the symptoms. A tracker turns all of that into something you and your clinician can look at together:</p>
  <ul>
    <li><strong>A repeatable stand test</strong>, so “my heart races when I stand” becomes “my rise was 38 bpm in March and 27 bpm in June.”</li>
    <li><strong>A daily baseline</strong>, so a hard morning is read against your own normal, not a chart built for healthy athletes.</li>
    <li><strong>Treatments and triggers on the same timeline</strong>, so salt, fluids, compression, a medication change or a heatwave sit right beside the readings they might be moving.</li>
  </ul>
  <h3>What Autonomic will not do</h3>
  <p>It will not diagnose you, and it will never tell you to start, stop or change a treatment. It measures, organizes and points out patterns, and it is honest when it has nothing to say. The decisions stay with you and your clinician.</p>
  <div class="v2-note"><span>If you faint, have chest pain, or your symptoms change suddenly, seek medical care. Autonomic is not a medical device.</span></div>
  <Sources items={sources} />
</Explainer>

<TrackTable eyebrow="" title="What to track with POTS, and why." sub="The signals that move with POTS, and how each one reaches your journal with as little effort as possible." rows={track} />

<section class="v2-sec white">
  <div class="v2-wrap v2-split rev">
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><JournalScreen time="7:04" /></div></Phone></div>
    <div>
      <h2 class="v2-h2">Built for mornings that start slow.</h2>
      <p class="v2-sub">POTS is often <a class="v2-inl" href="/insights/pots/pots-symptoms-worse-in-the-morning/">worst first thing</a>, so the one daily habit is done lying down.</p>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>Before you get up</b>Take a five-minute reading lying still. Your score and plain guidance for the day are waiting before you stand.</span></li>
        <li><i>2</i><span><b>When the room tilts</b>Tap once on your watch to capture an episode: heart rate before, during and one minute after.</span></li>
        <li><i>3</i><span><b>Through the day</b>Water, salt, meds and symptoms in a couple of taps. Sleep, steps and workouts come in from Apple Health or Health Connect on their own.</span></li>
        <li><i class="hot">4</i><span><b>Over the weeks</b>Repeat the stand test, watch your rise and your baseline move, and see what lines up with your better days.</span></li>
      </ol>
    </div>
  </div>
</section>

<MidCta title="Run your first stand test tonight, free." sub="Stand tests and HRV readings are free on every plan, on iPhone and Android." />

<section class="v2-sec plum2">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2 on-dark">Your heart rate, the moment the room tilts.</h2>
      <p class="v2-sub on-dark">The Apple Watch app shows your heart rate and how fast it is moving, buzzes when it spikes, and runs the full stand test without your phone. On Android, a Bluetooth chest strap runs it in the app.</p>
      <a class="v2-link on-dark" href="/features/apple-watch/">Explore the Apple Watch app →</a>
    </div>
    <div class="v2-watchshot"><img src="/features/watch-stand-test.webp" width="410" height="502" alt="An Apple Watch mid stand test showing heart rate 114, up 31 from lying down" loading="lazy" /></div>
  </div>
</section>

<CompareTeaser slug="welltory" title="Choosing between Autonomic and Welltory?" sub="Welltory is a popular HRV app. For POTS, the difference is the stand test." keys={['Built for', 'Guided POTS stand test', 'Free HRV readings', 'Price']} />

<Founder />

<Faq title="POTS questions, answered" items={faq} />

<Related
  eyebrow=""
  title="About POTS"
  hub={{ label: 'All POTS articles', href: '/insights/pots/' }}
  items={[
    { q: 'How is POTS diagnosed?', slug: 'how-pots-is-diagnosed' },
    { q: 'How do I do a stand test at home?', slug: 'the-orthostatic-stand-test-at-home' },
    { q: 'What actually treats POTS?', slug: 'pots-treatment-salt-fluids-compression-medication' },
    { q: 'What sets off a flare, and how do I recover?', slug: 'pots-flare-up-triggers-and-recovery' },
    { q: 'Is it POTS or anxiety?', slug: 'is-it-pots-or-anxiety' }
  ]}
/>

<ConditionCards current="pots" />

<LatestArticles topic="pots" title="The latest on POTS" white />

<PageCta title="Your first stand test can be tonight." sub="Free on iPhone and Android. Stand tests and HRV readings are free on every plan." />
