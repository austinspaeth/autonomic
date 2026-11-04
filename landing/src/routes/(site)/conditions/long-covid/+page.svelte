<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import JournalScreen from '$lib/v2/screens/JournalScreen.svelte';
  import ProgressScreen from '$lib/v2/screens/ProgressScreen.svelte';
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

  const path = '/conditions/long-covid/';

  // The home page's "Am I about to crash?" day: HRV and sleep in the
  // Compromised band, resting HR Moderate, and the downturn card's own headline.
  const SLIDING_FIGS = [
    { text: '21', unit: 'ms', color: '#f97316', label: 'HRV' },
    { text: '76', unit: 'bpm', color: '#eab308', label: 'Resting HR' },
    { text: '5h 40m', color: '#f97316', label: 'Sleep' }
  ];
  const SLIDING_NOTICE = { emoji: '⚠️', text: 'Autonomic score trending down 12 points over the last 3 days', chevron: true };
  const SLIDING_GUIDE = 'Reduced reserves. Keep the day easy and stay with the basics of your protocol. Lean on hydration, pacing, and rest, and hold back on anything demanding.';

  const answers = [
    { q: 'Will I crash if I do this today?', a: 'Each morning your own readings set a budget in hours and minutes. It spends down as you move, and tells you when you are ahead of pace while there is still time to ease off.', feature: 'Pacing budget', href: '/features/pacing-budget/', icon: 'pacing', pro: true },
    { q: 'Am I about to crash?', a: 'When your score has been sliding for days, or the markers that move first drift from your own normal, the Journal flags it and lists what moved.', feature: 'Crash warnings', href: '/features/hrv-readings/#crash-warnings', icon: 'alert' },
    { q: 'Am I actually getting better?', a: 'Week, month and year views show the slow change you cannot feel day to day, with today’s score set against your first fortnight of logging.', feature: 'Progress', href: '/features/hrv-readings/', icon: 'progress', pro: true },
    { q: 'Is this supplement doing anything?', a: 'Log what you take. Insights compares those days with your HRV, sleep and symptoms, and tells you what lines up, what shows no detected impact, and when it is too early to say.', feature: 'Insights', href: '/features/insights/', icon: 'insights', pro: true },
    { q: 'Why does my heart race when I stand?', a: 'POTS frequently develops after a viral infection. A guided stand test on your watch or strap measures your rise minute by minute, so you know whether it is part of your picture.', feature: 'POTS stand test', href: '/features/pots-stand-test/', icon: 'stand' },
    { q: 'Will my doctor take this seriously?', a: 'Turn months of readings, crashes, stand tests and symptoms into a clear summary for your appointment, written by the AI you choose.', feature: 'AI reports', href: '/features/doctor-reports/', icon: 'doctor', pro: true }
  ];
  const track: [string, string, string][] = [
    ['Morning HRV (RMSSD)', 'A reading under your own normal, especially a day or two after a big effort, is one of the earliest signs that strain is building.', 'Five minutes with your phone camera, Apple Watch, Garmin or a chest strap'],
    ['Resting and overnight heart rate', 'A resting rate that ticks up over a few days often comes before the crash you feel.', 'From your morning reading, plus overnight heart rate from Apple Health or Health Connect'],
    ['Exertion', 'Steps, time upright, workouts and the minutes your heart spends above your own exertion line: the load that post-exertional malaise answers to.', 'Read from Apple Health or Health Connect and counted against your pacing budget'],
    ['Crashes and PEM', 'When a crash hits, how long it lasts, and what the two days before it held.', 'Post-exertional malaise is a built-in symptom, logged in two taps'],
    ['Sleep', 'Unrefreshing or broken nights show up in the next morning’s numbers.', 'Nights arrive from Apple Health or Health Connect, with stages and overnight heart rate'],
    ['Standing heart rate', 'Whether POTS is part of your long COVID, and whether it is easing over the months.', 'A guided stand test on Apple Watch or a chest strap'],
    ['Symptoms', 'Brain fog, fatigue, shortness of breath, palpitations, chest tightness and temperature swings, and when each one hit.', 'Built-in symptoms for long COVID and dysautonomia, plus any you create'],
    ['Treatments and supplements', 'What you started or stopped, and when, so a change can be read against everything else that moved.', 'Meds and supplements logged with their timing, including types you create']
  ];
  const faq = [
    { q: 'What is the best app for tracking long COVID?', a: 'Yes. Autonomic is built for long COVID and the conditions that travel with it, like POTS and ME/CFS. It turns a five-minute morning reading into a daily score, paces your day with a budget in hours and minutes, warns you when your numbers start to slide, and shows what lines up with your better days. The journal is free and everything stays on your phone.' },
    { q: 'Can an app tell me if I am about to crash?', a: 'Not every time, and nothing can promise that. What it can do is watch the signals that often move first. A resting heart rate that ticks up and an HRV that sags in the day or two after a big effort frequently come before the crash you feel. Autonomic flags it when your score slides for days, or when two of those markers drift from your own normal at once, so you have a chance to rest before the crash fully lands.' },
    { q: 'How do I pace with long COVID?', a: 'Pacing means staying inside the amount of activity your body can currently absorb without a crash. Autonomic gives you that as a daily budget in hours and minutes, set each morning by your HRV, resting heart rate and sleep, and judged on the two days after each day, because post-exertional malaise usually lands 12 to 48 hours later.' },
    { q: 'Can Autonomic show whether my long COVID is improving?', a: 'It can show whether your numbers are. Your daily score is compared with your first fortnight of logging, and Progress charts every metric by week, month and year, so a slow climb shows up as a line rather than a feeling. It cannot tell you why you are improving, and it never claims to.' },
    { q: 'Do I need a wearable?', a: 'No. Your phone camera can take the morning HRV reading with a fingertip on the lens, and the pacing budget works from your steps and what you log. A watch or strap that writes heart rate to Apple Health or Health Connect makes the budget sharper, and the app says so when an estimate is thin.' },
    { q: 'Is my health data private?', a: 'Yes. Your journal lives on your phone. There is no account, no ads and no tracking, and every score and insight is worked out on the device. AI reports are built on your phone and only leave it if you choose to paste them into the AI you use.' },
    { q: 'Is Autonomic free?', a: `The journal is free forever, including unlimited HRV readings, crash warnings and your daily score. Autonomic Pro is ${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year and adds the pacing budget, your full history, Insights and AI reports. Every install starts with ${pricing.trialDays} days of Pro, with no card.` }
  ];
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['davis2023', 'iom2015', 'parker2023']);
  const about = [{ name: 'Long COVID', alternateName: ['Post-COVID-19 condition', 'Post-acute sequelae of SARS-CoV-2', 'PASC'] }];
  const features = ['A daily pacing budget in hours and minutes', 'Crash warnings when your numbers slide', 'Five-minute morning HRV readings', 'A POTS stand test', 'Symptom and trigger journal', 'Progress over months', 'Doctor summaries'];
</script>

<FeatureSeo
  name="Long COVID"
  {path}
  {faq}
  {sources}
  {about}
  {features}
  section={{ name: 'Conditions', path: '/conditions/' }}
  title="Long COVID Tracker App: Pacing, Crashes & Symptoms | Autonomic"
  description="A long COVID tracker that warns you before a crash, paces your day by your own HRV and heart rate, and shows the slow recovery you cannot feel. Private."
/>

<FeatureHero crumb={{ label: 'Conditions', href: '/conditions/' }} here="Long COVID" badge="FOR LONG COVID" name="Answers for life with long COVID." tagline="See the crash coming. See the climb back.">
  <svelte:fragment slot="lead">Autonomic is a long COVID tracker for iPhone and Android. A five-minute morning reading tells you how much today can take, warns you when your numbers start to slide, and keeps the long view of a recovery that rarely moves in a straight line. All of it stays on your phone.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-long-covid.webp);--pos:39% 40%" role="img" aria-label="A woman resting on the sofa under a knit blanket, phone in her hands"><Phone w={270}><div class="v2-ph-full"><JournalScreen time="7:12" score={61} grade="Moderate" gradeRgb="234,179,8" delta={-12} confidence={90} guide={SLIDING_GUIDE} figs={SLIDING_FIGS} notice={SLIDING_NOTICE} /></div></Phone></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>2 days</b><em>the delay before a crash</em><span>Post-exertional malaise usually lands 12 to 48 hours after the effort, so the pacing budget judges each day on the two days after it.</span></div>
    <div class="v2-stat"><b>2 signals</b><em>before a warning is raised</em><span>One wobbling number never raises the flag. It takes two markers drifting from your own normal at once, or a score that keeps sliding.</span></div>
    <div class="v2-stat"><b>+16 pts</b><em>better than day one</em><span>Recovery is slow enough to miss. Your score against your first fortnight shows whether the line is climbing. Figure from a sample journal.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions long COVID leaves you with, answered." sub="Each one is a part of the app. Tap a question to see how it works." items={answers} />

<Explainer tone="white" title="What long COVID is, and why it is so hard to read day to day.">
  <div class="v2-facts" slot="aside">
    <small>Long COVID at a glance</small>
    <dl>
      <div><dt>Single test</dt><dd>None</dd></div>
      <div><dt>Crash delay</dt><dd>12 to 48 hours</dd></div>
      <div><dt>Often overlaps</dt><dd>POTS, ME/CFS, MCAS</dd></div>
      <div><dt>Recovery</dt><dd>Slow, rarely a straight line</dd></div>
    </dl>
    <a href="/insights/postviral/long-covid-dysautonomia-symptoms/">Symptoms that point to dysautonomia →</a>
  </div>
  <p><strong>Long COVID</strong> is the name for symptoms that persist for weeks or months after a COVID infection: fatigue, brain fog, breathlessness, palpitations, unrefreshing sleep, and crashes after effort that seem out of all proportion to what caused them. There is no single test for it. It is defined by your history and by the pattern of your symptoms over time, which is exactly what makes it so easy to wave away in a fifteen-minute appointment.</p>
  <p>For many people, a large part of that pattern runs through the <strong>autonomic nervous system</strong>, the part of you that sets heart rate, blood pressure and temperature on autopilot. A heart that races when you stand, a thermostat that seems broken, and a crash a day or two after doing too much are all signs worth measuring. Long COVID also overlaps heavily with <a href="/conditions/pots/">POTS</a> and <a href="/conditions/me-cfs/">ME/CFS</a><Cite n={1} />, and our guide to <a href="/insights/postviral/long-covid-dysautonomia-symptoms/">long COVID symptoms that point to dysautonomia</a> maps out how the pieces fit.</p>
  <h3>Why long COVID is so hard to track by feel</h3>
  <p>Three things work against you. <strong>The crash is delayed</strong>: <a href="/insights/postviral/post-exertional-malaise-explained/">post-exertional malaise</a> usually lands 12 to 48 hours after the effort<Cite n={2} />, so the walk on Tuesday and the floor on Thursday never feel connected. <strong>Brain fog erases the record</strong>: when memory is one of the symptoms, “how was last month?” has no reliable answer. And <strong>recovery is slow and non-linear</strong>: good weeks and bad weeks hide a trend that only shows over months, which is why <a href="/insights/recovery/what-recovery-looks-like/">what recovery actually looks like</a> surprises so many people.</p>
  <h3>What tracking gives you back</h3>
  <ul>
    <li><strong>A budget for today</strong>, set by your own morning readings, so pacing stops depending on how you feel in the moment<Cite n={3} />. Good days are the ones most likely to tempt you over the edge.</li>
    <li><strong>An early flag</strong> when your numbers start to slide, so you can rest before the crash fully lands rather than after.</li>
    <li><strong>The long view</strong>, so a slow climb you cannot feel becomes a line you can point to.</li>
    <li><strong>A record that speaks for you.</strong> When <a href="/insights/pots/normal-test-results-but-still-sick/">your tests keep coming back normal</a>, months of readings, stand tests and symptoms are evidence a description can never be.</li>
  </ul>
  <h3>What Autonomic will not do</h3>
  <p>It will not diagnose long COVID, it will never tell you to start, stop or change a treatment, and it will never tell you to push through. It measures, organizes and points out patterns, and it says so when it has nothing to say. The decisions stay with you and your clinician.</p>
  <div class="v2-note"><span>If you have chest pain, trouble breathing, fainting, or symptoms that change suddenly, seek medical care. Autonomic is not a medical device.</span></div>
  <Sources items={sources} />
</Explainer>

<TrackTable eyebrow="" title="What to track with long COVID, and why." sub="The signals that move with long COVID, and how each one reaches your journal on the days you have nothing to spare." rows={track} />

<section class="v2-sec white">
  <div class="v2-wrap v2-split rev">
    <div class="v2-arch"><Phone w={260}><div class="v2-ph-full"><ProgressScreen time="9:19" /></div></Phone></div>
    <div>
      <h2 class="v2-h2">See the recovery you cannot feel.</h2>
      <p class="v2-sub">Long COVID recovery rarely moves in a straight line. Autonomic keeps every reading, so slow change shows up as a trend instead of a hunch.</p>
      <ol class="v2-numbered">
        <li><i>1</i><span><b>Better than day one</b>Today’s score set against your first fortnight of logging, in points on the same 0 to 100 scale.</span></li>
        <li><i>2</i><span><b>Week, month and year</b>Every metric over any range, so one bad week cannot erase a good month.</span></li>
        <li><i class="hot">3</i><span><b>What moved it</b>Insights lines your better stretches up against what you were taking and doing at the time. Linked, never proven.</span></li>
      </ol>
      <p class="v2-fine">Progress beyond the last 14 days, and Insights, are part of Pro.</p>
    </div>
  </div>
</section>

<MidCta title="See what today can take, starting tomorrow." sub="Free on iPhone and Android, with {pricing.trialDays} days of Pro. No card, no account." />

<section class="v2-sec plum2">
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2 on-dark">A heads-up before the floor falls out.</h2>
      <p class="v2-sub on-dark">When your score has been sliding for days, or two of the markers that tend to move first (resting and overnight heart rate, recovery after a workout, your standing rise, your symptom load) drift from your own normal at once, the Journal tells you and lists what moved. A notification can tell you when a slide starts.</p>
      <p class="v2-fine on-dark">An early flag, not a prediction. It can be wrong, and it never replaces how you feel. Crash warnings are free.</p>
      <a class="v2-link on-dark" href="/features/hrv-readings/#crash-warnings">How crash warnings work →</a>
    </div>
    <!-- The crash warning as it really arrives (reminders.ts: the downturn's
         title, its body for an exertion-led slide, and the app's closing line). -->
    <div class="v2-arch dark"><Phone w={260}><div class="v2-ph-full"><LockScreenHeadsUp date="Tuesday, October 14" time="7:12" title="Trending down" body="Activity has run heavy through the slide. This pattern often comes before a post-exertional crash, so scale back and rest. Open Autonomic to see what's behind this." /></div></Phone></div>
  </div>
</section>

<CompareTeaser slug="visible" title="Thinking about Visible?" sub="Many people with long COVID look at Visible first. Here is the short version." keys={['First year, all in', 'Hardware to buy', 'Guided POTS stand test', 'Where your data lives']} />

<Founder quote="I’m not healed, and I won’t pretend otherwise. But over the two years I’ve used my own early version of Autonomic, I’ve been able to see what genuinely helps and reach a far better place than I’d been in for a long time." />

<Faq title="Long COVID questions, answered" items={faq} />

<Related
  eyebrow=""
  title="About long COVID"
  hub={{ label: 'All long COVID articles', href: '/insights/postviral/' }}
  items={[
    { q: 'Why do I crash two days after doing too much?', slug: 'post-exertional-malaise-explained' },
    { q: 'Which long COVID symptoms point to dysautonomia?', slug: 'long-covid-dysautonomia-symptoms' },
    { q: 'Is it long COVID or POTS?', slug: 'is-it-long-covid-or-pots' },
    { q: 'What does recovery actually look like?', slug: 'what-recovery-looks-like' },
    { q: 'Why are my tests normal when I feel this sick?', slug: 'normal-test-results-but-still-sick' },
    { q: 'How did someone else track their way out of daily crashes?', slug: 'from-daily-crashes-to-living-again' }
  ]}
/>

<ConditionCards current="long-covid" />

<LatestArticles topic="postviral" title="The latest on long COVID" white />

<PageCta title="Tomorrow morning, see what today can take." sub="Free on iPhone and Android. Every install starts with {pricing.trialDays} days of Pro, pacing budget included, with no card." />
