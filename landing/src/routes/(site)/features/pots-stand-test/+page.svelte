<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import Cite from '$lib/v2/Cite.svelte';
  import Sources from '$lib/v2/Sources.svelte';
  import { pickSources } from '$lib/v2/sources';
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['vernino2021', 'sheldon2015', 'freeman2011', 'raj2020']);
  const about = ['Postural orthostatic tachycardia syndrome', 'Orthostatic intolerance', 'Orthostatic hypotension'];
  const features = ['A guided stand test: five minutes lying, ten minutes standing', 'Heart rate rise measured minute by minute', 'Runs on Apple Watch or a Bluetooth chest strap', 'POTS episode capture for stairs and sit-to-stand moments', 'Manual entry of a stand test', 'Every test charted over time', 'Results in a summary for your doctor'];
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import MidCta from '$lib/v2/MidCta.svelte';
  import QuestionGrid from '$lib/v2/QuestionGrid.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import StandResultScreen from '$lib/v2/screens/StandResultScreen.svelte';
  import PotsProgressScreen from '$lib/v2/screens/PotsProgressScreen.svelte';
  import DeviceCards from '$lib/v2/DeviceCards.svelte';
  import Explainer from '$lib/v2/Explainer.svelte';
  import TrackTable from '$lib/v2/TrackTable.svelte';
  import Related from '$lib/v2/Related.svelte';
  import MoreFeatures from '$lib/v2/MoreFeatures.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';
  import Faq from '$lib/v2/Faq.svelte';

  const path = '/features/pots-stand-test/';
  const CHECK = '<svg class="v2-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';
  // The sample result both phones show (StandResultScreen: 68 supine, 115
  // peak, +47 at the peak, +45 held over the final minute).
  const result = [
    ['Resting rate', 'Lying still, before you stand', '68 bpm', 'n'],
    ['Standing peak', 'The highest beat on your feet', '115 bpm', 'n'],
    ['Peak rise', 'The largest jump above resting', '+47 bpm', ''],
    ['Sustained rise', 'The rise that held, flagged at 30 or more', '+45 bpm', '']
  ];
  const read: [string, string, string][] = [
    ['Resting rate', 'Your starting line. The rise is measured from here, so a rushed rest makes every number after it look bigger.', 'The five minutes lying still, timed for you'],
    ['Peak rise', 'The largest jump above your resting rate at any moment on your feet. A single spike, on its own, says less than it looks.', 'Shown on the result, beside the curve it came from'],
    ['Sustained rise', 'The rise that holds rather than spikes. A sustained rise of 30 bpm or more (40 in teens) is the line clinicians look for.', 'Checked against that line and flagged on the result'],
    ['Minute by minute', 'Whether your heart settles, keeps climbing or stays high across the ten minutes.', 'The full heart rate curve, with your rise at each minute'],
    ['Blood pressure', 'A drop of 20 systolic or 10 diastolic within three minutes points to orthostatic hypotension rather than POTS.', 'The test reads heart rate; log a cuff reading beside it'],
    ['Your trend', 'One test is a snapshot. The same test repeated over weeks shows which way you are heading.', 'Every result kept, and read by cycle phase if you track one']
  ];
  // The page's own sections, each as the question it answers.
  const answers = [
    { q: 'How do I do a stand test at home?', a: 'Five minutes lying, ten standing, guided by your watch or a chest strap, so it runs the same way every time.', feature: 'The protocol', href: '#protocol' },
    { q: 'What did my heart actually do?', a: 'Your resting rate, standing peak, the largest rise and the rise that held, minute by minute.', feature: 'Your result', href: '#result' },
    { q: 'What happened on the stairs?', a: 'One tap captures your heart rate before a move, right after it and a minute later.', feature: 'Episode capture', href: '#episodes' },
    { q: 'Is my rise over the POTS line?', a: 'What each number on the result can tell you, including the 30 bpm sustained rise clinicians look for.', feature: 'Reading your result', href: '#reading' },
    { q: 'Is this the same as a tilt table?', a: 'What an active stand test is, how it differs from a tilt table, and how to get a clean result.', feature: 'The test explained', href: '#about' },
    { q: 'Will I lose a test if I do not pay?', a: 'Never. Every test and episode runs, syncs and saves on every plan. Pro is what reads it back.', feature: 'Free to capture', href: '#free' }
  ];
  const runsOn = [
    { name: 'Apple Watch', logos: ['apple-watch'], body: 'Guided by taps on your wrist, so you never touch your phone or watch a clock. Needs an iPhone.' },
    { name: 'Chest strap', logos: ['polar', 'coospo'], body: 'A Polar H10, a Coospo or any Bluetooth heart rate strap, run in the app on iPhone or Android.' }
  ];
  const faq = [
    { q: 'How do I do a POTS stand test at home?', a: 'Lie still for five minutes so your resting heart rate settles, then stand up and stay still for ten minutes while your heart rate is recorded. Autonomic guides the whole test on an Apple Watch or a Bluetooth chest strap, tells you when to stand and when you are done, and saves the rise minute by minute. Have someone nearby, and sit or lie down at once if you feel faint.' },
    { q: 'What stand test result suggests POTS?', a: 'Clinicians look for a sustained heart rate rise of at least 30 beats per minute within ten minutes of standing in adults (40 in teenagers), without a large drop in blood pressure, alongside symptoms that have lasted at least three months. A home result over that line is a reason to talk to your clinician, not a diagnosis.' },
    { q: 'Is a home stand test as good as a tilt table test?', a: 'They answer slightly different questions. A tilt table holds you still at an angle while blood pressure is tracked beat by beat, which can bring out patterns an ordinary stand hides. An active stand test is simpler and is also used in clinics. At home its strength is that you can repeat it the same way every week. It does not replace clinical testing.' },
    { q: 'What do I need?', a: 'An Apple Watch with an iPhone, or a Bluetooth chest strap such as a Polar H10 on iPhone or Android. You can also type in a test you did by hand.' },
    { q: 'Does it measure blood pressure?', a: 'No. The stand test reads heart rate. Telling POTS apart from orthostatic hypotension needs blood pressure too, so if you have a cuff, take readings lying and after standing and log them beside the test.' },
    { q: 'How often should I repeat it?', a: 'Weekly is a good rhythm, or a few times a week while you are tracking a change. Test at the same time of day under the same conditions, for example before caffeine or breakfast, so each result is comparable with the last.' },
    { q: 'Is the stand test free?', a: `Every stand test and episode capture runs, syncs and saves on every plan, so a test is never lost. Reading the result is part of Autonomic Pro (${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year), and every install starts with ${pricing.trialDays} days of Pro.` }
  ];
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to do a POTS stand test at home',
      totalTime: 'PT15M',
      tool: [{ '@type': 'HowToTool', name: 'Apple Watch or Bluetooth chest strap' }],
      step: [
        { '@type': 'HowToStep', name: 'Lie still', text: 'Lie down and rest quietly for five minutes so your resting heart rate settles.' },
        { '@type': 'HowToStep', name: 'Stand up', text: 'When cued, stand up and stay still, without walking or leaning.' },
        { '@type': 'HowToStep', name: 'Hold still for ten minutes', text: 'Your heart rate is recorded minute by minute while you stand.' },
        { '@type': 'HowToStep', name: 'Read your rise', text: 'Compare your standing heart rate with your resting rate. A sustained rise of 30 bpm or more (40 in teens) is the threshold clinicians look for.' }
      ]
    }
  ];
</script>

<FeatureSeo
  {sources}
  {about}
  {features}
  name="POTS stand test"
  {path}
  {faq}
  {ld}
  title="POTS Stand Test App: Measure Your Heart Rate Rise | Autonomic"
  description="A guided at-home POTS stand test on Apple Watch, a chest strap or by hand: five minutes lying, ten standing, your heart rate rise minute by minute."
/>

<FeatureHero icon="stand" badge="FREE TO CAPTURE" name="POTS stand test" tagline="Measure your heart rate rise at home.">
  <svelte:fragment slot="lead">Why does your heart race when you stand up? Stop guessing. A guided test on your Apple Watch or chest strap puts a repeatable number on it, so you can follow it for months and bring it to your clinician.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-pots.webp);--pos:44% 50%" role="img" aria-label="A woman kneeling on the floor with one hand on the wall, about to stand up"><Phone w={270}><div class="v2-ph-full"><StandResultScreen time="9:12" /></div></Phone></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>15 min</b><em>start to finish</em><span>Five minutes lying still, ten standing, with a cue for every step. You never watch a clock.</span></div>
    <div class="v2-stat"><b>30 bpm</b><em>the line it checks</em><span>Your sustained rise is checked against the threshold clinicians use, and saved with the whole curve.</span></div>
    <div class="v2-stat"><b>Free</b><em>to capture, every time</em><span>Tests and episodes run, sync and save on every plan. Pro is what reads the results.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions a stand test answers." sub="Tap a question to jump to how Autonomic answers it." items={answers} />

<section class="v2-sec white" id="protocol">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Fifteen minutes, guided the whole way.</h2><p class="v2-sub">The same active stand test many clinics run, done the same way every time, so this week’s result can be held up against last month’s.</p></div>
    <div class="v2-timeline">
      <div style="flex:5"><b>Lie still</b><span>5 minutes</span><small>Your resting rate settles and is captured. Rushing this part makes every number after it look bigger.</small></div>
      <div class="hot" style="flex:10"><b>Stand up, stay still</b><span>10 minutes</span><small>Your rise is tracked minute by minute. You are told when to stand and when you are done. If you feel faint, sit or lie down at once.</small></div>
    </div>
    <div class="st-runs"><DeviceCards devices={runsOn} /></div>
    <p class="v2-fine st-hand">Or type in a test you did by hand, from any heart rate monitor.</p>
  </div>
</section>

<section class="v2-sec" id="result">
  <div class="v2-wrap v2-split rev">
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><StandResultScreen time="9:14" scrolled /></div></Phone></div>
    <div>
      <h2 class="v2-h2">Every number your clinician will ask for.</h2>
      <p class="v2-sub">Your resting rate, your standing peak, the largest rise and the rise that held, with your rise at each minute and the full heart rate curve underneath.</p>
      <div class="v2-spend">
        {#each result as r}
          <div><span><b>{r[0]}</b><small>{r[1]}</small></span><em class:n={r[3] === 'n'}>{r[2]}</em></div>
        {/each}
      </div>
      <p class="v2-fine">Sample result. Reading your results is part of Pro; the test itself is saved on every plan.</p>
    </div>
  </div>
</section>

<section class="v2-sec white" id="trend">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2">One test is a snapshot. Eight are a direction.</h2>
      <p class="v2-sub">Repeat it weekly under the same conditions and Progress lines every result up on one chart, so you and your clinician can see which way it is heading, even while you are still over the line.</p>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>Directly comparable</b>The same protocol every time, so this week and last month are measured the same way.</span></li>
        <li><i>2</i><span><b>Sustained and peak</b>Both rises across every test, with how many met the POTS threshold.</span></li>
        <li><i class="hot">3</i><span><b>Said in plain words</b>“Sustained rise improved 13 bpm across 8 tests in this range.”</span></li>
      </ol>
      <p class="v2-fine">Sample journal. Week, month and year views are part of Pro.</p>
    </div>
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><PotsProgressScreen /></div></Phone></div>
  </div>
</section>

<section class="v2-sec" id="episodes">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2">Catch an episode as it happens.</h2>
      <p class="v2-sub">Symptoms rarely wait for a test. Tap once on the stairs or as you get up, and your heart rate is captured before the move, right after it, and one minute later, so you can see how far it jumped and how fast it came back.</p>
      <div class="v2-works"><span>Moments</span><em>Lying to standing</em><em>Sitting to standing</em><em>Climbing stairs</em></div>
      <p class="v2-fine">On Apple Watch, or in the app with a chest strap. Heart rate only, never a diagnosis.</p>
    </div>
    <div class="v2-watchshot"><img src="/features/watch-stand-test.webp" width="410" height="502" alt="An Apple Watch mid stand test showing heart rate 114, up 31 from lying down" loading="lazy" /></div>
  </div>
</section>

<MidCta title="Run your first stand test, free." sub="Every test and episode is captured and saved on every plan. On iPhone and Android." />

<TrackTable eyebrow="" id="reading" tone="white" title="How to read a stand test, number by number." sub="What each part of the result can tell you, and where Autonomic shows it." head={['Number', 'What it can tell you', 'Where you see it']} rows={read} />

<Explainer id="about" title="What a stand test is, and what it is not.">
  <div class="v2-facts" slot="aside">
    <small>The stand test at a glance</small>
    <dl>
      <div><dt>Lying</dt><dd>5 minutes</dd></div>
      <div><dt>Standing</dt><dd>10 minutes</dd></div>
      <div><dt>POTS line</dt><dd>30+ bpm (40+ in teens)</dd></div>
      <div><dt>Repeat</dt><dd>Weekly, same conditions</dd></div>
    </dl>
    <a href="/insights/pots/the-orthostatic-stand-test-at-home/">The full at-home guide →</a>
  </div>
  <p>A stand test, sometimes called an <strong>active stand test</strong> or orthostatic test, measures what happens to your heart rate when you go from lying down to standing still. For most people the heart speeds up by a few beats and settles. In <a href="/conditions/pots/">POTS</a>, blood pools low in the body and the heart races to make up for it, so the rise is bigger and it holds<Cite n={1} />.</p>
  <p>Clinicians look for a <strong>sustained rise of at least 30 beats per minute</strong> within ten minutes of standing (40 in teenagers), without a large drop in blood pressure, alongside symptoms that have lasted at least three months<Cite n={[2, 3]} />. That is why the test runs for a full ten minutes: a spike in the first seconds is common, and what matters is the rise that stays.</p>
  <h3>Stand test or tilt table?</h3>
  <p>A <a href="/insights/pots/tilt-table-test-what-to-expect/">tilt table test</a> straps you to a table that tips you upright to around 60 to 70 degrees while blood pressure is tracked beat by beat. Because the table holds you still, it takes away the leg-muscle pumping that can mask symptoms. An active stand is simpler<Cite n={4} />, and it is the one you can repeat at home, every week, the same way. They are complementary: a home record can help you and your clinician decide what to test next.</p>
  <h3>How to get a clean result</h3>
  <ul>
    <li><strong>Same time, same conditions.</strong> Test at roughly the same time of day, for example before caffeine or breakfast, so each result can be compared with the last.</li>
    <li><strong>Really rest first.</strong> The five minutes lying down are half the measurement. Talking, scrolling or getting up early all inflate the rise.</li>
    <li><strong>Stand still.</strong> No walking, leaning or shifting. Walking is exercise, and exercise raises heart rate on its own.</li>
    <li><strong>Note how you felt.</strong> Log dizziness, palpitations or the urge to sit alongside the result. The number and the symptoms belong together.</li>
  </ul>
  <h3>What a home test can and cannot tell you</h3>
  <p>It can put a repeatable number on what standing does to you, show whether that number is moving, and give your clinician a record from your real life instead of one afternoon in a clinic. It cannot diagnose POTS, rule other causes out, or tell <a href="/insights/pots/orthostatic-hypotension-vs-pots/">POTS from orthostatic hypotension</a> on its own, because that takes blood pressure too<Cite n={3} />.</p>
  <div class="v2-note"><span>Have someone nearby the first few times. If you feel faint, sit or lie down straight away: the test is information, not a challenge to push through. Autonomic is not a medical device.</span></div>
  <Sources items={sources} />
</Explainer>

<section class="v2-sec plum2" id="free">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2 on-dark">A test you cannot reschedule should never be locked.</h2><p class="v2-sub on-dark">An episode on the stairs happens once. So every stand test and episode runs, syncs and saves on every plan, and nothing you measured is ever lost. Pro is what reads it back.</p></div>
    <div class="v2-verdicts">
      <div class="v2-verdict">
        <small>Free, on every plan</small>
        <b>Every test, captured and kept.</b>
        <ul>
          <li>Guided stand tests on Apple Watch or a chest strap</li>
          <li>Episode captures on the stairs or as you get up</li>
          <li>Tests typed in by hand</li>
          <li>Every result saved, synced and in your export</li>
        </ul>
      </div>
      <div class="v2-verdict us">
        <small>Pro</small>
        <b>Every test, read back to you.</b>
        <ul>
          <li>{@html CHECK}Resting rate, peak, peak rise and sustained rise</li>
          <li>{@html CHECK}Your rise minute by minute, with the full curve</li>
          <li>{@html CHECK}Results by cycle phase, if you track your cycle</li>
          <li>{@html CHECK}Your tests in your AI doctor summary</li>
        </ul>
      </div>
    </div>
    <p class="v2-fine on-dark center-fine">Every install starts with {pricing.trialDays} days of Pro, with no card. <a class="v2-inl" href="/pricing/">See all pricing</a>.</p>
  </div>
</section>

<Faq title="Stand test questions, answered" items={faq} />

<Related
  eyebrow=""
  title="About standing tests"
  hub={{ label: 'All POTS articles', href: '/insights/pots/' }}
  items={[
    { q: 'How do I do a stand test at home?', slug: 'the-orthostatic-stand-test-at-home' },
    { q: 'How is POTS diagnosed?', slug: 'how-pots-is-diagnosed' },
    { q: 'Is it POTS or anxiety?', slug: 'is-it-pots-or-anxiety' },
    { q: 'What happens in a tilt table test?', slug: 'tilt-table-test-what-to-expect' },
    { q: 'Is it orthostatic hypotension or POTS?', slug: 'orthostatic-hypotension-vs-pots' },
    { q: 'What can I do when the spike hits?', slug: 'counterpressure-maneuvers-pots-orthostatic-intolerance' }
  ]}
/>
<MoreFeatures current="pots-stand-test" />
<PageCta title="Find out what standing does to your heart." sub="Free on iPhone and Android. {pricing.trialDays} days of Pro to read your results." />

<style>
  .st-runs { max-width: 760px; margin: 32px auto 0; }
  .st-hand { text-align: center; }
  .v2-spend em.n { color: var(--ink); }
  .center-fine { text-align: center; margin-top: 24px; }
  /* The light card sits in a dark section here, which it would inherit white text from. */
  .v2-verdict:not(.us) { color: var(--ink); }
</style>
