<script lang="ts">
  import { APP_MARK_PATH } from './site';
  import { FEATURES } from './v2/features';
  import { CONDITIONS } from './v2/conditions';
  import Stores from './v2/Stores.svelte';
</script>

<footer class="v2-footer" data-cta="footer">
  <div class="v2-wrap v2-footer-grid">
    <div>
      <a class="brand" href="/">
        <svg class="v2-mark" viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" /></svg>
        <span>Autonomic</span>
      </a>
      <p>Answers for the questions you live with. The private HRV app for POTS, long COVID, ME/CFS and dysautonomia.</p>
      <Stores tone="glass" stack />
    </div>
    <nav aria-label="Features">
      <h4>Features</h4>
      {#each FEATURES as f}<a href={f.href}>{f.name}</a>{/each}
      <a href="/pricing/">Pricing</a>
      <a href="/compare/">Compare apps</a>
    </nav>
    <nav aria-label="Conditions">
      <h4>Conditions</h4>
      {#each CONDITIONS as c}<a href={c.href}>{c.title}</a>{/each}
    </nav>
    <nav aria-label="Questions">
      <h4>Questions</h4>
      <a href="/features/pacing-budget/">How much can I do today?</a>
      <a href="/insights/pots/is-it-pots-or-anxiety/">Is it POTS?</a>
      <a href="/features/hrv-readings/#crash-warnings">Am I about to crash?</a>
      <a href="/insights/hrv/hrv-normal-range-by-age/">Is my HRV normal?</a>
      <a href="/#faq">FAQ</a>
    </nav>
    <nav aria-label="Company">
      <h4>Company</h4>
      <a href="/insights/">Blog</a><a href="/story/">Our story</a><a href="/press/">Press</a><a href="/privacy-policy/">Privacy policy</a><a href="/terms-of-service/">Terms</a>
    </nav>
  </div>
  <div class="v2-wrap v2-footer-base">
    <span>© <span id="yr">2026</span> DiscoveryMark LLC</span>
    <span>Not a medical device. Autonomic does not diagnose, treat, or provide medical advice.</span>
  </div>
</footer>
