<script lang="ts">
  import { pricing } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import ConditionCards from '$lib/v2/ConditionCards.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';

  // The four answers the home page names, each a link into the app's pages.
  const answers = [
    { q: 'Is today a good day?', a: 'A score out of 100 each morning, built from your own readings.', href: '/features/hrv-readings/' },
    { q: 'How much can I do?', a: 'A budget in hours and minutes that spends down as you move.', href: '/features/pacing-budget/' },
    { q: 'Am I about to crash?', a: 'An early warning when your numbers start to slide.', href: '/features/hrv-readings/#crash-warnings' },
    { q: 'What is actually helping?', a: 'What lines up with your better days, from your own log.', href: '/features/insights/' }
  ];

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'The story behind Autonomic',
      url: 'https://autonomic.care/story/',
      about: { '@id': 'https://autonomic.care/#organization' },
      author: { '@type': 'Person', name: 'Austin Spaeth', jobTitle: 'Founder of Autonomic', image: 'https://autonomic.care/me.jpg' }
    }
  ];
</script>

<FeatureSeo
  name="Our story"
  path="/story/"
  section={null}
  {ld}
  title="Our Story: Why a Long Hauler Built Autonomic | Autonomic"
  description="Why Autonomic exists: a founder with long COVID, specialist after specialist with no real answers, and the private tracking app he built to make sense of it."
/>

<section class="v2-phead">
  <div class="v2-wrap">
    <h1>I built this because I needed it.</h1>
  </div>
</section>

<section class="v2-sec nopad-top">
  <div class="v2-wrap">
    <figure class="v2-story-photo">
      <img src="/journey-family-wide.webp" width="900" height="377" alt="Austin, founder of Autonomic, with his wife and six children in South Carolina" />
    </figure>
    <div class="v2-story">
      <div class="v2-prose">
        <p>For more than four years, I’ve been living with long COVID. It started with blood pressure that spiked out of nowhere, a heart that raced the moment I stood up, brain fog that swallowed whole days, and a long list of symptoms that never quite fit together. I saw specialist after specialist in cardiology, neurology and beyond, and kept leaving with the same thing: no real answers.</p>
        <p>So I started tracking it myself: HRV, blood pressure, heart rate, sleep, what I ate, the days I crashed. Slowly, patterns surfaced. I found small things that made life more livable, and I got a little better. I’m not healed, and I won’t pretend otherwise. But over the two years I’ve used my own early version of Autonomic, I’ve been able to see what genuinely helps and reach a far better place than I’d been in for a long time.</p>
        <p>I’m not a doctor. I’m not an expert. I’m just someone on this road, in South Carolina, raising six kids, figuring out my own recovery one reading at a time. Autonomic is the tool I built to make sense of it. If it helps you spot your own patterns, find your own answers, and feel a little more in control of your journey too, then it’s done exactly what I hoped.</p>
      </div>
      <div class="v2-sign">
        <img src="/me.jpg" width="340" height="340" alt="" loading="lazy" />
        <span><b>Austin</b><small>Founder of Autonomic · long hauler · dad of six, South Carolina</small></span>
      </div>
      <div class="v2-story-act">
        <a class="v2-btn" data-cta="story_start_trial" data-dl-cta data-dl-plan="pro" href="/#download"><span class="btn-dl-ic" aria-hidden="true"></span>Start with {pricing.trialDays} days of Pro</a>
        <span class="v2-fine">Free to download · No card · Your data never leaves your phone</span>
      </div>
    </div>
  </div>
</section>

<section class="v2-sec plum2">
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2 on-dark">The four answers I kept leaving appointments without.</h2></div>
      <p class="v2-sub on-dark narrow">Every one comes from your own readings, compared against your own normal.</p>
    </div>
    <div class="v2-four">
      {#each answers as x}<a href={x.href}><b>{x.q}</b><span>{x.a}</span></a>{/each}
    </div>
  </div>
</section>

<ReviewStrip />

<ConditionCards title="Built for" />

<PageCta title="Tomorrow morning, get your first answer." sub="Free on iPhone and Android. Private by design." />
