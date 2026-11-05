<!-- The download card at the foot of every blog page. -->
<script lang="ts">
  import { APP_MARK_PATH } from '$lib/site';
  import Stores from '../Stores.svelte';
  import Qr from '../Qr.svelte';
  import Phone from '../Phone.svelte';
  export let title = 'Know what kind of day it is before you get out of bed.';
  export let sub = 'Take a quick heart reading each morning and Autonomic gives you a score out of 100, plus a plain note on how much your body can handle today. So you can plan around a bad day instead of finding out halfway through it.';
</script>

<section class="v2-sec bl-cta-sec" id="download" data-cta="blog_end_cta">
  <div class="v2-wrap">
    <div class="v2-cta big bl-cta">
      <div class="v2-cta-copy">
        <div class="bl-cta-app">
          <span class="v2-appicon sm"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
          <span>Autonomic · free app</span>
        </div>
        <h2>{title}</h2>
        <p>{sub}</p>
        <div class="v2-cta-row"><Stores tone="glass" /><div class="v2-cta-qr"><Qr /></div></div>
      </div>
      <div class="v2-cta-ph"><Phone w={260} src="/features/outlook.webp" alt="The Autonomic Outlook: today scores 92 out of 100, Excellent, with a note on how much the day can take" /></div>
    </div>
  </div>
</section>
