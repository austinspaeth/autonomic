<script lang="ts">
  import BrandMark from './BrandMark.svelte';
  import { appStoreLink, playStoreLink, pricing } from './site';
</script>

<header class="nav" id="nav">
  <div class="wrap nav-row">
    <a class="brand" href="/" aria-label="Autonomic home">
      <BrandMark size={26} />
      <span>Autonomic</span>
    </a>
    <nav class="nav-links" aria-label="Primary">
      <a href="/#how">How it works</a>
      <a href="/#scoring">Scoring</a>
      <a href="/#ai">AI insights</a>
      <a href="/#privacy">Privacy</a>
      <a href="/#pricing">Pricing</a>
      <a href="/#faq">FAQ</a>
      <a class="nav-blog" href="/insights/">Blog</a>
    </nav>
    <div class="nav-cta">
      <!-- Platform-aware download CTA. No JS: falls back to the /#download
           section (dual store badges). With JS, the site-wide script in
           app.html either deep-links a phone straight to its store (adding the
           Apple / Android glyph) or opens the dual-download modal below on
           desktop / unknown platforms. -->
      <a class="btn btn-primary btn-download" id="navDownload" data-dl-cta data-dl-plan="free" href="/#download" aria-label="Download Autonomic">
        <span class="btn-dl-ic" aria-hidden="true"></span>
        <span class="btn-dl-label">Download free</span>
      </a>
    </div>
    <button class="nav-burger" id="burger" aria-label="Menu" aria-expanded="false">
      <span></span><span></span>
    </button>
  </div>
</header>

<!-- Dual-download modal (desktop / unknown platform). Opened by any
     [data-dl-cta] whose platform sniff was inconclusive; wired in app.html.
     Single instance — Nav renders once, in the layout. -->
<div class="dlm" id="dlModal" hidden>
  <div class="dlm-backdrop" data-dl-close></div>
  <div class="dlm-panel" role="dialog" aria-modal="true" aria-labelledby="dlmTitle">
    <button class="dlm-x" type="button" aria-label="Close" data-dl-close>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
    <p class="dlm-eyebrow">Free to download</p>
    <h2 class="dlm-title" id="dlmTitle">Get Autonomic</h2>
    <p class="dlm-sub">On iPhone and Android, with {pricing.trialDays} days of Pro to start. Scan a code or tap a badge.</p>

    <div class="dlm-cols">
      <div class="dlm-col">
        <a class="dlm-badge" href={appStoreLink} data-dl-store="ios" aria-label="Download on the App Store">
          <svg viewBox="0 0 120 40" role="img" aria-label="Download on the App Store" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="rgba(255,255,255,0.4)" />
            <path transform="translate(10,7.5) scale(0.05)" fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 20-27.8 44.7-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
            <text x="35" y="16" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="7.5">Download on the</text>
            <text x="34" y="31" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="-0.3">App Store</text>
          </svg>
        </a>
        <div class="dlm-qr">
          <img src="/qr-ios.svg" width="140" height="140" alt="QR code to download Autonomic on the App Store" />
        </div>
        <span class="dlm-scan">Scan for iPhone</span>
      </div>

      <div class="dlm-col">
        <a class="dlm-badge" href={playStoreLink} data-dl-store="android" aria-label="Get it on Google Play">
          <svg viewBox="0 0 120 40" role="img" aria-label="Get it on Google Play" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="rgba(255,255,255,0.4)" />
            <g transform="translate(1.11,1.17) scale(0.94)" stroke-width="1.6" stroke-linejoin="round">
              <path fill="#00C3FF" stroke="#00C3FF" d="M10 8 21 19.5 10 19.5Z" />
              <path fill="#FF3A44" stroke="#FF3A44" d="M10 8 27 19.5 21 19.5Z" />
              <path fill="#00D66F" stroke="#00D66F" d="M10 19.5 21 19.5 10 31Z" />
              <path fill="#FFCE00" stroke="#FFCE00" d="M21 19.5 27 19.5 10 31Z" />
            </g>
            <text x="35" y="16" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="7">GET IT ON</text>
            <text x="34" y="31" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="14.5" textLength="78" lengthAdjust="spacingAndGlyphs" font-weight="600" letter-spacing="-0.2">Google Play</text>
          </svg>
        </a>
        <div class="dlm-qr">
          <img src="/qr-android.svg" width="140" height="140" alt="QR code to download Autonomic on Google Play" />
        </div>
        <span class="dlm-scan">Scan for Android</span>
      </div>
    </div>
  </div>
</div>
