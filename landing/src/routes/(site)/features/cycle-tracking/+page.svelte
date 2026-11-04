<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import Cite from '$lib/v2/Cite.svelte';
  import Sources from '$lib/v2/Sources.svelte';
  import { pickSources } from '$lib/v2/sources';
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['schmalenberger2019', 'peggs2012', 'bull2019', 'jarjour2013']);
  const about = ['Postural orthostatic tachycardia syndrome', 'Dysautonomia'];
  const features = ['Period and flow logging', 'Cycle symptoms such as cramps and bloating', 'HRV grades, crash warnings and strain alerts read against the same phase of past cycles', 'A forecast of your next period', 'Ovulation from cycle length or overnight temperature', 'Apple Health and Health Connect sync', 'A private heads-up notification that never names your cycle'];
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import MidCta from '$lib/v2/MidCta.svelte';
  import QuestionGrid from '$lib/v2/QuestionGrid.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import CycleEntryScreen from '$lib/v2/screens/CycleEntryScreen.svelte';
  import LockScreenHeadsUp from '$lib/v2/screens/LockScreenHeadsUp.svelte';
  import CycleImpactScreen from '$lib/v2/screens/CycleImpactScreen.svelte';
  import Explainer from '$lib/v2/Explainer.svelte';
  import TrackTable from '$lib/v2/TrackTable.svelte';
  import Related from '$lib/v2/Related.svelte';
  import MoreFeatures from '$lib/v2/MoreFeatures.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';
  import Faq from '$lib/v2/Faq.svelte';

  const path = '/features/cycle-tracking/';
  const CHECK = '<svg class="v2-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';
  // Each mode is a promise about what the app may claim (mobile/src/lib/cycle).
  const modes = [
    ['Regular periods', 'Phases, and a forecast of your next period once two cycles are logged', 'Forecast'],
    ['Irregular or PCOS', 'Reads the cycles you have finished, and never guesses ahead', 'No forecast'],
    ['Perimenopause', 'Finished cycles only, as they change', 'No forecast'],
    ['Hormonal contraception', 'Knows your bleeding days and nothing more', 'Bleeding only'],
    ['Pregnant', 'Claims nothing about a cycle at all', 'Paused']
  ];
  const reads: [string, string, string][] = [
    ['Your HRV grade', 'A morning reading is also graded against the same phase of your past cycles, so a pre-period dip is weighed against your own pre-period mornings.', 'Free'],
    ['Crash warnings', 'A slide no deeper than the same days before your past periods says it is in line with your last few cycles. A deeper one says that louder.', 'Free'],
    ['Strain alerts', 'Resting and overnight heart rate, your standing rise and your symptom load are compared with the same phases of past cycles.', 'Free'],
    ['Insights', 'Something you only take around your period, like a painkiller for cramps, is read as part of the cycle and never credited with a change on its own.', 'Pro'],
    ['Stand tests and episodes', 'Each result carries a table of your rise by phase, so you can see whether standing is harder in one part of your cycle.', 'Pro'],
    ['Pacing', 'A context line in the pacing sheet compares what you spend in this phase with your other days. It never changes your budget.', 'Pro'],
    ['Reports', 'A menstrual cycle section, one line per cycle, with every ovulation naming how it was worked out.', 'Pro']
  ];
  // The page's own sections, each as the question it answers.
  const answers = [
    { q: 'Why is it worse before my period?', a: 'Log your flow, and every reading is compared with the same phase of your past cycles, so a dip you can expect reads as one.', feature: 'How it works', href: '#how' },
    { q: 'Will my warnings cry wolf every month?', a: 'Crash warnings, strain alerts and your HRV grade all check like phase against like phase before they speak.', feature: 'Cycle-aware, everywhere', href: '#everywhere' },
    { q: 'What if my cycle is not regular?', a: 'Five modes, from regular to perimenopause to contraception, each honest about what it can and cannot tell you.', feature: 'Five modes', href: '#modes' },
    { q: 'Why does my cycle change my HRV?', a: 'How estrogen and progesterone move HRV and resting heart rate, and how the app works out each phase.', feature: 'Your cycle and your nervous system', href: '#why' },
    { q: 'Who can see my cycle data?', a: 'Only you. It stays on your phone, the notification never names it, and you are warned before sharing an export that holds it.', feature: 'Yours alone', href: '#modes' },
    { q: 'What do I get for free?', a: 'Logging, forecasts, Health sync and every correction to your scores. Seeing the pattern in your numbers is Pro.', feature: 'Free and Pro', href: '#plans' }
  ];
  const faq = [
    { q: 'Why does my HRV drop before my period?', a: 'Across a typical cycle, estrogen dominates the first half and tends to lift HRV and lower resting heart rate, while progesterone dominates the second half and does the reverse. Many people see HRV drift down and resting heart rate rise in the week or so before a period. Autonomic compares those days with the same days of your past cycles, so you see your own pattern rather than a general rule.' },
    { q: 'Can POTS get worse around my period?', a: 'Many people with POTS and dysautonomia notice symptoms gather premenstrually and during bleeding, when hormones withdraw and blood volume can dip. Logging your cycle beside your readings and symptoms lets you see whether that is true for you, and how big the change is.' },
    { q: 'How does Autonomic work out my cycle phases?', a: 'From what you log. Cycle day one is the first day of real flow; spotting never starts a period. Ovulation is counted back 14 days from the next period, or read off a sustained rise in overnight temperature if you have one, and phases are recalculated whenever you correct a day.' },
    { q: 'Does it predict my next period?', a: 'In the regular-periods mode, once two finished cycles are logged and they are reasonably consistent. Until then a typical cycle length you enter is used for the forecast. The irregular, perimenopause, contraception and pregnancy modes never forecast.' },
    { q: 'Does it sync with Apple Health or Health Connect?', a: 'Yes. A period another app logged can arrive through Apple Health or Health Connect, and the days you log in Autonomic can be written back. Cycle sync is its own permission, asked only when you set it up.' },
    { q: 'Is cycle tracking free?', a: `Logging, the next-period forecast, Health sync and every correction cycle tracking makes to your scores and warnings are free. Seeing how your cycle moves your numbers, in Insights and Progress, is part of Pro (${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year), and every install starts with ${pricing.trialDays} days of it.` },
    { q: 'Who can see my cycle data?', a: 'Only you. It is stored on your phone with the rest of your journal, the heads-up notification never names a period or a cycle, and the app warns you before you share an export that contains it.' }
  ];
</script>

<FeatureSeo
  {sources}
  {about}
  {features}
  name="Cycle tracking"
  {path}
  {faq}
  title="Menstrual Cycle & HRV Tracking for POTS | Autonomic"
  description="Log your period and Autonomic reads every HRV reading, crash warning and symptom against the same phase of past cycles, so a predictable dip is not a slide."
/>

<FeatureHero icon="cycle" badge="FREE · NEW" name="Cycle tracking" tagline="Read your HRV and symptoms against your cycle." note="Logging, forecasts and Health sync are free">
  <svelte:fragment slot="lead">HRV tends to fall and heart rate to rise before a period, and POTS symptoms often gather there too. Autonomic knows where you are in your cycle, so that dip is compared with your past cycles instead of being flagged as a decline.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-cycle.webp);--pos:50% 35%" role="img" aria-label="A woman resting on the sofa under a knit blanket, phone in her hands"><Phone w={270}><div class="v2-ph-full"><CycleImpactScreen time="7:18" battery={0.85} /></div></Phone></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>Free</b><em>logging and forecasts</em><span>Logging, the next-period forecast, Health sync and every correction to your scores cost nothing.</span></div>
    <div class="v2-stat"><b>3 cycles</b><em>before it names a pattern</em><span>It waits for evidence from your own cycles, and says so until it has it.</span></div>
    <div class="v2-stat"><b>Private</b><em>even on your lock screen</em><span>The heads-up before a period never says the word period or cycle.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions cycle tracking answers." sub="Tap a question to jump to how Autonomic answers it." items={answers} />

<section class="v2-sec white" id="how">
  <div class="v2-wrap v2-split rev">
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><CycleEntryScreen time="7:20" battery={0.85} /></div></Phone></div>
    <div>
      <h2 class="v2-h2">A dip you can expect should not read like a crash.</h2>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>Log it</b>Mark flow in a couple of taps, add cycle symptoms like cramps or breast tenderness, or let Apple Health or Health Connect bring in a period another app logged.</span></li>
        <li><i>2</i><span><b>Read in context</b>Your baseline, crash warnings and strain alerts compare like phase with like phase, so a premenstrual dip is checked against your last cycles first.</span></li>
        <li><i class="hot">3</i><span><b>See your pattern</b>After three cycles, Insights shows how your HRV, heart rate and symptoms move across your cycle, with a score by cycle day.</span></li>
      </ol>
    </div>
  </div>
</section>

<TrackTable eyebrow="" id="everywhere" tags title="Every part of the app reads your cycle." sub="Turning cycle tracking on changes how the whole app judges your numbers, not just a calendar." head={['Part of the app', 'What changes', 'Plan']} rows={reads} />

<MidCta title="Track your cycle beside your readings, free." sub="Logging, forecasts and Health sync are free. On iPhone and Android." />

<section class="v2-sec white" id="modes">
  <div class="v2-wrap v2-split wide">
    <div>
      <h2 class="v2-h2">Each mode is honest about what it knows.</h2>
      <p class="v2-sub">Choose the mode that fits your body. It decides what the app is allowed to say, so it never forecasts a cycle it cannot see.</p>
      <div class="v2-spend paper">
        {#each modes as m}
          <div><span><b>{m[0]}</b><small>{m[1]}</small></span><em>{m[2]}</em></div>
        {/each}
      </div>
    </div>
    <div class="cy-lock">
      <div class="v2-arch"><Phone w={240}><div class="v2-ph-full"><LockScreenHeadsUp /></div></Phone></div>
      <p class="v2-fine">Yours alone. The heads-up before a period never says period or cycle, nothing you log is sent anywhere, and the app warns you before you share an export that holds it.</p>
    </div>
  </div>
</section>

<Explainer id="why" title="Why your cycle belongs beside your readings.">
  <div class="v2-facts" slot="aside">
    <small>Cycle tracking at a glance</small>
    <dl>
      <div><dt>Forecast</dt><dd>After 2 cycles</dd></div>
      <div><dt>Your pattern</dt><dd>After 3 cycles</dd></div>
      <div><dt>Ovulation</dt><dd>Counted back, or temperature</dd></div>
      <div><dt>Logging</dt><dd>Free</dd></div>
    </dl>
    <a href="/insights/hrv/menstrual-cycle-hrv-pots/">Your cycle and HRV, explained →</a>
  </div>
  <p>Across a typical menstrual cycle, <strong>estrogen</strong> dominates the first (follicular) half and tends to lift HRV and lower resting heart rate. <strong>Progesterone</strong> dominates the second (luteal) half and does the reverse: HRV drifts down and resting heart rate rises a few beats<Cite n={1} />. Many people with <a href="/conditions/pots/">POTS</a> and <a href="/conditions/dysautonomia/">dysautonomia</a> also find their symptoms gather in the days before a period and during bleeding, when hormones withdraw and blood volume can dip<Cite n={2} />.</p>
  <p>An app that does not know your cycle reads that monthly dip as bad news. A crash warning fires, your HRV grade falls, and a strain alert asks you to rest, every month, on schedule. Over time you learn to ignore the warnings, which is exactly when a real one gets missed.</p>
  <h3>What cycle-aware means in Autonomic</h3>
  <p>Your journal holds only what you log: the days you bled, how heavy the flow was, and any cycle symptoms. Periods, cycles and phases are worked out fresh every time, so correcting one day redraws every phase after it.</p>
  <ul>
    <li><strong>Day one is the first day of real flow.</strong> Spotting never starts or joins a period, and one unlogged day inside a period is forgiven.</li>
    <li><strong>Ovulation is counted back 14 days</strong> from your next period, or read off a sustained rise in overnight temperature from a thermometer or your wrist (never the two mixed)<Cite n={3} />. Your reports name which way each one was found.</li>
    <li><strong>Gaps are not cycles.</strong> A cycle shorter than 15 days or longer than 60 is treated as a logging gap and kept out of every pattern.</li>
    <li><strong>Patterns wait for evidence.</strong> A forecast needs two finished cycles that roughly agree; a pattern in your numbers needs three.</li>
  </ul>
  <h3>Your pattern, not a textbook’s</h3>
  <p>Autonomic never tells you a reading is fine because of your cycle. It tells you how this reading compares with the same days of your own past cycles, and lets you decide what that means. If heavy flow shows up in three of your last four cycles, it says so and suggests asking your clinician about iron, because heavy periods and low <a href="/insights/pots/iron-deficiency-ferritin-pots/">ferritin</a> often travel with POTS<Cite n={4} />.</p>
  <div class="v2-note"><span>Cycle tracking in Autonomic is not contraception or fertility planning, and it does not diagnose anything. Talk to your clinician about anything that worries you.</span></div>
  <Sources items={sources} />
</Explainer>

<section class="v2-sec white" id="plans">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Getting it right is free. Seeing the pattern is Pro.</h2><p class="v2-sub">Every correction cycle tracking makes to your scores and warnings is free, because a warning that cries wolf every month is a fault, not a feature.</p></div>
    <div class="v2-verdicts">
      <div class="v2-verdict onwhite">
        <small>Free</small>
        <b>Logged, forecast, and read correctly.</b>
        <ul>
          <li>Flow and cycle symptoms in a couple of taps</li>
          <li>Phases, and a forecast of your next period</li>
          <li>Apple Health and Health Connect sync</li>
          <li>Every score, crash warning and strain alert read by phase</li>
          <li>A private heads-up before your period</li>
        </ul>
      </div>
      <div class="v2-verdict us">
        <small>Pro</small>
        <b>How your cycle moves your numbers.</b>
        <ul>
          <li>{@html CHECK}Your cycle in Insights, after three cycles</li>
          <li>{@html CHECK}Progress by cycle day: your score, RMSSD and cycle symptoms</li>
          <li>{@html CHECK}Stand test results by phase</li>
          <li>{@html CHECK}A cycle section in your AI reports</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<Faq title="Cycle tracking questions, answered" items={faq} />

<Related
  eyebrow=""
  title="About your cycle"
  hub={{ label: 'All HRV articles', href: '/insights/hrv/' }}
  items={[
    { q: 'Why does my HRV dip before my period?', slug: 'menstrual-cycle-hrv-pots' },
    { q: 'What does perimenopause do to HRV?', slug: 'menopause-hrv-dysautonomia' },
    { q: 'How do I build an HRV baseline?', slug: 'hrv-baseline-how-to-build-and-use-it' },
    { q: 'What happens to POTS in pregnancy?', slug: 'pots-and-pregnancy' },
    { q: 'Could low iron be part of it?', slug: 'iron-deficiency-ferritin-pots' }
  ]}
/>
<MoreFeatures current="cycle-tracking" />
<PageCta title="See how your cycle shapes your good and bad days." sub="Free on iPhone and Android. Logging and forecasts cost nothing." />

<style>
  .cy-lock { display: flex; flex-direction: column; align-items: center; }
  .cy-lock .v2-arch { align-self: stretch; min-height: 0; }
  .cy-lock .v2-fine { max-width: 340px; text-align: center; }
  /* The mode rows sit on a white section here, where their white cards vanish. */
  .v2-spend.paper > div { background: var(--paper); }
  .v2-spend em { color: var(--plum); font-size: 15px; }
  .v2-verdict.onwhite { background: var(--paper); }
</style>
