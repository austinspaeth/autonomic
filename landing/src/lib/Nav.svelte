<script lang="ts">
  import { BRAND_POLYLINE } from './site';
</script>

<header class="nav" id="nav">
  <div class="wrap nav-row">
    <a class="brand" href="/" aria-label="Autonomic home">
      <svg class="brand-mark" viewBox="0 0 512 512" aria-hidden="true">
        <polyline
          points={BRAND_POLYLINE}
          fill="none"
          stroke="currentColor"
          stroke-width="40"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
      <span>Autonomic</span>
    </a>
    <nav class="nav-links" aria-label="Primary">
      <a href="/#how">How it works</a>
      <a href="/#scoring">Scoring</a>
      <a href="/#ai">AI insights</a>
      <a href="/#privacy">Privacy</a>
      <a href="/#faq">FAQ</a>
      <a href="/blog/">Blog</a>
    </nav>
    <div class="nav-cta">
      <a class="btn btn-primary" href="/#waitlist">Join the waitlist</a>
    </div>
    <button class="nav-burger" id="burger" aria-label="Menu" aria-expanded="false">
      <span></span><span></span>
    </button>
  </div>
</header>
