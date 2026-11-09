<script lang="ts">
  import { pricing } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import Cite from '$lib/v2/Cite.svelte';
  import Sources from '$lib/v2/Sources.svelte';
  import { pickSources } from '$lib/v2/sources';
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['taskforce1996', 'davis2023', 'shaffer2017', 'umetani1998', 'nunan2010', 'plews2017', 'plews2013']);
  const about = ['Postural orthostatic tachycardia syndrome', 'Long COVID', 'Dysautonomia', 'Myalgic encephalomyelitis/chronic fatigue syndrome'];
  const features = ['Five-minute HRV readings with a phone camera, Apple Watch, Garmin watch or Bluetooth chest strap', 'Unlimited HRV readings on the free plan', 'RMSSD, SDNN, pNN50, heart rate and frequency-domain HRV', 'Readings graded against your own baseline', 'A daily journal of sleep, symptoms, triggers, medications and water', 'Crash warnings when your daily score slides', 'Imports from Apple Health and Health Connect'];
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import MidCta from '$lib/v2/MidCta.svelte';
  import QuestionGrid from '$lib/v2/QuestionGrid.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import JournalScreen from '$lib/v2/screens/JournalScreen.svelte';
  import JournalLogScreen from '$lib/v2/screens/JournalLogScreen.svelte';
  import DeviceCards from '$lib/v2/DeviceCards.svelte';
  import Explainer from '$lib/v2/Explainer.svelte';
  import TrackTable from '$lib/v2/TrackTable.svelte';
  import Related from '$lib/v2/Related.svelte';
  import MoreFeatures from '$lib/v2/MoreFeatures.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';
  import Faq from '$lib/v2/Faq.svelte';

  // "Am I about to crash?": the Journal on a sliding day, as the home page draws
  // it. HRV and sleep Compromised, resting HR Moderate, the downturn headline.
  const SLIDING_FIGS = [
    { text: '21', unit: 'ms', color: '#f97316', label: 'HRV' },
    { text: '76', unit: 'bpm', color: '#eab308', label: 'Resting HR' },
    { text: '5h 40m', color: '#f97316', label: 'Sleep' }
  ];
  const SLIDING_NOTICE = { emoji: '⚠️', text: 'Autonomic score trending down 12 points over the last 3 days', chevron: true };
  const devices = [
    { name: 'Phone camera', logos: ['camera'], tag: 'Good', body: 'Rest a fingertip lightly on the rear camera, flash on. Lightly matters: pressing hard squeezes out the very pulse it reads. Nothing to buy, iPhone or Android.' },
    { name: 'Apple Watch', logos: ['apple-watch'], tag: 'Better', body: 'Take the reading from your wrist with the companion app, and it lands in your journal when it finishes. Needs an iPhone.' },
    { name: 'Garmin watch', logos: ['garmin'], tag: 'Better', body: 'The Autonomic app for Garmin records every beat and sends them to your phone, on iPhone or Android.' },
    { name: 'Chest strap or band', logos: ['polar', 'coospo'], tag: 'Best', body: 'Beat-to-beat intervals over Bluetooth, the cleanest signal there is. Polar H10 and Coospo straps work, and so do Polar optical bands like the Verity Sense.' }
  ];
  const journal: [string, string, string][] = [
    ['Sleep', 'Short or broken nights show up in the next morning’s reading. The sleep report adds stages and your overnight heart rate dip.', 'From Apple Health or Health Connect on its own, or bed and wake typed in'],
    ['Symptoms', 'Dizziness, brain fog, palpitations, post-exertional malaise, blood pooling and dozens more, with when each one hit.', 'Built-in symptoms in two taps, plus any you create'],
    ['Triggers', 'Heat, caffeine, alcohol, histamine-heavy foods, large meals, stress and prolonged standing.', 'A trigger list built for dysautonomia, tapped in as they happen'],
    ['Meds and supplements', 'What you take, how much and when, so every start and stop has a date the app can test against.', 'Built-in or your own, with amount and time'],
    ['Water and meals', 'Hydration is one of the biggest levers with POTS, and the easiest to forget by the afternoon.', 'A glass at a tap toward a daily goal, meals in a couple more'],
    ['Digestion', 'Bowel movements by form, from hard to loose, and the gaps between them.', 'Graded by Bristol type, so a pattern is easy to see'],
    ['Cycle', 'Where you are in your cycle, so a premenstrual dip is read against your past cycles.', 'Flow in a couple of taps, or brought in from Health'],
    ['Blood pressure and resting heart rate', 'Both graded against medical thresholds, with the position you took them in.', 'Typed in from any cuff, or taken from your morning reading'],
    ['Activities and rest', 'Walks, workouts, errands, hot showers and legs up, with their heart rate.', 'Logged in a tap, or workouts imported with their full heart rate trace'],
    ['Clean days', 'The daily routine you are working on, and how often you actually keep it.', 'A checklist you set, which builds a streak']
  ];
  // The page's own sections, each as the question it answers.
  const answers = [
    { q: 'Is today a good day?', a: 'Your morning reading, last night’s sleep and your resting heart rate become one score out of 100, with a sentence of plain guidance.', feature: 'Autonomic Outlook', href: '#outlook' },
    { q: 'Do I need to buy anything?', a: 'No. Your phone camera takes the reading, and an Apple Watch, a Garmin or a chest strap makes it cleaner if you already own one.', feature: 'Four ways to measure', href: '#devices' },
    { q: 'What does my number actually mean?', a: 'RMSSD, SDNN and the rest, each graded against medical thresholds and against your own normal, with the beat-to-beat trace underneath.', feature: 'Every reading, graded', href: '#graded' },
    { q: 'What else is moving my numbers?', a: 'Sleep, symptoms, triggers, meds, water and more, logged in taps or brought in from Apple Health or Health Connect.', feature: 'The journal', href: '#journal' },
    { q: 'Am I about to crash?', a: 'Two checks run on your journal every day and flag a slide early, from your own numbers, never from one wobbly reading.', feature: 'Crash warnings', href: '#crash-warnings' },
    { q: 'Am I actually getting better?', a: 'Week, month and year views of every reading, showing the slow change you would never feel from one day to the next.', feature: 'Progress', href: '#progress', pro: true }
  ];
  const faq = [
    { q: 'How long does an HRV reading take?', a: 'Five minutes. Lie still and breathe normally, ideally right after you wake and before you get up. Your first reading of the day sets your daily score and your pacing budget.' },
    { q: 'Do I need a wearable to measure HRV?', a: 'No. Your phone camera can take the reading with a fingertip resting lightly on the lens. An Apple Watch, a Garmin watch or a Bluetooth chest strap gives a cleaner signal if you already own one.' },
    { q: 'Is HRV capture free?', a: 'Yes. Live HRV readings are unlimited on every device and every plan, with no daily cap. Pro is what the app makes of your readings over time: the long views, Insights, the pacing budget and AI reports.' },
    { q: 'What is a good HRV?', a: 'There is no single good number. HRV falls with age, differs between people several-fold, and depends on how it was measured. Autonomic grades each reading against medical thresholds and against your own recent normal, and the trend over weeks says more than any one morning.' },
    { q: 'What is the difference between a baseline and a training reading?', a: 'A baseline is five minutes breathing normally, first thing, and it is the heaviest single input to your daily score. A training reading is five minutes of paced breathing. It can lift your day by at most one grade above its baseline, and never hides a bad morning.' },
    { q: 'What happens if a reading comes out noisy?', a: 'The app grades its own signal. A reading with too much noise is never silently saved. If it is usable but rough, you are asked once, with the artifact rate in view. If it cannot be used, the app says why and what to try next, starting with the most likely cause.' },
    { q: 'Does Autonomic import HRV from Apple Health or Health Connect?', a: 'From Apple Health, yes, when the reading carries at least four minutes of real beat-to-beat data. Short background samples from a watch are kept out of your averages, because they are not comparable with a still five-minute reading. Health Connect on Android stores no beat-to-beat data, so on Android HRV is not imported: take your readings in the app instead.' }
  ];
</script>

<FeatureSeo
  {sources}
  {about}
  {features}
  name="Journal + HRV"
  path="/features/hrv-readings/"
  {faq}
  title="HRV App for POTS and Long COVID: Free, Any Device | Autonomic"
  description="Measure HRV in five minutes with your phone camera, Apple Watch, Garmin or a chest strap. Free and unlimited, scored against your own normal, private."
/>

<FeatureHero icon="journal" badge="FREE" name="Journal + HRV" tagline="Track your HRV in five minutes, on any device." note="Unlimited HRV capture is free, forever">
  <svelte:fragment slot="lead">One still reading a morning is what the whole app runs on. Take it with your phone camera, a watch or a strap, log the rest of your day around it, and see every number graded against your own normal rather than a chart built for athletes.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-hrv.webp);--pos:58% 40%" role="img" aria-label="A woman sitting on the edge of her bed in the morning, looking at her phone"><Phone w={270} src="/features/live-hrv.webp" alt="A live HRV reading: breathing rings, a timer, heart rate and SDNN" /></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>Free</b><em>unlimited, every device</em><span>No daily cap and no paywall on capture. Measure twice on the days worth measuring twice.</span></div>
    <div class="v2-stat"><b>5 min</b><em>one still reading a morning</em><span>Lying down, before you get up. It sets your score, your crash checks and your pacing budget.</span></div>
    <div class="v2-stat"><b>4 ways</b><em>to take it</em><span>Phone camera, Apple Watch, Garmin or a chest strap. Use what you already own.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions one morning reading answers." sub="Tap a question to jump to how Autonomic answers it." items={answers} />

<section class="v2-sec white" id="outlook">
  <div class="v2-wrap v2-split rev">
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><JournalScreen time="7:06" /></div></Phone></div>
    <div>
      <h2 class="v2-h2">Is today a good day? One score out of 100.</h2>
      <p class="v2-sub">Graded from Excellent to Severe, with a sentence that says what kind of day your body can handle. It is waiting for you before you stand up.</p>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>Baseline HRV leads</b>The day’s first still reading carries the most weight of anything in the score.</span></li>
        <li><i>2</i><span><b>Sleep, resting heart rate and blood pressure</b>Last night and this morning, each graded against medical thresholds.</span></li>
        <li><i>3</i><span><b>Training can lift it, a little</b>A paced breathing session can raise the day by one grade at most, so practice never hides a hard morning.</span></li>
      </ol>
      <p class="v2-fine">Symptoms, meals and digestion never move the score, so logging honestly never costs you points.</p>
    </div>
  </div>
</section>

<section class="v2-sec" id="devices">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Four ways to take the same HRV reading.</h2><p class="v2-sub">No new gadget required. If you own better hardware, the app will use it, and every reading lands in the same journal.</p></div>
    <DeviceCards {devices} />
    <p class="v2-fine hrv-center">Already measuring somewhere else? On iPhone, HRV from Apple Health comes in too, when it carries at least four minutes of real beat-to-beat data. Health Connect has no beat-to-beat data, so on Android readings are taken in the app. <a class="v2-inl" href="/insights/hrv/best-hrv-chest-strap-polar-h10-coospo-h808s/">Which chest strap to buy</a></p>
  </div>
</section>

<section class="v2-sec white" id="graded">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2">Not just a number. What the number means.</h2>
      <p class="v2-sub">RMSSD, SDNN, pNN50 and the frequency bands, each scored and coloured against medical thresholds, with the raw beat-to-beat trace underneath so you can see it for yourself.</p>
      <ol class="v2-numbered">
        <li><i>A</i><span><b>Baseline</b>Five minutes breathing normally, first thing. The one that sets your day.</span></li>
        <li><i>B</i><span><b>Training</b>Five minutes of paced breathing, when it feels good. A gentle workout for your autonomic system, and the reading that shows its spectral bands.</span></li>
        <li><i class="hot">C</i><span><b>Your own normal</b>Once you have a few mornings, each grade is also checked against your own usual. That check can only lower a grade, so a long bad stretch never starts reading as fine.</span></li>
      </ol>
    </div>
    <div class="v2-arch"><Phone w={260} src="/features/reading.webp" alt="A graded HRV reading: score, source, and the beat-to-beat interval trace" /></div>
  </div>
</section>

<Explainer title="What HRV is, and why it matters with dysautonomia.">
  <div class="v2-facts" slot="aside">
    <small>A good morning reading</small>
    <dl>
      <div><dt>When</dt><dd>Right after waking</dd></div>
      <div><dt>Position</dt><dd>Lying still</dd></div>
      <div><dt>Length</dt><dd>Five minutes</dd></div>
      <div><dt>Read it against</dt><dd>Your own trend</dd></div>
    </dl>
    <a href="/insights/basics/how-to-measure-hrv-accurately-at-home/">How to measure HRV at home →</a>
  </div>
  <p><strong>Heart rate variability (HRV)</strong> is the tiny variation in time between one heartbeat and the next. A healthy heart is not a metronome: it speeds up a little as you breathe in and slows as you breathe out, steered by the autonomic nervous system<Cite n={1} />. More of that variation usually means a more flexible, better-regulated system. Less of it usually means the system is stuck leaning toward “fight or flight.”</p>
  <p>That is why HRV matters so much with <a href="/conditions/dysautonomia/">dysautonomia</a>, <a href="/conditions/pots/">POTS</a> and <a href="/conditions/long-covid/">long COVID</a>. When the autonomic nervous system is the thing that is struggling, HRV is one of the few windows onto it you can open at home, every day, for free<Cite n={2} />. It often falls before a harder stretch and climbs, slowly, as recovery takes hold.</p>
  <h3>RMSSD, SDNN and the rest</h3>
  <p>The number worth watching day to day is <strong>RMSSD</strong>, the short-term, beat-to-beat signal of your rest-and-digest side. <strong>SDNN</strong> is broader, closer to your overall capacity<Cite n={3} />. Autonomic computes both, plus pNN50, heart rate, and the frequency bands that paced breathing brings out, and grades each one so you are not left decoding milliseconds on your own.</p>
  <h3>Why your own normal beats any chart</h3>
  <p>There is no universal “good HRV.” It falls with age<Cite n={4} />, differs between healthy people several-fold<Cite n={5} />, and depends heavily on how it was measured<Cite n={6} />, which is why the charts online so rarely help. <a href="/insights/hrv/hrv-normal-range-by-age/">HRV by age</a> explains the ranges, and why the spread inside any age band is wider than the gap between them. What matters is your reading against your own recent mornings, measured the same way each time, and the direction it travels over weeks<Cite n={7} />.</p>
  <h3>Why first thing in the morning</h3>
  <p>The morning reading captures how well you recovered overnight, under the one set of conditions you can repeat every day: lying still, before coffee, before the day has happened to you. That repeatability is what makes Tuesday comparable with Friday. <a href="/insights/hrv/best-time-of-day-to-measure-hrv/">Why the morning reading wins</a> goes deeper.</p>
  <h3>Why it took a dedicated app</h3>
  <p>Fitness trackers grade HRV for athletes chasing a training load. Autonomic was built for people whose question is whether they can get through the day, so the thresholds, the warnings and the advice are written for recovery, not performance. And every reading stays on your phone.</p>
  <div class="v2-note"><span>HRV is a signal, not a diagnosis. Medications like beta blockers, illness, alcohol and a bad night all move it. Autonomic does not diagnose or treat, and it never tells you to start, stop or change a treatment.</span></div>
  <Sources items={sources} />
</Explainer>

<TrackTable id="journal" tone="white" title="Everything you can log" head={['Log', 'What it can tell you', 'How it gets in']} rows={journal}>
  <div class="v2-split rev jl-lead" slot="lead">
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><JournalLogScreen /></div></Phone></div>
    <div>
      <h2 class="v2-h2">Everything else that moves your numbers.</h2>
      <p class="v2-sub">Log the rest of your day in taps, not paragraphs: symptoms, meds, water, triggers, activities and more, each with the time it happened. Much of it arrives from Apple Health or Health Connect on its own, so the days you have no energy to log still count.</p>
    </div>
  </div>
</TrackTable>

<section class="v2-sec plum2" id="crash-warnings">
  <div class="v2-wrap v2-split">
    <div>
      <p class="cw-tag"><i class="v2-freepill">FREE</i></p>
      <h2 class="v2-h2 on-dark">Am I about to crash? An early flag, from your own numbers.</h2>
      <p class="v2-sub on-dark">Two checks run on your journal every day. When either has something to say, the Journal says it in one plain sentence and shows you what moved.</p>
      <ul class="cw">
        <li><b>When your score slides</b>If your daily score has been trending down for several days, you see it with the points and the days, and you can get a notification the morning a slide starts.</li>
        <li><b>Before the score moves</b>Resting and overnight heart rate, your standing rise, recovery after a workout and your symptom load are each compared with your own last six weeks. Two have to drift together before it speaks.</li>
        <li><b>Never one wobbly number</b>A single noisy reading never raises it. It stays quiet on an Excellent day, and when your cycle explains a dip, it says that instead.</li>
      </ul>
      <p class="v2-fine on-dark">An early flag, not a prediction. It can be wrong, and it never replaces how you feel.</p>
    </div>
    <div class="v2-arch dark"><Phone w={260}><div class="v2-ph-full"><JournalScreen time="7:12" battery={0.8} score={61} grade="Moderate" gradeRgb="234,179,8" delta={-12} confidence={90} guide="Reduced reserves. Keep the day easy and stay with the basics of your protocol. Lean on hydration, pacing, and rest, and hold back on anything demanding." figs={SLIDING_FIGS} notice={SLIDING_NOTICE} /></div></Phone></div>
  </div>
</section>

<MidCta title="Measure your HRV free, as often as you like." sub="No wearable needed, no account. Your phone camera is enough, on iPhone and Android." />

<section class="v2-sec white" id="progress">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2">Weeks of readings, one honest HRV trend.</h2>
      <p class="v2-sub">Day, week, month and year, or any range you pick, split by baseline and training, with grade zones you can switch on. It is the view that shows slow change you would never feel day to day.</p>
      <p class="v2-fine">The last 14 days are free. Week, month, year and your full history are part of Pro, and every install starts with {pricing.trialDays} days of it.</p>
      <a class="v2-link" href="/insights/hrv/hrv-baseline-how-to-build-and-use-it/">How to build and use an HRV baseline →</a>
    </div>
    <div class="v2-arch"><Phone w={260} src="/features/analysis.webp" alt="Progress charts of SDNN and RMSSD over two weeks" /></div>
  </div>
</section>

<Faq title="HRV questions, answered" items={faq} />
<Related
  eyebrow=""
  title="About HRV"
  hub={{ label: 'All HRV articles', href: '/insights/hrv/' }}
  items={[
    { q: 'How do I measure HRV properly at home?', slug: 'how-to-measure-hrv-accurately-at-home' },
    { q: 'What is a normal HRV for my age?', slug: 'hrv-normal-range-by-age' },
    { q: 'Why is my HRV low?', slug: 'why-is-my-hrv-low' },
    { q: 'What is a baseline and how do I build one?', slug: 'hrv-baseline-how-to-build-and-use-it' },
    { q: 'How does Autonomic score my readings?', slug: 'how-autonomic-scores-your-readings' }
  ]}
/>
<MoreFeatures current="hrv-readings" />
<PageCta title="Take your first reading tomorrow morning." sub="Free on iPhone and Android. Your phone camera is enough." />

<style>
  .cw-tag { margin: 0 0 16px; }
  .cw-tag .v2-freepill { margin-left: 0; font-size: 12px; padding: 3px 10px; }
  .jl-lead { margin-bottom: 48px; }
  .hrv-center { text-align: center; max-width: 720px; margin: 28px auto 0; }
  .cw { list-style: none; padding: 0; margin: 28px 0 0; display: grid; gap: 10px; }
  .cw li { background: rgba(255,255,255,.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); border-radius: 20px; padding: 18px 20px; color: #cbbfd3; font-size: 15.5px; line-height: 1.5; }
  .cw b { display: block; color: #fff; font-size: 18px; font-weight: 800; letter-spacing: -.015em; margin-bottom: 3px; }
</style>
