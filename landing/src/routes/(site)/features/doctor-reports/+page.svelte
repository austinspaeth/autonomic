<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import Cite from '$lib/v2/Cite.svelte';
  import Sources from '$lib/v2/Sources.svelte';
  import { pickSources } from '$lib/v2/sources';
  // Cited in the Explainer, numbered in the order the <Cite> marks appear.
  const sources = pickSources(['thirunavukarasu2023']);
  const about = ['Postural orthostatic tachycardia syndrome', 'Long COVID', 'Myalgic encephalomyelitis/chronic fatigue syndrome'];
  const features = ['A medical summary for your doctor, written by the AI you choose', 'A full health report across every tracked area', 'Your data on its own, for any question you want to ask', 'Prompts built on your phone from your own journal', 'Works with Claude, Gemini or ChatGPT'];
  import FeatureHero from '$lib/v2/FeatureHero.svelte';
  import AiDemo from '$lib/v2/AiDemo.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import AiReportsSheetScreen from '$lib/v2/screens/AiReportsSheetScreen.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import MidCta from '$lib/v2/MidCta.svelte';
  import QuestionGrid from '$lib/v2/QuestionGrid.svelte';
  import Explainer from '$lib/v2/Explainer.svelte';
  import Related from '$lib/v2/Related.svelte';
  import MoreFeatures from '$lib/v2/MoreFeatures.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';
  import Faq from '$lib/v2/Faq.svelte';

  const path = '/features/doctor-reports/';
  // The AI Insights & Reports sheet (mobile/src/features/insights/AskAi.tsx):
  // two reports, both over everything logged, and a data-only prompt with a
  // period picker. Each put as the question it answers.
  const reports = [
    { r: 'Medical summary for doctor', q: 'Will my doctor take this seriously?', d: 'A print-ready document with your numbers laid out in tables: trends, stand tests, symptoms, medications with their timing, and questions worth asking.' },
    { r: 'Full health report', q: 'Where do I actually stand?', d: 'Every area you track, each with its numbers, its trend and what to look at next. One report that answers:', list: ['What keeps coming before my crashes?', 'What sets me back?', 'What made my good days good?', 'Is sleep behind my bad mornings?', 'How is my POTS trending?'] },
    { r: 'Data for prompt', q: 'Can I ask my own question?', d: 'Just your numbers for today, the past week, month or year, with no instructions attached. Paste them in and ask the AI anything you like.' }
  ];
  const sections = ['HRV and heart rate trends', 'Stand tests and episodes', 'Blood pressure', 'Resting heart rate', 'Sleep', 'Symptoms and triggers', 'Medications and supplements, with timing', 'Pacing history', 'Bowel habits', 'Daily scores', 'Your cycle, if you track it', 'Your notes'];
  // The page's own sections, each as the question it answers.
  const answers = [
    { q: 'Will my doctor take this seriously?', a: 'A print-ready medical summary with your numbers in tables, and the questions worth asking.', feature: 'Doctor summary', href: '#reports' },
    { q: 'What keeps coming before my crashes?', a: 'The full health report covers it, along with triggers, sleep and your best days, each with its numbers.', feature: 'Full health report', href: '#reports' },
    { q: 'What goes into a report?', a: 'The sections your clinician would ask about, with your real numbers, and nothing you never tracked.', feature: 'What goes in', href: '#sections' },
    { q: 'What would I actually get?', a: 'Copy the exact prompt the app builds over a sample journal and paste it into your own AI.', feature: 'Try a real prompt', href: '#ai' },
    { q: 'Does my data go to an AI company?', a: 'Only if you paste it. The prompt is written on your phone, and where it goes next is your decision.', feature: 'Private by design', href: '#privacy' },
    { q: 'How do I make a short appointment count?', a: 'What to bring, what to ask, and how to turn months of tracking into fifteen useful minutes.', feature: 'Before your appointment', href: '#appointment' }
  ];
  const faq = [
    { q: 'How do the AI reports work?', a: 'Open AI Insights & Reports on the Insights tab and pick the medical summary, the full health report, or your data on its own. Autonomic assembles your logged data into a structured prompt on your phone. You copy it into Claude, Gemini or ChatGPT, and that model writes the report.' },
    { q: 'Does my data go to an AI company?', a: 'Only if you paste it. The app never sends your journal anywhere. Nothing leaves your phone until you choose to copy the prompt, and you can read every word of it first.' },
    { q: 'Which AI should I use?', a: 'Whichever you already trust. The prompt is plain text written to work with Claude, Gemini or ChatGPT, so there is no account to make with us and no AI of ours in the middle.' },
    { q: 'What goes into a doctor summary?', a: 'Your HRV and heart rate trends, blood pressure, resting heart rate, sleep, symptoms, bowel habits, stand tests and episodes, medications and supplements with their timing, pacing history, daily scores, your cycle if you track it, and your notes, across everything you have logged. Anything you never tracked is left out rather than guessed.' },
    { q: 'Can I ask the AI my own question?', a: 'Yes. Data for prompt copies just your numbers for today, the past week, month or year, with no instructions attached, so you can ask whatever you want.' },
    { q: 'Are AI reports free?', a: `AI reports are part of Autonomic Pro, which is ${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year. Every install starts with ${pricing.trialDays} days of Pro, with no card, so you can try a report before your next appointment.` },
    { q: 'Is this medical advice?', a: 'No. Reports organize your data for a conversation with your clinician; they do not diagnose or treat. An AI can be wrong, so check the report against your journal, and never change a treatment because a report suggested it.' }
  ];
</script>

<FeatureSeo
  {sources}
  {about}
  {features}
  name="AI reports"
  {path}
  {faq}
  title="AI Health Reports & Doctor Summaries for POTS | Autonomic"
  description="Turn weeks of HRV, stand tests and symptoms into a clear doctor summary, written by the AI you choose. Your data leaves your phone only if you paste it."
/>

<FeatureHero icon="doctor" badge="PRO" name="AI reports" tagline="Doctor summaries from your own data.">
  <svelte:fragment slot="lead">Fifteen minutes is not long enough to describe six months. Autonomic turns your journal into a clear summary for your appointment, written by the AI you already trust, from numbers that never leave your phone unless you choose.</svelte:fragment>
  <div class="v2-arch tall photo" style="--photo:url(/people/hero-doctor.webp);--pos:72% 40%" role="img" aria-label="A woman showing her phone to her doctor across a desk"><Phone w={270}><div class="v2-ph-full"><AiReportsSheetScreen time="8:12" battery={0.85} /></div></Phone></div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    <div class="v2-stat"><b>2 reports</b><em>plus your data on its own</em><span>A summary for your doctor, a full health report, and your numbers by themselves for any question you want to ask.</span></div>
    <div class="v2-stat"><b>Your AI</b><em>Claude, Gemini or ChatGPT</em><span>Use the assistant you already trust. The app writes the prompt; you decide where it goes.</span></div>
    <div class="v2-stat"><b>All time</b><em>your whole journal, every time</em><span>Both reports cover everything you have logged, so your doctor sees the whole stretch, not one good week.</span></div>
  </div>
</section>

<ReviewStrip />

<QuestionGrid eyebrow="" tone="paper" title="The questions an AI report answers." sub="Tap a question to jump to how Autonomic answers it." items={answers} />

<section class="v2-sec white" id="reports">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Two reports, and your numbers to ask anything.</h2><p class="v2-sub">Open AI Insights &amp; Reports on the Insights tab and pick one. Each builds a prompt on your phone that you copy into your AI.</p></div>
    <div class="v2-g3">
      {#each reports as r}<div class="v2-devcard"><i>{r.r}</i><b>“{r.q}”</b><span>{r.d}</span>{#if r.list}<ul class="dr-list">{#each r.list as l}<li>{l}</li>{/each}</ul>{/if}</div>{/each}
    </div>
  </div>
</section>

<section class="v2-sec" id="sections">
  <div class="v2-wrap v2-split wide">
    <div>
      <h2 class="v2-h2">Everything you logged, none of the scrolling.</h2>
      <p class="v2-sub">The prompt carries the sections your clinician would ask about, with the real numbers, and leaves out whatever you never tracked rather than guessing.</p>
    </div>
    <div class="v2-tags">{#each sections as s}<span>{s}</span>{/each}</div>
  </div>
</section>

<AiDemo />

<MidCta title="Try AI reports free for {pricing.trialDays} days." sub="No card, no account. Your journal only leaves your phone if you paste it." />

<section class="v2-sec" id="privacy">
  <div class="v2-wrap">
    <div class="v2-trust-card">
      <span class="v2-trust-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.3" /></svg></span>
      <h2 class="v2-h2 sm">Your journal only leaves your phone if you paste it.</h2>
      <p class="v2-sub">The prompt is written on your phone, from data stored on your phone. Where it goes next is your decision, every time.</p>
      <div class="v2-ledger">
        <div class="v2-ledger-col stays">
          <b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10.5 18.5h3" /></svg>Stays on your phone</b>
          <ul>
            <li>Your whole journal, readings and symptoms</li>
            <li>The prompt, written and assembled here</li>
            <li>Every score, trend and insight behind it</li>
          </ul>
        </div>
        <div class="v2-ledger-col sends">
          <b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>Only if you choose</b>
          <ul>
            <li><strong>The prompt text</strong>, when you paste it into the AI you pick</li>
          </ul>
        </div>
      </div>
      <a class="v2-link" href="/privacy-policy/">Read the privacy policy →</a>
    </div>
  </div>
</section>

<Explainer tone="white" id="appointment" title="How to make a fifteen-minute appointment count.">
  <div class="v2-facts" slot="aside">
    <small>Your appointment, at a glance</small>
    <dl>
      <div><dt>Covers</dt><dd>Everything you have logged</dd></div>
      <div><dt>Report</dt><dd>Medical summary for doctor</dd></div>
      <div><dt>Bring</dt><dd>One page, three questions</dd></div>
      <div><dt>Own question</dt><dd>Data for prompt</dd></div>
    </dl>
    <a href="/insights/recovery/turn-your-data-into-a-doctor-conversation/">Turn data into a conversation →</a>
  </div>
  <p>Clinicians get a few minutes, you get nervous, and months of nuance collapse into “I’ve been tired.” That is nobody’s fault. A short visit is built for a snapshot, and what you live with is a pattern. It is also why so many people with <a href="/conditions/pots/">POTS</a>, <a href="/conditions/long-covid/">long COVID</a> and <a href="/conditions/me-cfs/">ME/CFS</a> hear that <a href="/insights/pots/normal-test-results-but-still-sick/">their tests look normal</a> while they feel anything but.</p>
  <h3>What a clinician can actually use</h3>
  <ul>
    <li><strong>Trends, not adjectives.</strong> “My resting heart rate is up nine beats since August” gives a clinician something to work with. “I feel worse” does not.</li>
    <li><strong>Your worst and best days, side by side.</strong> What was different about each is often the most useful page you can bring.</li>
    <li><strong>What you tried, and when.</strong> Salt, compression, a supplement, a medication change, with dates. Your data shows what lined up with what; your clinician judges what it means.</li>
    <li><strong>Two or three specific questions.</strong> A visit that ends on your questions is a visit that answered them.</li>
  </ul>
  <h3>Using Autonomic before your visit</h3>
  <ol>
    <li>Open AI Insights &amp; Reports on the Insights tab.</li>
    <li>Pick the medical summary for doctor. For one specific question, use Data for prompt with the past month and ask it.</li>
    <li>Paste the prompt into your AI, read what comes back, and check the numbers against your journal.</li>
    <li>Bring one page and your questions. If your clinician wants more detail, bring the full health report too.</li>
  </ol>
  <h3>What AI is good at, and what it is not</h3>
  <p>An AI is very good at turning weeks of numbers into a page someone can read in two minutes. It is not your clinician. It can misread a pattern or sound more certain than the data allows<Cite n={1} />, which is why the numbers in the prompt come straight from your journal and you can check every one. Treat a report as a starting point for the conversation, never as a reason to start, stop or change a treatment.</p>
  <div class="v2-note"><span>Not medical advice. Reports organize your data for a conversation with your clinician. They do not diagnose or treat.</span></div>
  <Sources items={sources} />
</Explainer>

<Faq title="AI report questions, answered" items={faq} />

<Related
  eyebrow=""
  title="About your appointment"
  hub={{ label: 'All recovery articles', href: '/insights/recovery/' }}
  items={[
    { q: 'How do I turn my data into a conversation?', slug: 'turn-your-data-into-a-doctor-conversation' },
    { q: 'What if my tests keep coming back normal?', slug: 'normal-test-results-but-still-sick' },
    { q: 'What do autonomic function tests involve?', slug: 'autonomic-function-tests-what-to-expect' },
    { q: 'How is POTS diagnosed?', slug: 'how-pots-is-diagnosed' }
  ]}
/>
<MoreFeatures current="doctor-reports" />
<PageCta title="Walk into your next appointment with evidence." sub="{pricing.trialDays} days of Pro free. No card, no account." />

<style>
  .dr-list { margin: 10px 0 0; padding-left: 18px; color: var(--mute); font-size: 15px; line-height: 1.6; }
  .v2-devcard b { color: #5c1f92; }
</style>
