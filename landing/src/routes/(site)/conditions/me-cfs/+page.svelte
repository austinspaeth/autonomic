<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import PacingSheetScreen from '$lib/v2/screens/PacingSheetScreen.svelte';
  import LockScreenHeadsUp from '$lib/v2/screens/LockScreenHeadsUp.svelte';
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

  const path = '/conditions/me-cfs/';
  const answers = [
    { q: 'How much can I do before I pay for it?', a: 'A budget in hours and minutes, set each morning by your own readings and fitted to what your history shows you can absorb. It spends down as you move.', feature: 'Pacing budget', href: '/features/pacing-budget/', icon: 'pacing', pro: true },
    { q: 'Is today a day to rest?', a: 'A five-minute reading lying down becomes a score out of 100 and plain guidance, before you have spent anything at all.', feature: 'Journal + HRV', href: '/features/hrv-readings/', icon: 'journal' },
    { q: 'Can I see a crash coming?', a: 'The Journal watches the markers that tend to move first, like resting and overnight heart rate, and flags it when two of them drift from your own normal at once.', feature: 'Crash warnings', href: '/features/hrv-readings/#crash-warnings', icon: 'alert' },
    { q: 'Is resting actually helping?', a: 'Log legs-up time, naps and breathwork. Insights compares those days with your HRV, sleep and symptoms, and says what lines up with your better days.', feature: 'Insights', href: '/features/insights/', icon: 'insights', pro: true },
    { q: 'Why does standing wipe me out?', a: 'Orthostatic intolerance often travels with ME/CFS. A guided stand test on your watch or strap measures your heart rate rise, so you know if it is part of your picture.', feature: 'POTS stand test', href: '/features/pots-stand-test/', icon: 'stand' },
    { q: 'How do I explain PEM to my doctor?', a: 'Months of budgets, crashes, readings and symptoms, turned into a summary for your appointment, with your pacing history laid out in effort minutes.', feature: 'AI reports', href: '/features/doctor-reports/', icon: 'doctor', pro: true }
  ];
  const spend = [
    ['Upright time', '2h 10m standing or walking', '58m'],
    ['Minutes HR above 92 bpm', '22m over 92 bpm, in two stretches', '41m'],
    ['Logged activities', 'Errands and shopping', '35m'],
    ['Recovery time', 'Legs up for 20 minutes', '-18m']
  ];
  const track: [string, string, string][] = [
    ['Morning HRV', 'Below your own normal, especially a day or two after a big effort, it is one of the earliest signs that strain is building.', 'Five minutes lying down, with your phone camera, Apple Watch, Garmin or a chest strap'],
    ['Resting and overnight heart rate', 'A rate that ticks up over a few days often comes before the crash you feel.', 'From your morning reading, plus overnight heart rate from Apple Health or Health Connect'],
    ['Heart rate through the day', 'Minutes above your own exertion line, and how far above, are a more honest measure of load than steps alone.', 'Read from Apple Health or Health Connect and priced into your pacing budget'],
    ['Steps and upright time', 'Standing costs energy too, even when you are not moving.', 'Steps from your phone or watch; standing estimated from your heart rate, and marked as estimated'],
    ['Rest', 'Legs up, naps, breathwork and lying down, and whether your heart rate actually settled.', 'Logged in two taps; legs up and breathwork buy back some budget'],
    ['PEM and symptoms', 'When a crash hits, how long it lasts, and what the two days before it held.', 'Post-exertional malaise, fatigue, brain fog and more built in, plus any you create'],
    ['Sleep', 'Unrefreshing sleep is part of ME/CFS, and a broken night means a smaller budget the next day.', 'Nights arrive from Apple Health or Health Connect, with stages and overnight heart rate']
  ];
  const faq = [
    { q: 'What is the best pacing app for ME/CFS?', a: 'The one that fits your energy envelope to you, counts the load PEM actually answers to, and does not ask you to buy new hardware. Autonomic gives you a daily budget in hours and minutes, set by your own HRV, resting heart rate and sleep, judged on the two days after each day, and it works from the phone, watch or strap you already have. Everything stays on your phone.' },
    { q: 'How does Autonomic know my energy envelope?', a: 'It starts on day one from your morning readings, then learns from your history. Each day is judged on the two days after it, because that is when post-exertional malaise lands, and only a real dip in your numbers can lower the ceiling. The strip says it is still learning until it has enough of your days to be fitted.' },
    { q: 'Does it count mental and emotional exertion?', a: 'Not directly, because no phone can read a hard conversation. Your heart often can: minutes above your own exertion line count wherever they come from, so a stressful afternoon that raises your heart rate is charged like any other effort. You can also log stressful work as an activity.' },
    { q: 'Do I need an armband or heart rate monitor?', a: 'No armband to buy. The budget works from your steps and what you log, and gets sharper with any watch or strap that writes heart rate to Apple Health or Health Connect. When an estimate is thin, the app says so in words and tells you what would sharpen it.' },
    { q: 'Will it push me to do more?', a: 'No. The budget is a ceiling, never a target. No alert ever invites you to spend what is left, nothing congratulates you for filling it, and on a downturn or crash day it holds the number back.' },
    { q: 'Is the pacing budget free?', a: `The pacing budget is part of Autonomic Pro, ${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year, and every install starts with ${pricing.trialDays} days of Pro with no card. The journal, unlimited HRV readings, crash warnings and your daily score are free forever.` },
    { q: 'Is my health data private?', a: 'Yes. Your journal lives on your phone, with no account, no ads and no tracking. Every score, budget and insight is worked out on the device.' }
  ];
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['iom2015', 'nice2021']);
  const about = [{ name: 'Myalgic encephalomyelitis/chronic fatigue syndrome', alternateName: ['ME/CFS', 'Chronic fatigue syndrome', 'Systemic exertion intolerance disease'] }, { name: 'Post-exertional malaise', alternateName: ['PEM'] }];
  const features = ['A pacing budget fitted to your own history', 'Each day judged on the two days after, for delayed PEM', 'Pacing alerts before you reach your ceiling', 'Rest and breathwork buy minutes back', 'Five-minute morning HRV readings', 'The budget on Apple Watch and widgets'];
</script>

<FeatureSeo
  name="ME/CFS"
  {path}
  {faq}
  {sources}
  {about}
  {features}
  section={{ name: 'Conditions', path: '/conditions/' }}
  title="ME/CFS Pacing App: Energy Budget & PEM Tracker | Autonomic"
  description="An ME/CFS pacing app that turns your HRV, heart rate and sleep into a daily energy budget, judged on the two days after so PEM is counted. No armband. Private."
/>

<FeatureHero crumb={{ label: 'Conditions', href: '/conditions/' }} here="ME/CFS" badge="FOR ME/CFS" name="Answers for life with ME/CFS." tagline="Pace by your body’s numbers, not by guesswork.">
  <svelte:fragment slot="lead">Autonomic is a pacing app for ME/CFS on iPhone and Android. Each morning your HRV, resting heart rate and sleep set a budget in hours and minutes that spends down as you move, and every day is checked against the two days after it, because that is when PEM lands. No armband to buy, and all of it stays on your phone.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-me-cfs.webp);--pos:10% 40%" role="img" aria-label="A woman lying in a dim room with her arm over her eyes"><Phone w={270}><div class="v2-ph-full"><PacingSheetScreen time="8:48" battery={0.9} /></div></Phone></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>+1, +2</b><em>the days where PEM lands</em><span>Each day is judged on the two days after it, never just tomorrow, because a crash usually arrives 12 to 48 hours late.</span></div>
    <div class="v2-stat"><b>Minutes</b><em>not points or percent</em><span>A budget of 2h 15m is something you can plan a day around. Your own history fits it to you.</span></div>
    <div class="v2-stat"><b>No band</b><em>to buy</em><span>It works from the phone, watch or strap you already have, through Apple Health or Health Connect. <a class="v2-inl" href="/pricing/#compare">See how it compares</a>.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions ME/CFS leaves you with, answered." sub="Each one is a part of the app. Tap a question to see how it works." items={answers} />

<Explainer tone="white" title="ME/CFS, PEM and the energy envelope.">
  <div class="v2-facts" slot="aside">
    <small>ME/CFS at a glance</small>
    <dl>
      <div><dt>Defining feature</dt><dd>Post-exertional malaise</dd></div>
      <div><dt>Crash delay</dt><dd>12 to 48 hours</dd></div>
      <div><dt>A crash can last</dt><dd>Days or longer</dd></div>
      <div><dt>What helps most</dt><dd>Pacing</dd></div>
    </dl>
    <a href="/insights/recovery/pacing-101-energy-envelope/">Pacing 101: find your energy envelope →</a>
  </div>
  <p><strong>Myalgic encephalomyelitis/chronic fatigue syndrome (ME/CFS)</strong> is a long-term illness whose defining feature is <strong>post-exertional malaise (PEM)</strong>: a disproportionate worsening of symptoms after physical, cognitive or emotional effort that would once have been trivial<Cite n={1} />. It is far more than tiredness. Brain fog, pain, unrefreshing sleep and orthostatic symptoms tend to flare together, and a single overexertion can cost days.</p>
  <p>The cruelty is the delay. PEM usually begins <strong>12 to 48 hours</strong> after the effort, so you feel more or less fine during the walk, the phone call or the family visit, and pay for it two days later. By the time the crash arrives, its connection to what caused it is gone. <a href="/insights/postviral/post-exertional-malaise-explained/">Post-exertional malaise, explained</a> goes deeper on why.</p>
  <h3>Why pacing is so hard to do by feel</h3>
  <p>The answer to PEM is <strong>pacing</strong>: staying inside your energy envelope, the amount of activity your body can currently absorb without a crash. But the envelope cannot be felt, it shrinks on bad days, and good days are exactly the ones that tempt you past it. Graded exercise that ignores symptoms is no longer recommended for ME/CFS<Cite n={2} />, because each push becomes a fresh trigger rather than a step forward. <a href="/insights/recovery/pacing-101-energy-envelope/">Pacing 101</a> walks through how people find and hold their envelope.</p>
  <h3>How Autonomic puts a number on the envelope</h3>
  <ul>
    <li><strong>It starts from your morning.</strong> HRV, resting heart rate and sleep set today’s budget. A rough night means a smaller one, and that is the point.</li>
    <li><strong>It counts what PEM answers to.</strong> Steps, time upright, logged activities, and the minutes your heart spends above your own exertion line, priced by how far above it sat.</li>
    <li><strong>It judges each day on the two days after.</strong> That is when the crash shows up, so that is where the budget learns what you can absorb.</li>
    <li><strong>Rest buys some back.</strong> Legs up and breathwork return minutes, up to a quarter of what the day cost.</li>
    <li><strong>It stays quiet on a bad day.</strong> During a downturn or on a crash day it holds the number back, because a small budget on a bad day is still an invitation to spend it.</li>
  </ul>
  <p>Filling the bar is never the goal. Unspent budget is not wasted, and nothing in the app will ever congratulate you for using it all.</p>
  <h3>What Autonomic will not do</h3>
  <p>It will not diagnose ME/CFS, prescribe an activity level, or tell you to start, stop or change a treatment. The budget is fitted from your own history. It is not an exercise plan, and it is not a limit set by a clinician.</p>
  <div class="v2-note"><span>Talk with a clinician familiar with ME/CFS before starting or changing any activity plan, and seek medical care if your symptoms change suddenly. Autonomic is not a medical device.</span></div>
  <Sources items={sources} />
</Explainer>

<section class="v2-sec lilac">
  <div class="v2-wrap v2-split wide">
    <div>
      <h2 class="v2-h2">See exactly what today cost you.</h2>
      <p class="v2-sub">Not a mystery number. Every minute is traced back to something you did, and rest buys some back. Sample day.</p>
      <div class="v2-spend">
        {#each spend as s}
          <div><span><b>{s[0]}</b><small>{s[1]}</small></span><em class:g={s[2].startsWith('-')}>{s[2]}</em></div>
        {/each}
      </div>
    </div>
    <aside class="v2-quotecard">
      <small>A ceiling, never a target</small>
      <p>Unspent minutes are not wasted. No alert will ever invite you to use what is left, and nothing in the app will congratulate you for filling the bar.</p>
    </aside>
  </div>
</section>

<TrackTable eyebrow="" tone="white" title="What to track with ME/CFS, and why." sub="The signals that move with ME/CFS, and how each one reaches your journal without costing you energy you do not have." rows={track} />

<MidCta title="Try the pacing budget free for {pricing.trialDays} days." sub="Free on iPhone and Android, with {pricing.trialDays} days of Pro. No card, no account." />

<section class="v2-sec plum2">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2 on-dark">A tap on the shoulder while there is still time.</h2>
      <p class="v2-sub on-dark">Alerts can tell you when you are ahead of pace for the time of day, when you are nearly through your budget, or when your heart rate has sat above your own line for a while, naming the bpm. After an over day, a morning note says so. They are paced harder than the budget itself: three a day at most, and never in the night.</p>
      <p class="v2-sub on-dark">The same budget sits on your home screen widgets and, on iPhone, your Apple Watch.</p>
      <p class="v2-fine on-dark">The pacing budget and its alerts are part of Pro. Every install starts with {pricing.trialDays} days of it.</p>
      <a class="v2-link on-dark" href="/features/pacing-budget/">Explore the pacing budget →</a>
    </div>
    <!-- The "nearly spent" pacing alert as it really arrives (lib/budget/alerts.ts), on the page's 5h sample budget. -->
    <div class="v2-arch dark"><Phone w={260}><div class="v2-ph-full"><LockScreenHeadsUp date="Tuesday, October 14" time="3:40" title="Pacing budget nearly spent" body="45m left of today's 5h pacing budget. A good time to slow down." /></div></Phone></div>
  </div>
</section>

<CompareTeaser slug="visible" title="Pacing like Visible, without the band." sub="Visible is the best known pacing app for ME/CFS. Autonomic paces you with what you already own, for less." keys={['Price', 'Hardware to buy', 'Works with Apple Watch or Garmin', 'Daily pacing']} />

<Founder />

<Faq title="ME/CFS questions, answered" items={faq} />

<Related
  eyebrow=""
  title="About pacing and PEM"
  hub={{ label: 'All recovery articles', href: '/insights/recovery/' }}
  items={[
    { q: 'What is pacing, and how do I find my envelope?', slug: 'pacing-101-energy-envelope' },
    { q: 'Why do I crash two days later?', slug: 'post-exertional-malaise-explained' },
    { q: 'How does the pacing budget work?', slug: 'pacing-budget-know-how-much-today-can-take' },
    { q: 'Why am I so tired?', slug: 'why-am-i-so-tired-pots-long-covid-fatigue' },
    { q: 'How do heart rate zones work with dysautonomia?', slug: 'heart-rate-zones-explained' },
    { q: 'What does recovery actually look like?', slug: 'what-recovery-looks-like' }
  ]}
/>

<ConditionCards current="me-cfs" />

<LatestArticles topic="mecfs" title="The latest on ME/CFS" white />

<PageCta title="Know tomorrow’s budget before you spend it." sub="Free on iPhone and Android. Every install starts with {pricing.trialDays} days of Pro, pacing budget included, with no card." />
