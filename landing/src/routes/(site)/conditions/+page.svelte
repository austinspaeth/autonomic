<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import { CONDITIONS } from '$lib/v2/conditions';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import PacingSheetScreen from '$lib/v2/screens/PacingSheetScreen.svelte';
  import InsightsTabScreen from '$lib/v2/screens/InsightsTabScreen.svelte';
  import MidCta from '$lib/v2/MidCta.svelte';
  import PhotoBand from '$lib/v2/PhotoBand.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import Explainer from '$lib/v2/Explainer.svelte';
  import Faq from '$lib/v2/Faq.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';
  import Cite from '$lib/v2/Cite.svelte';
  import Sources from '$lib/v2/Sources.svelte';
  import { pickSources } from '$lib/v2/sources';

  const path = '/conditions/';
  const g = (topic: string, slug: string, t: string) => ({ href: `/insights/${topic}/${slug}/`, t });

  // What the hub shows for each condition: its photo (static/people, stills of
  // the person in the home page film), its hallmark in one line, what to track,
  // the feature that answers it, its other names (for search and structured
  // data) and the guide to read first. The detail lives on each condition page.
  const DETAIL: Record<string, { photo: string; pos?: string; hallmark: string; track: string; tool: { name: string; href: string }; alt: string[]; guide: { href: string; t: string } }> = {
    pots: {
      photo: '/people/conditions-pots.webp', pos: '74% 50%',
      hallmark: 'Your heart rate jumps 30 beats or more within ten minutes of standing, and stays up.',
      track: 'Standing heart rate rise, morning HRV, salt and fluids',
      tool: { name: 'POTS stand test', href: '/features/pots-stand-test/' },
      alt: ['Postural orthostatic tachycardia syndrome', 'Postural tachycardia syndrome'],
      guide: g('pots', 'how-pots-is-diagnosed', 'How POTS is diagnosed')
    },
    'long-covid': {
      photo: '/people/conditions-long-covid.webp',
      hallmark: 'Symptoms that last months after a COVID infection, often with POTS-like heart rate swings or crashes after effort.',
      track: 'Morning HRV, resting heart rate, effort and crashes',
      tool: { name: 'Pacing budget', href: '/features/pacing-budget/' },
      alt: ['Post-COVID-19 condition', 'Post-acute sequelae of SARS-CoV-2', 'PASC'],
      guide: g('postviral', 'is-it-long-covid-or-pots', 'Is it long COVID or POTS?')
    },
    'me-cfs': {
      photo: '/people/conditions-me-cfs.webp',
      hallmark: 'A crash that lands a day or two after doing too much, called post-exertional malaise.',
      track: 'Daily effort, the two days after, sleep and symptoms',
      tool: { name: 'Pacing budget', href: '/features/pacing-budget/' },
      alt: ['Myalgic encephalomyelitis', 'Chronic fatigue syndrome', 'Systemic exertion intolerance disease'],
      guide: g('postviral', 'post-exertional-malaise-explained', 'Post-exertional malaise, explained')
    },
    dysautonomia: {
      photo: '/people/conditions-dysautonomia.webp',
      hallmark: 'The nervous system that runs heart rate, blood pressure, digestion and temperature stops keeping its balance.',
      track: 'Morning HRV, resting heart rate, blood pressure, sleep',
      tool: { name: 'Journal + HRV', href: '/features/hrv-readings/' },
      alt: ['Autonomic dysfunction', 'Autonomic neuropathy'],
      guide: g('basics', 'autonomic-nervous-system-and-dysautonomia-guide', 'The autonomic nervous system, explained')
    },
    'chronic-illness': {
      photo: '/people/conditions-chronic-illness.webp',
      hallmark: 'Good days and bad days with no obvious reason, and a long list of things you are trying.',
      track: 'What you take and do, triggers, symptoms, sleep',
      tool: { name: 'Insights', href: '/features/insights/' },
      alt: [],
      guide: g('recovery', 'find-your-triggers-symptom-journal', 'Find your triggers with a journal')
    }
  };

  // For readers without a diagnosis: the symptom in a few words, to the guide
  // that explains it. The link text is the question people type.
  const symptoms = [
    { t: 'My heart races when I stand', href: '/insights/pots/the-orthostatic-stand-test-at-home/' },
    { t: 'I crash a day or two after doing too much', href: '/insights/postviral/post-exertional-malaise-explained/' },
    { t: 'I wake at 3am with my heart pounding', href: '/insights/pots/adrenaline-dumps-pots/' },
    { t: 'I am tired all the time', href: '/insights/postviral/why-am-i-so-tired-pots-long-covid-fatigue/' },
    { t: 'My head feels foggy', href: '/insights/postviral/long-covid-brain-fog/' },
    { t: 'I feel dizzy or lightheaded', href: '/insights/pots/dizziness-lightheadedness-pots-dysautonomia/' },
    { t: 'I can’t get a full breath', href: '/insights/postviral/air-hunger-long-covid-pots/' },
    { t: 'My body buzzes or vibrates inside', href: '/insights/postviral/internal-tremors-long-covid-dysautonomia/' },
    { t: 'Everything is worse before my period', href: '/insights/hrv/menstrual-cycle-hrv-pots/' },
    { t: 'Is it POTS or anxiety?', href: '/insights/pots/is-it-pots-or-anxiety/' },
    { t: 'Hot showers make it worse', href: '/insights/pots/hot-showers-pots/' },
    { t: 'My tests are normal, but I feel sick', href: '/insights/pots/normal-test-results-but-still-sick/' }
  ];

  // Conditions that travel with the five. Only ones we have a guide for.
  const MORE = [
    { name: 'MCAS', body: 'Allergic-type flares with no clear allergy.', guide: g('postviral', 'pots-long-covid-and-mcas-overlap', 'POTS, long COVID and MCAS') },
    { name: 'hEDS and hypermobility', body: 'Bendy joints that often come with POTS.', guide: g('pots', 'hypermobility-eds-and-pots', 'Hypermobility, hEDS and POTS') },
    { name: 'Fibromyalgia', body: 'Widespread pain and fatigue, often with POTS.', guide: g('recovery', 'fibromyalgia-dysautonomia-pots-hrv', 'Fibromyalgia and dysautonomia') },
    { name: 'Sjögren’s', body: 'Dry eyes and mouth that can reach the nerves.', guide: g('pots', 'sjogrens-dysautonomia-pots', 'Sjögren’s and dysautonomia') },
    { name: 'Small fiber neuropathy', body: 'Burning, tingling and odd sweating.', guide: g('pots', 'small-fiber-neuropathy-pots-long-covid', 'Small fiber neuropathy') },
    { name: 'Orthostatic hypotension', body: 'Blood pressure that drops when you stand.', guide: g('pots', 'orthostatic-hypotension-vs-pots', 'Orthostatic hypotension vs POTS') },
    { name: 'Inappropriate sinus tachycardia', body: 'A heart that runs fast even at rest.', guide: g('pots', 'inappropriate-sinus-tachycardia-vs-pots', 'IST vs POTS') },
    { name: 'Vasovagal syncope', body: 'Fainting, or nearly fainting.', guide: g('basics', 'vasovagal-syncope-fainting', 'Vasovagal syncope') },
    { name: 'Migraine', body: 'Headaches that often travel with POTS.', guide: g('pots', 'headaches-migraines-pots-dysautonomia', 'Headaches and migraines') },
    { name: 'Gastroparesis', body: 'Slow digestion, nausea and early fullness.', guide: g('pots', 'gastroparesis-pots-dysautonomia', 'Gastroparesis and POTS') },
    { name: 'SIBO', body: 'Gut trouble that often comes with dysautonomia.', guide: g('food', 'sibo-histamine-gut-dysautonomia', 'SIBO and histamine') },
    { name: 'Reactive hypoglycemia', body: 'Blood sugar crashes a few hours after eating.', guide: g('food', 'reactive-hypoglycemia-blood-sugar-pots', 'Blood sugar swings') },
    { name: 'Thyroid conditions', body: 'A thyroid that can mimic POTS and lower HRV.', guide: g('pots', 'thyroid-hrv-pots', 'Thyroid and HRV') },
    { name: 'Sleep apnea', body: 'Breathing pauses at night that strain the system.', guide: g('hrv', 'sleep-apnea-and-hrv-dysautonomia', 'Sleep apnea and HRV') },
    { name: 'Perimenopause and menopause', body: 'Hormone shifts that bring palpitations and flushes.', guide: g('hrv', 'menopause-hrv-dysautonomia', 'Menopause and HRV') }
  ];

  // The three core tools, each with the conditions it helps most. The journal
  // and doctor summaries sit under all of them, so they close the section.
  const ALL = CONDITIONS.map((c) => c.slug);
  const TOOLS = [
    { key: 'hrv', name: 'Morning HRV reading', tag: 'FREE', href: '/features/hrv-readings/', body: 'Five minutes each morning shows how your nervous system recovered overnight, against your own normal.', helps: ALL },
    { key: 'pacing', name: 'Pacing budget', tag: 'PRO', href: '/features/pacing-budget/', body: 'How much today can take, in hours and minutes, so you stop before the crash rather than after it.', helps: ['me-cfs', 'long-covid', 'pots'] },
    { key: 'insights', name: 'Insights', tag: 'PRO', href: '/features/insights/', body: 'What lines up with your better days: the supplement, the salt, the early night, or nothing at all.', helps: ['chronic-illness', 'long-covid', 'pots'] }
  ];
  const condBy = Object.fromEntries(CONDITIONS.map((c) => [c.slug, c]));

  const sources = pickSources(['davis2023', 'vernino2021', 'iom2015', 'sheldon2015']);
  const about = CONDITIONS.filter((c) => DETAIL[c.slug].alt.length).map((c) => ({ name: c.title, alternateName: DETAIL[c.slug].alt, url: `https://autonomic.care${c.href}` }));
  const features = ['Five-minute HRV readings with a phone camera, watch or chest strap', 'A guided POTS stand test', 'A pacing budget for post-exertional malaise', 'A symptom, trigger and medication journal', 'Insights into what lines up with better days', 'Summaries for your doctor'];

  const faq = [
    { q: 'What is the difference between POTS and dysautonomia?', a: 'Dysautonomia is the umbrella term for any problem with the autonomic nervous system, the part that runs heart rate, blood pressure, digestion and temperature without you thinking about it. POTS is one form of it, defined by a heart rate rise of at least 30 beats per minute within ten minutes of standing (40 for ages 12 to 19), without a large drop in blood pressure, with symptoms for at least three months.' },
    { q: 'Can long COVID cause POTS?', a: 'Yes. POTS and other forms of dysautonomia are among the most commonly reported problems after COVID-19. Many people with long COVID notice a racing heart on standing for the first time after their infection, which is why a stand test is worth doing if that sounds familiar.' },
    { q: 'Is ME/CFS the same as long COVID?', a: 'No, but they overlap. ME/CFS can follow many different infections and was described long before COVID. Its defining feature is post-exertional malaise, a delayed crash after effort. A substantial share of people with long COVID meet the criteria for ME/CFS, and pacing matters for both.' },
    { q: 'What kind of doctor treats POTS and dysautonomia?', a: 'Usually a cardiologist or a neurologist, ideally one with an autonomic specialty, and often alongside your primary care doctor. Many long COVID clinics also see dysautonomia. A record of your stand tests and symptoms helps whoever you see.' },
    { q: 'How is POTS diagnosed?', a: 'With a symptom history and an active stand test or a tilt table test, and by ruling out other causes such as dehydration, anemia, thyroid problems and medications. A home stand test cannot diagnose POTS, but it can show your clinician what standing does to you over weeks.' },
    { q: 'Do I need a diagnosis to use Autonomic?', a: 'No. Plenty of people start tracking while they wait for answers, and a careful record of your readings and symptoms can make that first appointment far more useful. Autonomic does not diagnose anything; it keeps the record.' },
    { q: 'I live with more than one of these. Does that matter?', a: 'No, and it is common. Every number in Autonomic is read against your own history rather than a population average, so it works the same whether you carry one diagnosis or four, and Insights looks across everything you log.' },
    { q: 'Is Autonomic a medical device?', a: 'No. It is a personal tracking tool. It organizes your data and points out patterns, and it never tells you to start, stop or change a treatment. Always work with your clinician.' },
    { q: 'How much does Autonomic cost?', a: `The journal is free forever, with no account and no ads, including unlimited HRV readings and your daily score. Autonomic Pro is ${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year, and every install starts with ${pricing.trialDays} days of Pro, with no card.` }
  ];
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Conditions Autonomic is built for',
      itemListElement: CONDITIONS.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title, url: `https://autonomic.care${c.href}` }))
    }
  ];
</script>

<FeatureSeo
  name="Conditions"
  {path}
  section={null}
  {faq}
  {ld}
  {sources}
  {about}
  {features}
  image="https://autonomic.care/og/features/conditions.jpg"
  title="POTS, Long COVID, ME/CFS & Dysautonomia Guides | Autonomic"
  description="Answers for POTS, long COVID, ME/CFS and dysautonomia: what each one is, how they overlap, symptom guides, and what to track to feel more in control."
/>

<section class="v2-phead ch-hero" id="conditions">
  <div class="v2-wrap">
    <nav class="v2-crumb" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>Conditions</span></nav>
    <h1>Answers for POTS, long COVID, ME/CFS and dysautonomia.</h1>
    <h2 class="ch-pick">Which one sounds like you?</h2>
    <div class="ch-tiles">
      {#each CONDITIONS as c, i}
        {@const d = DETAIL[c.slug]}
        <a class="ch-tile" href={c.href}>
          <img src={d.photo} width="720" height="720" alt="" style:object-position={d.pos} loading={i < 3 ? 'eager' : 'lazy'} />
          <span class="ch-tile-t"><small>{c.question}</small><h3>{c.title}</h3></span>
          <i aria-hidden="true">→</i>
        </a>
      {/each}
      <a class="ch-tile" href="#symptoms">
        <img src="/people/conditions-unsure.webp" width="720" height="720" alt="" loading="lazy" />
        <span class="ch-tile-t"><small>No diagnosis yet?</small><h3>Pick symptoms</h3></span>
        <i aria-hidden="true">↓</i>
      </a>
    </div>
  </div>
</section>

<section class="v2-sec white" id="symptoms">
  <div class="v2-wrap ch-split">
    <div class="ch-split-art"><img src="/people/symptoms-standing.webp" width="614" height="768" alt="A woman in her kitchen steadying herself on the counter, one hand to her forehead" loading="lazy" /></div>
    <div>
      <h2 class="v2-h2">Or start from what you feel.</h2>
      <p class="v2-sub">Pick what sounds like you. Each one opens a short, plain-language guide.</p>
      <ul class="ch-symptoms">
        {#each symptoms as s}<li><a href={s.href}><span>{s.t}</span><b aria-hidden="true">→</b></a></li>{/each}
      </ul>
    </div>
  </div>
</section>

<section class="v2-sec" id="start">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">One app for all of them.</h2><p class="v2-sub">Three tools, and the conditions each one helps most. Start free with one morning reading.</p></div>
    <div class="ch-tools">
      {#each TOOLS as t}
        <article class="ch-tool-card">
          <div class="ch-tool-art">
            {#if t.key === 'hrv'}<Phone w={200} src="/features/live-hrv.webp" alt="A live HRV reading in Autonomic" />
            {:else}<Phone w={200}><div class="v2-ph-full">
              {#if t.key === 'pacing'}<PacingSheetScreen time="8:48" battery={0.9} />{:else}<InsightsTabScreen />{/if}
            </div></Phone>{/if}
          </div>
          <div class="ch-tool-body">
            <div class="ch-tool-head"><h3><a href={t.href}>{t.name}</a></h3><span class="ch-tag">{t.tag}</span></div>
            <p>{t.body}</p>
            <div class="ch-helps">
              <small>{t.helps.length === ALL.length ? 'Helps with every condition here' : 'Helps most with'}</small>
              <div>{#each t.helps as h}<a href={condBy[h].href}>{condBy[h].title}</a>{/each}</div>
            </div>
          </div>
        </article>
      {/each}
    </div>
    <p class="ch-tools-foot">All three sit on one <a href="/features/hrv-readings/#journal">journal</a> for symptoms, meds and triggers, and turn into a <a href="/features/doctor-reports/">summary for your doctor</a>. With POTS, a guided <a href="/features/pots-stand-test/">stand test</a> measures what standing does to you.</p>
  </div>
</section>

<MidCta title="Take your first reading tomorrow morning." sub="Free on iPhone and Android, with {pricing.trialDays} days of Pro. No card, no account." />

<section class="v2-sec white" id="more">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Living with something else too?</h2><p class="v2-sub">These often travel with POTS, long COVID and ME/CFS. Log their symptoms in the same journal, and Insights reads them all together. Each opens a guide.</p></div>
    <ul class="ch-more">
      {#each MORE as m}<li><a href={m.guide.href}><b>{m.name}</b><span>{m.body}</span><i aria-hidden="true">→</i></a></li>{/each}
    </ul>

    <details class="ch-compare" id="compare">
      <summary>Compare POTS, long COVID, ME/CFS and dysautonomia side by side</summary>
      <div class="ch-table-wrap">
        <table class="ch-table">
          <thead><tr><th scope="col">Condition</th><th scope="col">What defines it</th><th scope="col">Worth tracking</th><th scope="col">In Autonomic</th><th scope="col">Read first</th></tr></thead>
          <tbody>
            {#each CONDITIONS as c}
              {@const d = DETAIL[c.slug]}
              <tr><th scope="row"><a href={c.href}>{c.title}</a></th><td>{d.hallmark}</td><td>{d.track}</td><td><a class="ch-tool" href={d.tool.href}>{d.tool.name}</a></td><td><a href={d.guide.href}>{d.guide.t}</a></td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </details>
  </div>
</section>

<Explainer id="overlap" title="Why these conditions so often travel together.">
  <div class="v2-facts" slot="aside">
    <small>What they share</small>
    <dl>
      <div><dt>Often starts with</dt><dd>An infection</dd></div>
      <div><dt>Shared thread</dt><dd>Autonomic dysregulation</dd></div>
      <div><dt>Measured by</dt><dd>HRV, heart rate, standing</dd></div>
    </dl>
    <a href="/insights/postviral/pots-long-covid-and-mcas-overlap/">Why they travel together →</a>
  </div>
  <p>POTS, long COVID, ME/CFS, mast cell activation syndrome (MCAS) and other forms of dysautonomia overlap far more than chance would suggest. Many people meet the criteria for more than one, and many arrived the same way: an infection, often a virus, after which the body’s automatic controls never quite settled back<Cite n={1} />.</p>
  <p>Each has its own defining feature. <a href="/conditions/pots/">POTS</a> is a heart rate that races when you stand<Cite n={[2, 4]} />. <a href="/conditions/me-cfs/">ME/CFS</a> centers on post-exertional malaise, the delayed crash after doing too much<Cite n={3} />. <a href="/conditions/long-covid/">Long COVID</a> can look like either, or both. What they share is a <a href="/conditions/dysautonomia/">nervous system struggling to keep its balance</a>, which is why the same few signals, HRV, heart rate and what standing does to you, say so much about all of them. Autonomic is built around those signals, and reads each one against your own normal, so it works whether you carry one diagnosis or several.</p>
  <div class="v2-note"><span>Autonomic does not diagnose any condition, and it is not a medical device. It is a careful record of how you are, to share with the people treating you.</span></div>
  <Sources items={sources} />
</Explainer>

<ReviewStrip />

<PhotoBand src="/people/hero-recovery.webp" alt="A woman smiling on a sunny morning walk, coffee in hand" title="Good days come back." body="Recovery is rarely a straight line, but the slow climb is real, and your numbers can show it before you feel it." link="What recovery actually looks like" href="/insights/recovery/what-recovery-looks-like/" />

<div id="questions"><Faq title="Questions people ask about these conditions" items={faq} /></div>

<PageCta title="Start with one reading tomorrow morning." sub="Free on iPhone and Android, with {pricing.trialDays} days of Pro. No card, no account." />

<style>
  /* Hero: the question, then six photo tiles that ARE the navigation. */
  .ch-pick { margin: 18px 0 0; font-size: 22px; font-weight: 700; letter-spacing: -.01em; color: var(--ink); }
  .ch-hero h1 { font-size: clamp(38px, 5vw, 64px); max-width: 15ch; margin-left: auto; margin-right: auto; }
  .ch-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 36px; text-align: left; }
  .ch-tile { position: relative; display: block; height: 340px; border-radius: 26px; overflow: hidden; background: var(--plum); color: #fff; isolation: isolate; }
  .ch-tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; transition: transform .5s cubic-bezier(.2,.7,.2,1); z-index: -1; }
  .ch-tile::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(20,14,26,0) 35%, rgba(20,14,26,.82) 100%); }
  .ch-tile-t { position: absolute; left: 22px; right: 64px; bottom: 20px; display: flex; flex-direction: column; gap: 6px; }
  .ch-tile-t small { font-size: 15px; font-weight: 600; line-height: 1.3; color: rgba(255,255,255,.85); }
  .ch-tile-t h3 { margin: 0; color: #fff; font-size: 32px; font-weight: 800; letter-spacing: -.03em; line-height: 1; }
  .ch-tile > i { position: absolute; right: 20px; bottom: 20px; width: 40px; height: 40px; border-radius: 20px; background: #fff; color: var(--ink); display: flex; align-items: center; justify-content: center; font-style: normal; font-weight: 800; transition: transform .15s; }
  @media (hover: hover) { .ch-tile:hover img { transform: scale(1.04); } .ch-tile:hover > i { transform: translateX(3px); } }
  .ch-tile:focus-visible { outline: 3px solid var(--red); outline-offset: 3px; }

  /* Symptoms: a portrait beside a short list of plain links. */
  .ch-split { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 64px; align-items: center; }
  .ch-split-art { aspect-ratio: 4 / 5; border-radius: 220px 220px 30px 30px; overflow: hidden; background: var(--lilac); }
  .ch-split-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ch-split .v2-h2 { text-align: left; }
  .ch-split .v2-sub { text-align: left; margin-left: 0; }
  .ch-symptoms { list-style: none; margin: 24px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ch-symptoms a { display: flex; align-items: center; gap: 12px; height: 100%; padding: 15px 18px; border-radius: 16px; background: var(--paper); color: var(--ink); font-weight: 700; font-size: 15.5px; line-height: 1.3; }
  .ch-symptoms b { margin-left: auto; color: var(--red); transition: transform .15s; }
  @media (hover: hover) { .ch-symptoms a:hover { box-shadow: 0 0 0 2px #d3c8d6; } .ch-symptoms a:hover b { transform: translateX(3px); } }

  /* One app: the three core tools, each with the conditions it helps most. */
  .ch-tools { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .ch-tool-card { display: flex; flex-direction: column; border-radius: 26px; background: #fff; overflow: hidden; }
  .ch-tool-art { height: 270px; padding-top: 26px; display: flex; justify-content: center; overflow: hidden; background: var(--lilac); }
  .ch-tool-body { flex: 1; display: flex; flex-direction: column; gap: 10px; padding: 20px 22px 22px; }
  .ch-tool-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; }
  .ch-tool-head h3 { margin: 0; font-size: 21px; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; }
  .ch-tool-head h3 a { color: var(--ink); }
  .ch-tag { font-size: 11px; font-weight: 800; letter-spacing: .04em; color: var(--plum); background: var(--lilac); border-radius: 999px; padding: 3px 9px; }
  .ch-tool-body p { flex: 1; margin: 0; color: var(--mute); font-size: 15px; line-height: 1.5; }
  .ch-helps { padding-top: 12px; border-top: 1px solid #ece6ee; }
  .ch-helps small { display: block; margin-bottom: 8px; font-size: 13px; color: var(--mute); }
  .ch-helps div { display: flex; flex-wrap: wrap; gap: 6px; }
  .ch-helps a { padding: 5px 11px; border-radius: 999px; background: var(--paper); color: var(--ink); font-size: 13.5px; font-weight: 700; }
  .ch-helps a:hover { box-shadow: 0 0 0 2px #d3c8d6; }
  .ch-tools-foot { margin: 26px auto 0; max-width: 720px; text-align: center; color: var(--mute); font-size: 16px; line-height: 1.6; }
  .ch-tools-foot a { color: var(--red); font-weight: 700; }

  /* Living with something else: one line each. */
  .ch-more { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .ch-more a { height: 100%; box-sizing: border-box; align-content: center; display: grid; grid-template-columns: 1fr auto; column-gap: 12px; align-items: center; padding: 16px 18px; border-radius: 16px; background: var(--paper); color: var(--ink); }
  .ch-more b { font-size: 17px; font-weight: 800; }
  .ch-more span { grid-column: 1; color: var(--mute); font-size: 14.5px; margin-top: 2px; }
  .ch-more i { grid-column: 2; grid-row: 1 / span 2; font-style: normal; color: var(--red); font-weight: 800; transition: transform .15s; }
  @media (hover: hover) { .ch-more a:hover { box-shadow: 0 0 0 2px #d3c8d6; } .ch-more a:hover i { transform: translateX(3px); } }


  /* The side-by-side table, folded away until asked for. */
  .ch-compare { margin-top: 28px; border-radius: 20px; background: var(--paper); }
  .ch-compare summary { list-style: none; cursor: pointer; padding: 18px 22px; font-weight: 800; font-size: 16px; display: flex; align-items: center; gap: 12px; }
  .ch-compare summary::-webkit-details-marker { display: none; }
  .ch-compare summary::after { content: '+'; margin-left: auto; color: var(--red); font-size: 22px; line-height: 1; }
  .ch-compare[open] summary::after { content: '–'; }
  .ch-table-wrap { margin: 0 12px 12px; border-radius: 16px; background: #fff; overflow: hidden; }
  .ch-table { width: 100%; border-collapse: collapse; font-size: 14.5px; line-height: 1.5; }
  .ch-table th, .ch-table td { padding: 14px 16px; text-align: left; vertical-align: top; border-bottom: 1px solid #ece6ee; }
  .ch-table tbody tr:last-child > * { border-bottom: 0; }
  .ch-table thead th { font-size: 12.5px; font-weight: 700; color: var(--mute); background: #faf8fa; }
  .ch-table tbody th { width: 14%; font-weight: 800; }
  .ch-table a { color: var(--ink); text-decoration: underline; text-decoration-color: #d3c8d6; text-underline-offset: 3px; }
  .ch-table a.ch-tool { color: var(--red); font-weight: 700; text-decoration: none; white-space: nowrap; }

  @media (max-width: 960px) {
    .ch-tiles { grid-template-columns: 1fr 1fr; }
    .ch-tile { height: 300px; }
    .ch-split { grid-template-columns: 1fr; gap: 32px; }
    .ch-split-art { width: min(100%, 320px); margin: 0 auto; }
    .ch-more { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 760px) { .ch-tools { grid-template-columns: 1fr; max-width: 460px; margin: 0 auto; } }
  @media (max-width: 620px) {
    .ch-tiles { gap: 10px; margin-top: 26px; }
    .ch-tile { height: 230px; border-radius: 20px; }
    .ch-tile-t { left: 14px; right: 14px; bottom: 14px; }
    .ch-tile-t small { font-size: 12.5px; }
    .ch-tile-t h3 { font-size: 21px; }
    .ch-tile > i { display: none; }
    .ch-symptoms, .ch-more, .ch-tools { grid-template-columns: 1fr; }
    .ch-tool-art { height: 240px; }
    .ch-split-art { display: none; }
    .ch-table thead { display: none; }
    .ch-table, .ch-table tbody, .ch-table tr, .ch-table th, .ch-table td { display: block; width: auto; }
    .ch-table tr { padding: 14px 16px; border-bottom: 1px solid #ece6ee; }
    .ch-table tbody tr:last-child { border-bottom: 0; }
    .ch-table th, .ch-table td { padding: 3px 0; border: 0; }
    .ch-table tbody th { width: auto; font-size: 17px; margin-bottom: 4px; }
    .ch-table td:nth-of-type(2)::before { content: 'Worth tracking: '; color: var(--mute); }
    .ch-table td:nth-of-type(3)::before { content: 'In Autonomic: '; color: var(--mute); }
    .ch-table td:nth-of-type(4)::before { content: 'Read first: '; color: var(--mute); }
  }
</style>
