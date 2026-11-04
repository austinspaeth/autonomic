<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import Cite from '$lib/v2/Cite.svelte';
  import Sources from '$lib/v2/Sources.svelte';
  import { pickSources } from '$lib/v2/sources';
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['iom2015', 'lillie2011', 'benjamini1995']);
  const about = ['Postural orthostatic tachycardia syndrome', 'Long COVID', 'Myalgic encephalomyelitis/chronic fatigue syndrome'];
  const features = ['Tests what you take and do against your HRV, sleep, daily score and symptoms', 'Before-and-after changes since you started or stopped something', 'False discovery rate correction, so patterns found by chance are not reported', 'Best versus hardest weeks', 'Links between barometric pressure and your symptoms', 'Cycle-aware analysis'];
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import MidCta from '$lib/v2/MidCta.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import InsightsTabScreen from '$lib/v2/screens/InsightsTabScreen.svelte';
  import JournalScreen from '$lib/v2/screens/JournalScreen.svelte';
  import ChangeSheetScreen from '$lib/v2/screens/ChangeSheetScreen.svelte';
  import InsightsEmptyScreen from '$lib/v2/screens/InsightsEmptyScreen.svelte';
  import QuestionGrid from '$lib/v2/QuestionGrid.svelte';
  import Explainer from '$lib/v2/Explainer.svelte';
  import Related from '$lib/v2/Related.svelte';
  import MoreFeatures from '$lib/v2/MoreFeatures.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';
  import Faq from '$lib/v2/Faq.svelte';

  const answers = [
    { q: 'Is magnesium even helping?', a: 'Start something and keep it up, and Insights compares the stretch before with the stretch after, naming anything else that changed at the same time.', feature: 'Biggest change', href: '#changes' },
    { q: 'What lines up with my bad days?', a: 'Every habit, trigger, med and symptom you log is tested against your HRV, sleep, symptoms and score, and ranked by the gap it makes.', feature: 'Correlations', href: '#finds' },
    { q: 'Is it getting better or worse?', a: 'Your key metrics, this month against last, compared on medians so one odd morning cannot swing the answer.', feature: 'Trend watch', href: '#changes' },
    { q: 'What was different about my good weeks?', a: 'Your best weeks laid beside your hardest: how you slept, what you logged and what you took in each. A description, never a verdict.', feature: 'Best vs hardest weeks', href: '#changes' },
    { q: 'Am I paying for something that does nothing?', a: 'Supplements with plenty of data and no link to anything you track are listed plainly. Worth knowing when you next review them with your clinician.', feature: 'No detected impact', href: '#changes' },
    { q: 'Is the weather part of it?', a: 'Pressure is recorded quietly. Only if your own data ties low-pressure days to harder ones does it appear, and then the Journal warns you on the next one.', feature: 'Barometric pressure', href: '#weather' }
  ];
  const rows = [
    { d: 'Legs up after lunch', m: 'RMSSD', v: '+6 ms', w: 74, g: true },
    { d: 'Electrolytes every morning', m: 'Daily score', v: '+5 pts', w: 62, g: true },
    { d: 'In bed before 11pm', m: 'RMSSD next day', v: '+3 ms', w: 40, g: true },
    { d: 'Coffee after 2pm', m: 'Sleep quality', v: '−5 pts', w: 62, g: false }
  ];
  const rules = [
    ['Your data, your baseline', 'Every finding comes from your own journal, including the types you created yourself. Nothing is compared to a population.'],
    ['Corrected for chance', 'Test enough things and some look linked by luck. Every sweep is statistically corrected, and measured against journals of pure noise.'],
    ['Calendar effects removed', 'If you started something the same month you got worse, that is not a finding. A link has to hold up within its own month.'],
    ['Linked, never proven', 'Insights says what lines up. It never says what caused what, and nothing here is a reason to start or stop a medication.']
  ];
  // The Journal on a low-pressure morning, wearing the warning card the app
  // raises once a link is found (lib/insights/pressureCopy.ts pressureWarning).
  const LOW_PRESSURE_FIGS = [
    { text: '24', unit: 'ms', color: '#eab308', label: 'HRV' },
    { text: '72', unit: 'bpm', color: '#eab308', label: 'Resting HR' },
    { text: '7h 05m', color: '#16a34a', label: 'Sleep' }
  ];
  const LOW_PRESSURE_NOTICE = { emoji: '⚠️', text: 'Barometric pressure is low today. On days like this your symptom load runs 1.3 higher.', chevron: true };
  const faq = [
    { q: 'How long before Insights finds anything?', a: 'Early signals can appear after about two weeks of logging, clearly labelled as early. Stronger findings need more days, and they firm up as your journal passes a month. Until then the screen tells you how many days you have and what arrives next.' },
    { q: 'Does a finding mean one thing causes another?', a: 'No. Insights reports what lines up with what in your own journal. A link can come from something you did not log, so it is a lead to explore, ideally with your clinician, not proof.' },
    { q: 'Can it test my own supplements, triggers and symptoms?', a: 'Yes. Anything you log is tested, including types you created yourself. A med or supplement you started and kept taking is compared before and after, rather than day by day.' },
    { q: 'Why does Insights sometimes find nothing?', a: 'Because nothing in your journal cleared the bar yet. Every sweep is corrected for chance, and an empty report is a real answer rather than a failure. Logging the same things consistently is what gives it something to find.' },
    { q: 'Is my data sent anywhere to find these patterns?', a: 'No. Every test runs on your phone. Nothing is uploaded, and there is no account.' },
    { q: 'Should I stop a supplement that shows no detected impact?', a: 'That is a decision for you and your clinician, never the app. No detected impact means your journal shows no link to anything you track, which is useful to bring to that conversation, and nothing in Insights is a reason to start or stop a medication.' },
    { q: 'Is Insights free?', a: `Insights is part of Autonomic Pro, ${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year. Every install starts with ${pricing.trialDays} days of Pro, with no card, and logging everything Insights reads from is free forever.` }
  ];
</script>

<FeatureSeo
  {sources}
  {about}
  {features}
  name="Insights"
  path="/features/insights/"
  {faq}
  title="Find What Helps Your POTS and Long COVID: Insights | Autonomic"
  description="Autonomic tests what you take and do against your own HRV, sleep and symptoms, and shows what lines up with your better days. Private and honest."
/>

<FeatureHero icon="insights" badge="PRO" name="Insights" tagline="Find what helps your POTS and long COVID.">
  <svelte:fragment slot="lead">Did that supplement actually help? Autonomic tests everything you log against your own readings and tells you what holds up, with the evidence one tap away. All of it runs on your phone, and it would rather say nothing than say something false.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-insights.webp);--pos:36% 40%" role="img" aria-label="A woman at her kitchen table with a cup of tea, studying her phone"><Phone w={270}><div class="v2-ph-full"><InsightsTabScreen /></div></Phone></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>2 weeks</b><em>to the first hints</em><span>Early signals arrive at about two weeks of logging, labelled as early, and firm up as your journal grows.</span></div>
    <div class="v2-stat"><b>No guesses</b><em>only patterns that hold up</em><span>Insights only shows a link when your own data backs it up. If nothing stands out yet, it tells you so instead of guessing.</span></div>
    <div class="v2-stat"><b>On device</b><em>every test, every finding</em><span>Your journal is analyzed on your phone, not on a server. Nothing about it is uploaded to find your patterns.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions only your own data can answer." sub="You have tried so many things. Insights is how you find out which of them line up with your better days." items={answers} />

<section class="v2-sec white" id="finds">
  <div class="v2-wrap v2-split wide">
    <div>
      <h2 class="v2-h2">Your habits, ranked by what they line up with.</h2>
      <p class="v2-sub">Each row is the gap between the days you did it and the days you did not, in the metric’s own unit. A link that shows up the next day says so. Tap any row and you see the chart it came from, with the days it was present shaded in.</p>
      <p class="v2-fine">Sample journal. An empty report is a real answer, not a failure.</p>
    </div>
    <div class="v2-corr">
      {#each rows as r}
        <div><span><b>{r.d}</b><small>{r.m}</small></span><i><u style="width:{r.w}%" class:neg={!r.g}></u></i><em class:g={r.g} class:r={!r.g}>{r.v}</em></div>
      {/each}
    </div>
  </div>
</section>

<section class="v2-sec" id="rules">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">It would rather say nothing than say something false.</h2><p class="v2-sub">Being wrong about your body is expensive. These rules run on every report.</p></div>
    <div class="v2-g4">
      {#each rules as r}<div class="v2-devcard"><b>{r[0]}</b><span>{r[1]}</span></div>{/each}
    </div>
  </div>
</section>

<MidCta title="Try Insights free for {pricing.trialDays} days." sub="No card, no account. Every test runs on your phone, on iPhone and Android." />

<section class="v2-sec lilac" id="changes">
  <div class="v2-wrap v2-split rev">
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><ChangeSheetScreen /></div></Phone></div>
    <div>
      <h2 class="v2-h2">The whole picture of what changed, and what did not.</h2>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>Biggest change</b>What moved most since you started or stopped something, with what else changed in the same stretch, so a change is never pinned on the wrong thing.</span></li>
        <li><i>2</i><span><b>Trend watch</b>Your key metrics, this month against last, on medians rather than averages.</span></li>
        <li><i>3</i><span><b>Best vs hardest weeks</b>What your good weeks had in common, laid beside your hard ones.</span></li>
        <li><i>4</i><span><b>No detected impact</b>The supplements with enough data that show no link to anything you track. Useful to know, and possibly cheaper.</span></li>
        <li><i class="hot">5</i><span><b>Early signals and unconfirmed patterns</b>Weaker leads, kept apart from the findings and labelled for what they are.</span></li>
      </ol>
      <p class="v2-fine">Your findings can go straight into an <a class="v2-inl" href="/features/doctor-reports/">AI report</a> for your next appointment.</p>
    </div>
  </div>
</section>

<section class="v2-sec" id="first-weeks">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2">Honest from your first day.</h2>
      <p class="v2-sub">Insights never invents a finding to fill the screen. Until there are enough days to compare, it shows how far you are from the first one, and what to log to get there sooner.</p>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>From day one</b>A countdown to fourteen logged days, and the supplements that are almost testable.</span></li>
        <li><i>2</i><span><b>Around two weeks</b>The first early signals, labelled as early, so a hint is never dressed as a finding.</span></li>
        <li><i class="hot">3</i><span><b>A month or more</b>Firmer findings, each with a confidence score, and the trends worth watching after about two months.</span></li>
      </ol>
    </div>
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><InsightsEmptyScreen /></div></Phone></div>
  </div>
</section>

<section class="v2-sec white" id="weather">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2">Is the weather part of it? Your own data decides.</h2>
      <p class="v2-sub">Your phone’s barometer is sampled quietly as you use the app (on iPhone, once you allow Motion &amp; Fitness). Nothing is shown until your journal links low-pressure days to harder ones, held to the same correction as everything else. Once it does, the link stays, keeps being re-tested, and the Journal warns you on the next low day.</p>
      <a class="v2-link" href="/insights/pots/barometric-pressure-weather-changes-pots/">How weather shifts POTS symptoms →</a>
    </div>
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><JournalScreen time="7:24" battery={0.8} score={66} grade="Moderate" gradeRgb="234,179,8" delta={-5} confidence={88} guide="Reduced reserves. Keep the day easy and stay with the basics of your protocol. Lean on hydration, pacing, and rest, and hold back on anything demanding." figs={LOW_PRESSURE_FIGS} notice={LOW_PRESSURE_NOTICE} /></div></Phone></div>
  </div>
</section>

<Explainer title="How to find your triggers, and what is actually helping.">
  <div class="v2-facts" slot="aside">
    <small>Insights at a glance</small>
    <dl>
      <div><dt>First hints</dt><dd>About 2 weeks</dd></div>
      <div><dt>Firmer findings</dt><dd>A month or more</dd></div>
      <div><dt>Tested</dt><dd>Everything you log</dd></div>
      <div><dt>Runs</dt><dd>On your phone</dd></div>
    </dl>
    <a href="/insights/recovery/find-your-triggers-symptom-journal/">Find your triggers with a journal →</a>
  </div>
  <p>Living with <a href="/conditions/pots/">POTS</a>, <a href="/conditions/long-covid/">long COVID</a> or <a href="/conditions/chronic-illness/">another chronic illness</a> usually means trying a lot of things at once: salt, electrolytes, compression, magnesium, a new bedtime, cutting caffeine, a medication change. Some help. Some do nothing. A few make things worse. Working out which is which from memory is close to impossible, especially when brain fog is one of the symptoms and the effect of anything takes days to show.</p>
  <h3>Why your memory cannot do this</h3>
  <p>Bad days are vivid and good ones blur together. Several things change in the same week. A crash arrives two days after its cause<Cite n={1} />. And one day proves nothing either way: your numbers move every morning for reasons you will never log. Only a record of many days<Cite n={2} />, read with statistics that know how easily patterns appear by luck<Cite n={3} />, can separate a real link from coincidence.</p>
  <h3>What to log for the best answers</h3>
  <ul>
    <li><strong>A morning reading most days.</strong> It is the steadiest outcome Insights has to test against.</li>
    <li><strong>What you take, every time you take it.</strong> A supplement logged daily from the day you started is a clean before and after.</li>
    <li><strong>Your triggers and symptoms as they happen.</strong> Two taps now beats reconstructing the day tonight.</li>
    <li><strong>Your own types.</strong> If something matters to you and is not in the list, create it. It is tested like any other.</li>
  </ul>
  <h3>How to read a finding</h3>
  <p>Each finding says how big the gap is, in the metric’s own unit (“+6 ms”, “+5 pts”), and how strong the evidence is. Tap it and you see the chart it was computed from, with the days the factor was present shaded, and any days before you started logging it left blank rather than counted as days without it. With cycle tracking on, a painkiller you only take for period cramps is recognised as your cycle, not blamed for your hard days.</p>
  <p>Treat a finding as a lead. The most useful next step is often to test it on purpose, or to bring it to your clinician, which is what the <a href="/features/doctor-reports/">AI reports</a> are for. Our guides on <a href="/insights/food/magnesium-hrv-pots/">magnesium</a> and <a href="/insights/food/electrolyte-drinks-for-pots/">electrolyte drinks</a> show what the research says about two of the most common things people test.</p>
  <div class="v2-note"><span>Insights is associational: it shows what lines up, never what caused what. Nothing in it is a reason to start, stop or change a medication. Talk to your clinician first.</span></div>
  <Sources items={sources} />
</Explainer>

<Faq title="Insights questions, answered" items={faq} />
<Related
  eyebrow=""
  title="About finding what helps"
  hub={{ label: 'All recovery articles', href: '/insights/recovery/' }}
  items={[
    { q: 'How do I find my triggers?', slug: 'find-your-triggers-symptom-journal' },
    { q: 'Does magnesium help HRV?', slug: 'magnesium-hrv-pots' },
    { q: 'Do electrolyte drinks help POTS?', slug: 'electrolyte-drinks-for-pots' },
    { q: 'What actually improves HRV?', slug: 'how-to-improve-hrv-what-works' },
    { q: 'Is the weather making my POTS worse?', slug: 'barometric-pressure-weather-changes-pots' }
  ]}
/>
<MoreFeatures current="insights" />
<PageCta title="Find out what is actually helping you." sub="{pricing.trialDays} days of Pro free. No card, no account." />
