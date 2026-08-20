<script lang="ts">
  /** Shared end-of-article / hub CTA, styled to the landing's calm-instrument look. */
  import { pricing, priceLabel } from './site';
</script>

<div class="article-cta">
  <h3>Track your recovery with Autonomic</h3>
  <p>
    A private, offline journal that scores your daily HRV, BP and orthostatic readings against
    medical thresholds. Free to download on iPhone and Android, with {priceLabel(pricing.monthly)}/mo
    Pro when you want the deep-analysis tools.
  </p>
  <!-- Platform-aware: deep-links a phone to its store, opens the dual-download
       modal on desktop (wired in app.html). No-JS fallback: /#download. -->
  <a class="btn btn-primary btn-lg btn-download" data-dl-cta href="/#download" aria-label="Download Autonomic">
    <span class="btn-dl-ic" aria-hidden="true"></span><span class="btn-dl-label">Download free</span>
  </a>
</div>
