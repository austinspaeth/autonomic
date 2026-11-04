<script lang="ts">
  import { pricing, priceLabel, visibleApp } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import Cite from '$lib/v2/Cite.svelte';
  import Sources from '$lib/v2/Sources.svelte';
  import { pickSources } from '$lib/v2/sources';
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['nice2021', 'iom2015', 'parker2023']);
  const about = ['Myalgic encephalomyelitis/chronic fatigue syndrome', 'Long COVID', 'Postural orthostatic tachycardia syndrome', 'Post-exertional malaise'];
  const features = ['A daily energy budget in hours and minutes', 'A budget set from your own HRV, resting heart rate and sleep', 'Effort counted from steps, heart rate and logged activity', 'Each day judged on the two days after, for delayed post-exertional malaise', 'Pacing alerts before you reach your ceiling', 'Rest and breathwork buy minutes back', 'The budget on Apple Watch and home-screen widgets'];
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import MidCta from '$lib/v2/MidCta.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import JournalScreen from '$lib/v2/screens/JournalScreen.svelte';
  import PacingSheetScreen from '$lib/v2/screens/PacingSheetScreen.svelte';
  import QuestionGrid from '$lib/v2/QuestionGrid.svelte';
  import Explainer from '$lib/v2/Explainer.svelte';
  import Related from '$lib/v2/Related.svelte';
  import MoreFeatures from '$lib/v2/MoreFeatures.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';
  import Faq from '$lib/v2/Faq.svelte';

  const saved = Math.round(visibleApp.yearly - pricing.yearly);
  const yearly = priceLabel(pricing.yearly);
  const answers = [
    { q: 'How much can I do today?', a: 'Each morning your HRV, resting heart rate and sleep set a budget in hours and minutes. A rough night means a smaller one.', feature: 'Your morning budget', href: '#how' },
    { q: 'What did today actually cost me?', a: 'Every minute spent is traced to something you did: steps, time upright, minutes above your own heart rate line, logged activities.', feature: 'Where it went', href: '#spend' },
    { q: 'Am I overdoing it right now?', a: 'When you are ahead of pace or near the ceiling, a notification says so while there is still time to ease off.', feature: 'Pacing alerts', href: '#alerts' },
    { q: 'Is resting actually doing anything?', a: 'Legs up and breathwork buy minutes back, so the budget shows rest as the investment it is.', feature: 'Recovery time', href: '#spend' },
    { q: 'Will I pay for this tomorrow?', a: 'Crashes arrive late, so each day is judged on the two days after it, and your budget learns from what you actually absorbed.', feature: 'It checks itself', href: '#learns' },
    { q: 'Can I see it without opening the app?', a: 'Home-screen widgets on iPhone and Android, and today’s budget on your Apple Watch, all from the same numbers.', feature: 'Widgets and watch', href: '#everywhere' }
  ];
  const spend = [
    ['Minutes above 94 bpm', '48m over 94 bpm, in three stretches', '1h 48m'],
    ['Upright time', '3h 40m standing or walking', '1h 44m'],
    ['Logged activities', 'Running exercise', '1h 31m'],
    ['Recovery time', 'Legs up 20 minutes, 7 minutes resting', '-27m']
  ];
  const alerts = [
    ['Over', 'When today has gone past its budget, it says by how much: “Over by 25m of your pacing budget.”'],
    ['Nearly spent', 'At 85% of the budget, while the rest of the day can still be planned around it.'],
    ['Heart rate', 'A stretch above your own exertion line, named in beats: “Heart rate above 95 bpm for 28m.”'],
    ['Ahead of pace', 'When the day has spent far more of its budget than the hours so far should have, with plenty of day still to go.'],
    ['The morning after', 'After a day that went over, a note before noon, so the next day can start gently.']
  ];
  // The Journal at 8:48am, the strip ahead of pace: 1h 25m spent of a 5h
  // budget, past the white mark where an even day would be (PacingSheetScreen's
  // sample, so the two phones on this page tell one day).
  const MORNING_BUDGET = { figure: '3h 35m', figureSub: 'left of 5h', fill: 85 / 300, pace: 0.12, color: '#eab308', sub: '1h 25m spent · ahead of pace' };
  const check = '<svg class="v2-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';
  const rows = [
    ['What you need to wear', 'The Apple Watch, Garmin, chest strap or phone you already have', 'Their own band, $79.70'],
    ['Your daily budget', 'Hours and minutes of effort, fitted to you', 'Requires their band'],
    ['Price', `${yearly} a year, with a free journal`, `$${visibleApp.yearly} a year, plus the band`],
    ['Where your data lives', 'On your phone. We never see it.', 'Their database, linked to you'],
    ['Export your data', 'Everything, anytime', 'Daily scores, not continuous heart rate']
  ];
  const faq = [
    { q: 'What is a pacing budget?', a: 'A daily estimate of how much effort your body can absorb today without paying for it later, shown in hours and minutes. It is set each morning from your own readings, spends down as you move, and is checked against how the next two days actually went.' },
    { q: 'How is my budget calculated?', a: 'Your morning HRV, resting heart rate and sleep set the envelope, narrowed after a day that went over. Steps, time upright, minutes your heart rate spends above your own exertion line and anything you log spend it. Legs up and breathwork buy some back. Over time it fits itself to what your history shows you can absorb.' },
    { q: 'Do I need a smartwatch for the pacing budget?', a: 'No, but it helps. Steps come from your phone through Apple Health or Health Connect, and anything you log counts. Heart rate from a watch, ring or strap lets it price effort properly. With less to go on, the budget still appears and says in plain words that the estimate is thinner.' },
    { q: 'Why does my budget sometimes show no number?', a: 'On a day your score is sliding, after a crash, or when your markers point to strain, the budget deliberately publishes no number. A small budget on a bad day still reads like an invitation to spend it, and on those days rest is the answer.' },
    { q: 'Do pacing alerts work with the app closed?', a: 'Yes, once Health is connected. On Android the app checks in the background, roughly every 15 minutes at best. On iPhone, Apple Health reads nothing while the phone is locked, so an alert usually lands shortly after you next unlock it. You choose which of the five alerts you want.' },
    { q: 'Is the pacing budget free?', a: `It is part of Autonomic Pro, ${priceLabel(pricing.monthly)} a month or ${yearly} a year. Every install starts with ${pricing.trialDays} days of Pro, so you can try it with no card. The journal and unlimited HRV readings stay free either way.` },
    { q: 'Is the budget an activity limit from my doctor?', a: 'No. It is an estimate fitted from your own history, not a prescribed limit, and it can be wrong. It is there to help you see the ceiling coming. Your clinician’s advice comes first.' }
  ];
</script>

<FeatureSeo
  {sources}
  {about}
  {features}
  name="Pacing budget"
  path="/features/pacing-budget/"
  {faq}
  title="Pacing Budget App for Long COVID, ME/CFS and POTS | Autonomic"
  description="A daily energy budget in hours and minutes, set by your own HRV, resting heart rate and sleep. See the ceiling coming and pace your day, with no armband to buy."
/>

<FeatureHero icon="pacing" badge="PRO · NEW" name="Pacing budget" tagline="An energy budget for how much today can take.">
  <svelte:fragment slot="lead">Each morning Autonomic reads your HRV, resting heart rate and sleep, then gives you a budget in hours and minutes that spends down as you move. It warns you before the ceiling, not after. Built for <a class="v2-inl" href="/conditions/long-covid/">long COVID</a>, <a class="v2-inl" href="/conditions/me-cfs/">ME/CFS</a> and <a class="v2-inl" href="/conditions/pots/">POTS</a>.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-pacing.webp);--pos:56% 40%" role="img" aria-label="A woman resting on a park bench mid-walk, water bottle beside her and a watch on her wrist"><Phone w={270}><div class="v2-ph-full"><PacingSheetScreen time="8:48" battery={0.9} /></div></Phone></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>3h 35m</b><em>left today</em><span>Shown in time you can picture, not points or a percentage.</span></div>
    <div class="v2-stat"><b>3 inputs</b><em>read every morning</em><span>HRV, resting heart rate and sleep, against your own history.</span></div>
    <div class="v2-stat"><b>2 days</b><em>later, it checks itself</em><span>Crashes arrive late, so each day is judged on the two days after it.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions pacing answers, every day." sub="Pacing used to mean guessing and counting. These are the answers the budget gives you instead." items={answers} />

<section class="v2-sec white" id="how">
  <div class="v2-wrap v2-split rev">
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><JournalScreen time="8:48" battery={0.9} budget={MORNING_BUDGET} /></div></Phone></div>
    <div>
      <h2 class="v2-h2">A budget, a pace, and a warning before the wall.</h2>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>Morning</b>Your readings set today’s budget. A rough night means a smaller one, and that is the point. A day that went over narrows the next one too.</span></li>
        <li><i>2</i><span><b>As you move</b>Steps, workouts, time upright and minutes above your own exertion line all spend it down. A minute of moderate effort costs one minute.</span></li>
        <li><i class="hot">3</i><span><b>Before the ceiling</b>A pace marker walks along the bar through the day. When you are ahead of it, you hear about it while there is still time to ease off.</span></li>
      </ol>
    </div>
  </div>
</section>

<section class="v2-sec" id="spend">
  <div class="v2-wrap v2-split wide">
    <div>
      <h2 class="v2-h2">See exactly what cost you today.</h2>
      <p class="v2-sub">Not a mystery number. Every minute is traced back to something you did, and every row opens to show its own arithmetic. Rest buys some back, up to a quarter of what the day cost.</p>
      <div class="v2-spend">
        {#each spend as s}
          <div><span><b>{s[0]}</b><small>{s[1]}</small></span><em class:g={s[2].startsWith('-')}>{s[2]}</em></div>
        {/each}
      </div>
      <p class="v2-fine">Heart rate minutes are priced by how far above your own line they sat, so hovering at your edge never counts like a sprint. Standing still is estimated from heart rate, and the row says so.</p>
    </div>
    <aside class="v2-quotecard">
      <small>Why it is minutes</small>
      <p>A budget of “3h 20m” is something you can plan a day around. A score of 62 is not. Filling the bar is never the goal: unspent budget is not wasted.</p>
    </aside>
  </div>
</section>

<section class="v2-sec lilac" id="compare">
  <div class="v2-wrap v2-vs">
    <div>
      <h2 class="v2-h2">Pacing without buying another band.</h2>
      <p class="v2-sub">{visibleApp.name} is the best known pacing app. Here is the honest difference.</p>
      <div class="v2-savecard"><b>${saved}</b><span>less per year, before the cost of their band</span></div>
      <a class="v2-link" href="/compare/visible/">Read the full comparison with {visibleApp.name} →</a>
    </div>
    <div class="v2-cmp-scroll">
      <table class="v2-cmp card stack duo">
        <caption class="v2-sr">Autonomic compared with {visibleApp.name}</caption>
        <thead><tr>
          <th><span class="v2-sr">Feature</span></th>
          <th class="us"><span class="v2-cmp-logo"><img src="/apple-touch-icon.png" width="28" height="28" alt="" /></span>Autonomic</th>
          <th><span class="v2-cmp-logo"><img src="/visible.png" width="28" height="28" alt="" /></span>{visibleApp.name}</th>
        </tr></thead>
        <tbody>{#each rows as r}<tr><th scope="row">{r[0]}</th><td class="us" data-label="Autonomic">{@html check}{r[1]}</td><td data-label={visibleApp.name}>{r[2]}</td></tr>{/each}</tbody>
      </table>
    </div>
  </div>
  <MidCta bare title="Try the pacing budget free for {pricing.trialDays} days." sub="No band to buy, no card, no account. On iPhone and Android." />
</section>

<section class="v2-sec plum2" id="alerts">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2 on-dark">Am I overdoing it? A nudge before the wall.</h2>
      <p class="v2-sub on-dark">Five alerts, each one yours to switch off, and all of them paced harder than the budget they describe: three a day at most, never two within 45 minutes, nothing before you wake, and none on a day the crash warning has already spoken.</p>
      <p class="v2-fine on-dark">No alert ever invites you to spend what is left.</p>
    </div>
    <ul class="pa">
      {#each alerts as a}<li><b>{a[0]}</b>{a[1]}</li>{/each}
    </ul>
  </div>
</section>

<Explainer tone="white" title="What pacing is, and why the budget is in minutes.">
  <div class="v2-facts" slot="aside">
    <small>The budget at a glance</small>
    <dl>
      <div><dt>Measured in</dt><dd>Effort minutes</dd></div>
      <div><dt>Set by</dt><dd>HRV, resting HR, sleep</dd></div>
      <div><dt>Judged on</dt><dd>The two days after</dd></div>
      <div><dt>Rest buys back</dt><dd>Up to a quarter</dd></div>
    </dl>
    <a href="/insights/recovery/pacing-101-energy-envelope/">Pacing 101: the energy envelope →</a>
  </div>
  <p><strong>Pacing</strong> means staying inside your <strong>energy envelope</strong>: the amount of physical, mental and emotional effort you can spend in a day without setting off a crash<Cite n={1} />. For people with <a href="/conditions/me-cfs/">ME/CFS</a> and <a href="/conditions/long-covid/">long COVID</a>, and for many with <a href="/conditions/pots/">POTS</a>, it is the single most important skill in recovery, and the hardest one to do by feel.</p>
  <p>The reason it is hard has a name. <a href="/insights/postviral/post-exertional-malaise-explained/">Post-exertional malaise (PEM)</a> is a crash that arrives late, often 12 to 48 hours after the effort that caused it<Cite n={2} />. You feel more or less fine during the walk or the busy afternoon, and the bill comes on Thursday. By the time your body tells you that you overdid it, you overdid it two days ago.</p>
  <h3>Why a number helps</h3>
  <p>Counting spoons, watching a heart rate monitor and keeping a diary all work<Cite n={3} />, and they are exhausting on the days you have the least to spare. The pacing budget does the counting for you, from data your phone and watch are already collecting, and turns it into one figure you can plan around: how much of today is left.</p>
  <h3>Why minutes, not a score</h3>
  <p>“3h 35m left” is something you can hold against a shower, a school run or a phone call. A percentage or a points score asks you to translate first. So everything you read is in time, and a minute of moderate effort costs one minute. Harder effort costs more, and the price rises with how far your heart rate sits above <em>your own</em> exertion line, not a textbook zone built for somebody healthy.</p>
  <h3>How it learns you</h3>
  <ul>
    <li><strong>From day one.</strong> You get a budget on your first morning, started from your daily score and marked as learning until it has enough of your history.</li>
    <li><strong>Judged two days later.</strong> Each day is checked against the two days after it, because that is when a crash shows up, and the budget adjusts to what you genuinely absorbed.</li>
    <li><strong>Honest about evidence.</strong> A quiet week never shrinks your budget, because a day you held back says nothing about your ceiling. Only a dip lowers it.</li>
    <li><strong>Quiet on bad days.</strong> When your score is sliding or the day looks like a crash, it shows no number at all. A small budget on a bad day still reads like permission.</li>
  </ul>
  <div class="v2-note"><span>The pacing budget is an estimate fitted from your own history, not a prescribed activity limit, and it can be wrong. It is there to help you see the ceiling coming. Your clinician’s advice comes first.</span></div>
  <Sources items={sources} />
</Explainer>

<section class="v2-sec" id="learns">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2">Will I pay for this tomorrow? It keeps score.</h2>
      <p class="v2-sub">Every finished day is graded against what the budget published that morning, then held up against the two days that followed. The sheet shows how often the estimate has held, so you can decide how much to trust it.</p>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>Learning, then fitted</b>Early days wear a “Learning” label and a softer figure, until there is enough of you to fit.</span></li>
        <li><i>2</i><span><b>A finished day speaks in the past tense</b>Look back at any day and see what it cost, where it went, and whether it held.</span></li>
        <li><i class="hot">3</i><span><b>In your reports</b>Your pacing history goes into the doctor summary and every export, with the ceiling explained as yours, not a limit.</span></li>
      </ol>
    </div>
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><PacingSheetScreen time="5:40" battery={0.35} over /></div></Phone></div>
  </div>
</section>

<section class="v2-sec white" id="everywhere">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Today’s budget, without opening the app.</h2><p class="v2-sub">One budget feeds every surface, so your phone, your home screen and your wrist never disagree.</p></div>
    <div class="v2-g3">
      <div class="v2-devcard"><i>iPhone and Android</i><b>Home-screen widgets</b><span>A small and a medium widget, with spent and budget side by side. The pace marker keeps walking through the day even when the app is closed.</span></div>
      <a class="v2-devcard pb-card" href="/features/apple-watch/"><i>iPhone</i><b>On your Apple Watch</b><span>Today’s budget at a glance on your wrist, from the same numbers as your phone. Explore the watch app →</span></a>
      <a class="v2-devcard pb-card" href="/features/doctor-reports/"><i>Pro</i><b>In your doctor report</b><span>Your pacing history, in effort minutes, with the days nobody watched left out rather than counted as rest. See AI reports →</span></a>
    </div>
  </div>
</section>


<Faq title="Pacing questions, answered" items={faq} />
<Related
  eyebrow=""
  title="About pacing"
  hub={{ label: 'All recovery articles', href: '/insights/recovery/' }}
  items={[
    { q: 'What is pacing with long COVID or ME/CFS?', slug: 'pacing-101-energy-envelope' },
    { q: 'How does the budget actually work?', slug: 'pacing-budget-know-how-much-today-can-take' },
    { q: 'Why do I crash two days later?', slug: 'post-exertional-malaise-explained' },
    { q: 'Why am I so tired?', slug: 'why-am-i-so-tired-pots-long-covid-fatigue' },
    { q: 'How do I read heart rate zones with dysautonomia?', slug: 'heart-rate-zones-explained' }
  ]}
/>
<MoreFeatures current="pacing-budget" />
<PageCta title="See tomorrow’s budget tomorrow morning." sub="{pricing.trialDays} days of Pro free. No card, no account." />

<style>
  .pa { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
  .pa li { background: rgba(255,255,255,.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); border-radius: 20px; padding: 18px 20px; color: #cbbfd3; font-size: 15.5px; line-height: 1.5; }
  .pa b { display: block; color: #fff; font-size: 18px; font-weight: 800; letter-spacing: -.015em; margin-bottom: 3px; }
  .pb-card { color: var(--ink); transition: box-shadow .32s cubic-bezier(.34,1.56,.64,1); --ring: #d3c8d6; box-shadow: 0 0 0 0 var(--ring); }
  @media (hover: hover) { .pb-card:hover { box-shadow: 0 0 0 3px var(--ring); } }
  .pb-card:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
</style>
