<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import InsightsTabScreen from '$lib/v2/screens/InsightsTabScreen.svelte';
  import ChangeSheetScreen from '$lib/v2/screens/ChangeSheetScreen.svelte';
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

  const path = '/conditions/chronic-illness/';
  const answers = [
    { q: 'What actually helps and what’s noise?', a: 'Log what you take and do. Insights tests it against your own HRV, sleep and symptoms, corrects for chance, and tells you what lines up with your better days.', feature: 'Insights', href: '/features/insights/', icon: 'insights', pro: true },
    { q: 'Is this a flare, or my new normal?', a: 'Your morning reading and symptoms are read against your own baseline, so a flare stands out from your usual, and the Journal flags a slide early.', feature: 'Crash warnings', href: '/features/hrv-readings/#crash-warnings', icon: 'alert' },
    { q: 'How much can I do without paying for it later?', a: 'A budget in hours and minutes, set each morning by your own readings, that spends down as you move and warns you while there is still time to ease off.', feature: 'Pacing budget', href: '/features/pacing-budget/', icon: 'pacing', pro: true },
    { q: 'How do I explain six months in fifteen minutes?', a: 'Turn your journal into a clear summary for your appointment, written by the AI you choose, with only the sections you actually tracked.', feature: 'AI reports', href: '/features/doctor-reports/', icon: 'doctor', pro: true },
    { q: 'Are my symptoms tied to my cycle?', a: 'Log your cycle and every reading and symptom is compared with the same phase of past cycles, so a predictable dip is never mistaken for a setback.', feature: 'Cycle tracking', href: '/features/cycle-tracking/', icon: 'cycle' },
    { q: 'Am I getting better at all?', a: 'Every reading builds a baseline of your own. Week, month and year views then show how now compares with before, slow change included.', feature: 'Progress', href: '/features/hrv-readings/', icon: 'progress', pro: true }
  ];
  const track: [string, string, string][] = [
    ['Symptoms', 'Fatigue, pain, brain fog, nausea, dizziness, flushing, palpitations and more, and when each one hit.', 'Built-in symptoms in two taps, plus any you create yourself'],
    ['Flares', 'How often they come, how long they last, and what came before them.', 'Read off your journal and your daily score, with an early flag when things slide'],
    ['Triggers', 'Heat, stress, overexertion, alcohol, histamine-rich foods, fragrances and more.', 'A built-in trigger list, from aged cheese to prolonged standing, plus your own'],
    ['Meals and water', 'Large meals, particular foods and hydration often sit right behind a bad afternoon.', 'Meals and food triggers in taps, water by the glass'],
    ['Medications and supplements', 'What you take, how much and when, and the day you started or stopped each one.', 'Logged with amount and time, and Insights reads the start and stop dates'],
    ['Morning reading (HRV)', 'An objective signal under the symptoms: how much reserve your nervous system woke up with.', 'Five minutes with your phone camera, Apple Watch, Garmin or a chest strap'],
    ['Sleep', 'The biggest daily lever for most people, and often the first thing to slip in a flare.', 'From Apple Health or Health Connect, or typed in'],
    ['Digestion', 'Gut symptoms move with many chronic conditions, especially MCAS and dysautonomia.', 'Bowel movements logged by form and graded'],
    ['Your cycle', 'Many symptoms gather before a period. Without the cycle, a predictable dip looks like a setback.', 'Flow in a couple of taps, or from Apple Health or Health Connect'],
    ['Your routine', 'Whether you are keeping the daily protocol you are working on, and whether it holds up.', 'A clean-day checklist that builds a streak']
  ];
  const faq = [
    { q: 'What is the best app for tracking chronic illness symptoms?', a: 'Log as it happens, in taps rather than paragraphs, so the bad days get recorded too. Keep symptoms, triggers, food, water, medications, supplements and sleep on one timeline, add an objective signal like a morning HRV reading, and let something compare the days for you. Autonomic does all of that in one private journal.' },
    { q: 'How long before Insights finds anything?', a: 'Early hints can appear at around two weeks of logging, and stronger findings need more days. Insights is strict on purpose: it would rather show you nothing than something false, and an empty report is a real answer.' },
    { q: 'Can I track symptoms the app does not list?', a: 'Yes. You can create your own symptoms, triggers, activities, medications and supplements, and they work everywhere the built-in ones do, including Insights.' },
    { q: 'Who can see my health data?', a: 'Only you. There is no account, and your journal, scores and insights are all worked out on your phone. Nothing is sold or shared, and you can export everything whenever you like. If you choose to make an AI report, you copy it into the assistant yourself, and you can read every word first.' },
    { q: 'Can I share my journal with my doctor?', a: 'Yes. With Pro, Autonomic builds a doctor summary from your readings, symptoms and medications, written by the AI you choose. You can also open any chart in the app and show it in the room.' },
    { q: 'Is Autonomic free?', a: `The journal is free forever, with no account and no ads, including unlimited HRV readings and your daily score. Autonomic Pro is ${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year and adds Insights, the pacing budget, your full history and AI reports. Every install starts with ${pricing.trialDays} days of Pro, with no card.` },
    { q: 'Does it work on Android?', a: 'Yes, on both iPhone and Android, at the same price. On Android, sleep and workouts come in from Health Connect, and HRV readings run with your phone camera or a Bluetooth chest strap. The Apple Watch app needs an iPhone.' }
  ];
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['davis2023', 'lillie2011', 'benjamini1995']);
  const about = [{ name: 'Chronic illness', alternateName: ['Chronic disease', 'Long-term condition'] }];
  const features = ['A symptom, trigger, medication and supplement journal', 'Custom symptom and trigger types', 'Insights that test what lines up with better days', 'No detected impact findings', 'A daily pacing budget', 'Doctor summaries'];
</script>

<FeatureSeo
  name="Chronic illness"
  {path}
  {faq}
  {sources}
  {about}
  {features}
  section={{ name: 'Conditions', path: '/conditions/' }}
  title="Chronic Illness Tracker App: Symptoms & Flares | Autonomic"
  description="A private symptom tracker for chronic illness. Log flares, triggers, meds and supplements, and see what lines up with your better days. No account needed."
/>

<FeatureHero crumb={{ label: 'Conditions', href: '/conditions/' }} here="Chronic illness" badge="FOR CHRONIC ILLNESS" name="Answers for life with chronic illness." tagline="Stop relying on memory to know what helps.">
  <svelte:fragment slot="lead">Autonomic is a private symptom tracker for iPhone and Android, built for days that swing. Log symptoms, triggers, meds and supplements in a couple of taps, take a quick morning reading, and let your own data show what lines up with your better days.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-chronic-illness.webp);--pos:44% 40%" role="img" aria-label="A woman at her kitchen table with a pill organiser and supplements"><Phone w={270}><div class="v2-ph-full"><InsightsTabScreen time="8:40" /></div></Phone></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>2 taps</b><em>to log a symptom</em><span>Built-in symptoms, triggers, meds and meals, plus any you create, so the bad days get logged too.</span></div>
    <div class="v2-stat"><b>14 days</b><em>to your first early hints</em><span>Insights starts looking for patterns at around two weeks of logging, and an empty report is a real answer.</span></div>
    <div class="v2-stat"><b>No account</b><em>no ads, no tracking</em><span>Your journal lives on your phone. We never see it, and you can export all of it whenever you like.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions chronic illness leaves you with, answered." sub="Each one is a part of the app. Tap a question to see how it works." items={answers} />

<Explainer tone="white" title="Why memory is the wrong tool for a chronic illness.">
  <div class="v2-facts" slot="aside">
    <small>How Insights stays honest</small>
    <dl>
      <div><dt>Compared against</dt><dd>Your own days</dd></div>
      <div><dt>Corrected for</dt><dd>Chance and the calendar</dd></div>
      <div><dt>Early hints from</dt><dd>About 14 days</dd></div>
      <div><dt>What it claims</dt><dd>Linked, never caused</dd></div>
    </dl>
    <a href="/insights/recovery/find-your-triggers-symptom-journal/">How to find your triggers →</a>
  </div>
  <p>A chronic illness is lived in weeks and months, but it is remembered in fragments. The worst day stands out, the slow improvements blur, and by the time you are sitting in an appointment it is hard to say whether the new supplement helped, whether flares are coming closer together, or whether last month was really worse than the one before. Brain fog makes all of it harder.</p>
  <p>Chronic conditions also travel together. <a href="/conditions/pots/">POTS</a>, <a href="/conditions/long-covid/">long COVID</a>, <a href="/conditions/me-cfs/">ME/CFS</a>, mast cell activation syndrome (MCAS) and hypermobile Ehlers-Danlos syndrome overlap far more than chance would suggest<Cite n={1} />, and plenty of people live with more than one. That makes “what is helping?” harder still: more symptoms, more triggers, more treatments to keep straight. <a href="/insights/postviral/pots-long-covid-and-mcas-overlap/">Why POTS, long COVID and MCAS travel together</a> explains the overlap.</p>
  <h3>What a good symptom journal does for you</h3>
  <ul>
    <li><strong>Captures the day while it is happening</strong>, in taps rather than paragraphs, so the bad days get logged too.</li>
    <li><strong>Keeps everything on one timeline</strong>: symptoms, triggers, food, water, meds, supplements, sleep and a morning reading, so every flare has context<Cite n={2} />.</li>
    <li><strong>Respects the delay.</strong> Plenty of triggers land a day or two later, which is why Insights also looks for links with the next day.</li>
    <li><strong>Does the comparing without fooling you</strong>, with statistics that shrug off one odd reading, a correction for testing many things at once<Cite n={3} />, and a check that a link holds up within its own month rather than riding a good or bad season.</li>
  </ul>
  <h3>When nothing helps, that is an answer too</h3>
  <p>Autonomic tells you when a medication or supplement you have logged for weeks shows <strong>no detected impact</strong> on anything it could test. That is not proof it does nothing, but it is worth knowing, and worth raising with your clinician. It also says so when a change cannot be pinned on any one thing, because you started two things in the same week.</p>
  <div class="v2-note"><span>Autonomic does not diagnose, and it never tells you to start, stop or change a treatment. If your symptoms change suddenly or you feel unsafe, seek medical care.</span></div>
  <Sources items={sources} />
</Explainer>

<TrackTable eyebrow="" title="What to track with a chronic illness, and why." sub="Everything that might be moving your days, on one timeline, with as little effort as possible on the hard ones." rows={track} />

<section class="v2-sec white">
  <div class="v2-wrap v2-split rev">
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><ChangeSheetScreen /></div></Phone></div>
    <div>
      <span class="v2-propill v2-propill-lead">PRO</span>
      <h2 class="v2-h2">It tells you what changed, and what did not.</h2>
      <p class="v2-sub">Beyond a ranked list of what lines up with your better days, Insights reads your journal the way you would if you had the time.</p>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>Biggest change</b>What moved most since you started or stopped something, with everything else that changed in the same stretch named beside it.</span></li>
        <li><i>2</i><span><b>No detected impact</b>The meds and supplements you have logged for weeks that show no link to anything it could test.</span></li>
        <li><i>3</i><span><b>Best and hardest weeks</b>Your best weeks set beside your hardest, with what was different between them. A description, never a verdict.</span></li>
        <li><i class="hot">4</i><span><b>Trend watch</b>Your key numbers, this month against last, in plain words.</span></li>
      </ol>
      <a class="v2-link" href="/features/insights/">Explore Insights →</a>
    </div>
  </div>
</section>

<section class="v2-sec">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2">Stick with a routine, and see if it holds.</h2>
      <p class="v2-sub">Set the daily protocol you are working on, from water and electrolytes to a morning reading or legs up after lunch. Each day that meets it builds a streak, and Progress shows how often you keep it, so a routine you are trying gets a fair test.</p>
      <a class="v2-link" href="/insights/recovery/clean-days-and-protocol-streaks/">Read about clean days →</a>
    </div>
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><ProgressScreen /></div></Phone></div>
  </div>
</section>

<MidCta title="Start a journal that does the remembering." sub="Free on iPhone and Android, with {pricing.trialDays} days of Pro. No card, no account." />

<section class="v2-sec plum2">
  <div class="v2-wrap v2-split rev">
    <div class="v2-arch dark"><Phone w={260} src="/features/privacy.webp" alt="The app's privacy screen: everything stays on your device, no account and no cloud, no tracking, yours to export anytime" /></div>
    <div>
      <h2 class="v2-h2 on-dark">Your health is nobody’s business model.</h2>
      <p class="v2-sub on-dark">No account to make, no cloud of ours to send it to, no ads and no tracking. Your journal, and every score and insight drawn from it, is worked out on your phone, and it is yours to export whenever you like.</p>
      <a class="v2-link on-dark" href="/insights/app/why-autonomic-is-offline-first/">Why we built it offline-first →</a>
    </div>
  </div>
</section>

<CompareTeaser slug="bearable" title="Comparing symptom trackers?" sub="Bearable is a well-loved symptom diary. Autonomic keeps the diary and adds measurement and pacing." keys={['Measures HRV itself', 'Pacing budget and alerts', 'Finding what helps', 'Where your data lives']} />

<Founder />

<Faq title="Chronic illness questions, answered" items={faq} />

<Related
  eyebrow=""
  title="About finding what helps"
  hub={{ label: 'All recovery articles', href: '/insights/recovery/' }}
  items={[
    { q: 'How do I find my triggers?', slug: 'find-your-triggers-symptom-journal' },
    { q: 'Why do POTS, long COVID and MCAS travel together?', slug: 'pots-long-covid-and-mcas-overlap' },
    { q: 'What does hypermobility have to do with it?', slug: 'hypermobility-eds-and-pots' },
    { q: 'Why are my tests normal when I feel this sick?', slug: 'normal-test-results-but-still-sick' },
    { q: 'How do I turn my data into a doctor conversation?', slug: 'turn-your-data-into-a-doctor-conversation' },
    { q: 'What is a clean day?', slug: 'clean-days-and-protocol-streaks' }
  ]}
/>

<ConditionCards current="chronic-illness" />

<LatestArticles topic="recovery" title="The latest guides" white />

<PageCta title="Let your own data say what helps." sub="Free on iPhone and Android. No account, and your journal stays on your phone." />
