<script lang="ts">
  import { BRAND_POLYLINE } from './site';
</script>

<footer class="footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <a class="brand" href="/">
        <svg class="brand-mark" viewBox="0 0 512 512" aria-hidden="true">
          <polyline points={BRAND_POLYLINE} fill="none" stroke="currentColor" stroke-width="40" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
        <span>Autonomic</span>
      </a>
      <p>A private journal for autonomic nervous-system recovery.</p>
    </div>
    <nav class="footer-col" aria-label="Product">
      <h4>Product</h4>
      <a href="/#how">How it works</a><a href="/#scoring">Scoring</a><a href="/#analysis">Analysis</a><a href="/#ai">AI insights</a><a href="/#pricing">Pricing</a>
    </nav>
    <nav class="footer-col" aria-label="More">
      <h4>More</h4>
      <a href="/#milestones">Milestones</a><a href="/#privacy">Privacy</a><a href="/insights/">Blog</a><a href="/press/">Press</a><a href="/#faq">FAQ</a><a href="/privacy-policy/">Privacy Policy</a><a href="/terms-of-service/">Terms of Service</a>
    </nav>
  </div>
  <div class="wrap footer-base">
    <span>© <span id="yr">2026</span> DiscoveryMark LLC</span>
    <span class="footer-disc">Not a medical device. Autonomic does not diagnose, treat, or provide medical advice.</span>
  </div>
</footer>
