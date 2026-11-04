<script lang="ts">
  import DeviceCards from '$lib/v2/DeviceCards.svelte';
  import { pricing, priceLabel } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import Cite from '$lib/v2/Cite.svelte';
  import Sources from '$lib/v2/Sources.svelte';
  import { pickSources } from '$lib/v2/sources';
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['shcherbina2017', 'gilgen2019']);
  const about = ['Postural orthostatic tachycardia syndrome', 'Dysautonomia'];
  const features = ['Live heart rate with a rolling delta', 'Heart rate spike alerts', 'A guided POTS stand test on the watch', 'POTS episode capture', 'HRV readings from the watch', 'Today’s pacing budget on your wrist'];
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import WatchDemo from '$lib/v2/WatchDemo.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import MidCta from '$lib/v2/MidCta.svelte';
  import QuestionGrid from '$lib/v2/QuestionGrid.svelte';
  import Explainer from '$lib/v2/Explainer.svelte';
  import Related from '$lib/v2/Related.svelte';
  import MoreFeatures from '$lib/v2/MoreFeatures.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';
  import Faq from '$lib/v2/Faq.svelte';

  const path = '/features/apple-watch/';
  const tools = [
    { t: 'Free', n: 'Live heart rate', d: 'Your heart rate, its two-minute average and how fast it is moving, for as long as you keep the session open. Log a symptom without leaving it.' },
    { t: 'Free', n: 'POTS stand test', d: 'Five minutes lying, ten standing, guided by taps on your wrist. You never touch your phone or watch a clock.' },
    { t: 'Free', n: 'POTS episode', d: 'Lying to standing, sitting to standing or climbing stairs: heart rate before, right after, and one minute later.' },
    { t: 'Free', n: 'HRV readings', d: 'Take your morning reading with your watch. The beat-to-beat series reaches your iPhone and is graded like any other.' },
    { t: 'Pro', n: 'Pacing budget', d: 'What is left of today’s budget, what you have spent and where an even day would be by now. The same numbers as your widgets.' },
    { t: 'Free', n: 'Apple Health', d: 'Sleep stages, overnight heart rate and workouts with their heart rate trace come into your journal on their own.' }
  ];
  // The page's own sections, each as the question it answers.
  const answers = [
    { q: 'What is my heart doing right now?', a: 'Live heart rate, its two-minute average and how fast it is moving, with a buzz when it spikes.', feature: 'Live heart rate', href: '#watch' },
    { q: 'Can I do a stand test without my phone?', a: 'Five minutes lying, ten standing, guided by taps on your wrist from start to finish.', feature: 'Stand test on your wrist', href: '#tools' },
    { q: 'What happened when I stood up?', a: 'Capture an episode on the stairs or as you get up: heart rate before, right after and a minute later.', feature: 'Episode capture', href: '#tools' },
    { q: 'How much of today is left?', a: 'Your pacing budget on your wrist, with what you have spent and where an even day would be by now.', feature: 'Pacing on your wrist', href: '#tools', pro: true },
    { q: 'What if I do not have an Apple Watch?', a: 'A chest strap runs the stand test and episode capture in the phone app, and a Garmin or your phone camera takes your HRV readings.', feature: 'No Apple Watch?', href: '#android' },
    { q: 'Why does heart rate on my wrist matter?', a: 'What your heart rate says about POTS, and what a wrist sensor can and cannot tell you.', feature: 'Heart rate with POTS', href: '#why' }
  ];
  const faq = [
    { q: 'Is the Autonomic Apple Watch app on Android?', a: 'The Apple Watch app needs an iPhone. On Android, the stand test and episode capture run in the phone app with a Bluetooth chest strap, HRV readings with a strap or the phone camera, and the Autonomic app for Garmin watches works on both iPhone and Android.' },
    { q: 'What is free on the watch?', a: `The live heart rate monitor, stand tests, episode captures and HRV readings run on every plan. Today’s pacing budget on your wrist and reading your POTS results are part of Pro (${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year), and every install starts with ${pricing.trialDays} days of it.` },
    { q: 'Do I need a cellular Apple Watch?', a: 'No. Readings and tests taken on the watch wait on it until your iPhone is in reach, then sync. Nothing goes to a server.' },
    { q: 'How accurate is Apple Watch heart rate for POTS?', a: 'Optical wrist sensors read resting and standing heart rate well, and they can lag or miss beats during movement. For beat-to-beat HRV a chest strap is the cleanest signal there is. What matters most for a trend is using the same device the same way, so your readings stay comparable with each other.' },
    { q: 'Can I use a Garmin watch instead?', a: 'Yes. The Autonomic app for Garmin records your beats on the watch and sends them to your phone, on iPhone or Android. You choose on the phone whether a reading is a morning baseline or paced training.' },
    { q: 'Does it replace my medical device?', a: 'No. The watch app is a wellness tool that reads heart rate. It does not measure blood pressure and it is not a diagnosis. Talk to your clinician about what your numbers mean.' }
  ];
  // The watch app is iPhone only: what does the same jobs on any phone.
  const alternatives = [
    { name: 'Garmin watches', logos: ['garmin'], body: 'The Autonomic app for Garmin records your beat-to-beat intervals on the watch and sends them to your phone. You choose on the phone whether it was a morning baseline or paced training.' },
    { name: 'Chest straps', logos: ['polar', 'coospo'], body: 'A Polar H10, a Coospo H808S or another Bluetooth chest strap gives the cleanest beat-to-beat signal there is, and runs the stand test and episode capture in the app. Polar’s optical Verity Sense, 360 and OH1 work too.' },
    { name: 'Your phone camera', logos: ['camera'], body: 'Rest a fingertip lightly on the rear camera for your morning HRV reading. Nothing to buy, nothing to charge.' }
  ];
</script>

<FeatureSeo
  {sources}
  {about}
  {features}
  name="Apple Watch"
  {path}
  {faq}
  title="Apple Watch App for POTS: Heart Rate & Stand Tests | Autonomic"
  description="Live heart rate with a rolling delta, spike alerts, a guided POTS stand test and episode capture on your Apple Watch, plus HRV readings and your pacing budget."
/>

<FeatureHero icon="watch" badge="FREE · IPHONE" name="Apple Watch" tagline="POTS heart rate tools on your wrist." note="Heart rate monitor and POTS captures are free. Requires iPhone.">
  <svelte:fragment slot="lead">The moment the room tilts, the data is already there. Watch your heart rate and how fast it is moving, get a buzz when it spikes, and run a stand test without touching your phone. Wearing a Garmin? It takes your HRV readings.</svelte:fragment>
  <div class="v2-watchshot big photo" style="--photo:url(/people/hero-watch.webp);--pos:44% 40%" role="img" aria-label="A woman checking her Apple Watch while climbing the stairs"><img src="/features/watch-stand-test.webp" width="410" height="502" alt="An Apple Watch mid stand test showing heart rate 114, up 31 from lying down" /></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>Live</b><em>heart rate and its delta</em><span>Your heart rate and how fast it is moving, right on your wrist, for as long as you need it.</span></div>
    <div class="v2-stat"><b>15 min</b><em>stand test, no phone</em><span>Five minutes lying, ten standing, every step cued by a tap on your wrist.</span></div>
    <div class="v2-stat"><b>Free</b><em>on every plan</em><span>The heart rate monitor, stand tests and episode captures cost nothing. Pacing on the wrist is Pro.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions your watch answers." sub="Tap a question to jump to how Autonomic answers it." items={answers} />

<WatchDemo />

<section class="v2-sec white" id="tools">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Six ways your watch answers back.</h2><p class="v2-sub">Four tools on the watch itself, your HRV readings, and everything Apple Health brings in. All of it lands in the same journal, scored the same way, with nothing to copy across.</p></div>
    <div class="v2-g3">
      {#each tools as t}<div class="v2-devcard"><i>{t.t}</i><b>{t.n}</b><span>{t.d}</span></div>{/each}
    </div>
  </div>
</section>

<MidCta title="Put your heart rate on your wrist, free." sub="Live heart rate, stand tests and HRV readings are free on every plan. Needs an iPhone." />

<section class="v2-sec" id="android">
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2">On Android, or wearing a Garmin, you are covered.</h2></div>
      <p class="v2-sub narrow">The watch app is iPhone only. These do the same jobs on every phone.</p>
    </div>
    <DeviceCards devices={alternatives} />
    <a class="v2-link" href="/features/hrv-readings/">See every way to take a reading →</a>
  </div>
</section>

<Explainer tone="white" id="why" title="Why heart rate on your wrist matters.">
  <div class="v2-facts" slot="aside">
    <small>The watch app at a glance</small>
    <dl>
      <div><dt>Needs</dt><dd>iPhone and Apple Watch</dd></div>
      <div><dt>Free</dt><dd>Heart rate, tests, HRV</dd></div>
      <div><dt>Pro</dt><dd>Pacing, POTS results</dd></div>
      <div><dt>Cellular</dt><dd>Not needed</dd></div>
    </dl>
    <a href="/insights/pots/best-tools-for-tracking-pots/">The best tools for tracking POTS →</a>
  </div>
  <p>With <a href="/conditions/pots/">POTS</a> and other forms of <a href="/conditions/dysautonomia/">dysautonomia</a>, the moments that matter rarely happen in a clinic. They happen in the seconds after you stand up from the sofa, halfway up the stairs, in a hot shower or a supermarket queue. A clinic visit sees one heart rate on one afternoon. Your wrist sees all of them.</p>
  <p>Seeing your heart rate and how fast it is moving, as it happens, turns a vague “my heart is going crazy” into a number you can act on and come back to. A buzz when it spikes is your cue to sit down, and an episode capture keeps the record so you can show it to your clinician later.</p>
  <h3>How accurate is a watch?</h3>
  <p>Optical wrist sensors read heart rate well at rest and while standing still, and less well while you move, when they can lag or miss beats<Cite n={1} />. For HRV, wrist devices tend to read a little lower than a chest strap, which is the reference used in research<Cite n={2} />. That matters less than it sounds: what makes a trend trustworthy is the <strong>same device, used the same way</strong>, so every reading is comparable with the last. If you want the cleanest signal, a chest strap is it, and <a href="/insights/research/how-accurate-are-hrv-wearables/">how accurate HRV wearables are</a> goes into the evidence.</p>
  <h3>Built for recovery, not training</h3>
  <p>Most watch apps are built for athletes chasing a personal best. Autonomic is built for people whose best days are the ones they did not overdo. The pacing budget on your wrist shows what is left of today, never a target to hit, and filling it is never the goal.</p>
  <div class="v2-note"><span>A wellness tool, not a medical device. The watch reads heart rate; it does not measure blood pressure or diagnose anything.</span></div>
  <Sources items={sources} />
</Explainer>

<Faq title="Apple Watch questions, answered" items={faq} />

<Related
  eyebrow=""
  title="About wearables"
  hub={{ label: 'All app articles', href: '/insights/app/' }}
  items={[
    { q: 'How accurate is my watch for HRV?', slug: 'how-accurate-are-hrv-wearables' },
    { q: 'What is the best way to track POTS?', slug: 'best-tools-for-tracking-pots' },
    { q: 'How is this different from a fitness tracker?', slug: 'autonomic-vs-fitness-trackers' },
    { q: 'Strap, ring or watch: what should I measure with?', slug: 'how-to-measure-hrv-at-home-devices' }
  ]}
/>
<MoreFeatures current="apple-watch" />
<PageCta title="Put it on your wrist tonight." sub="Free on the App Store, with the watch app included." />
