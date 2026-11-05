<script lang="ts">
  import { APP_MARK_PATH, appStoreLink, playStoreLink, pricing, rating } from './site';
  import StarRow from './v2/StarRow.svelte';
  import { FEATURES } from './v2/features';
  import { CONDITIONS } from './v2/conditions';
  import FeatureIcon from './v2/FeatureIcon.svelte';
  import Phone from './v2/Phone.svelte';
  import PacingScreen from './v2/screens/PacingScreen.svelte';
</script>

<header class="nav" id="nav">
  <div class="wrap nav-row">
    <a class="v2-appline nv-brand" href="/" aria-label="Autonomic home, rated {rating.label}">
      <span class="v2-appicon sm"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
      <span class="nv-brand-t">
        <span class="v2-appline-n">Autonomic</span>
        <span class="v2-appline-r"><StarRow /><b>{rating.label}</b></span>
      </span>
    </a>
    <nav class="nav-links" aria-label="Primary">
      <div class="nv-feat">
        <a class="nv-feat-btn" href="/features/" aria-haspopup="true">Features<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></a>
        <div class="nv-menu">
          <div class="nv-menu-grid">
            {#each FEATURES as f}
              <a class="nv-item" href={f.href}>
                <span class="nv-ic"><FeatureIcon name={f.icon} /></span>
                <span><span class="nv-name">{f.name}{#if f.pro}<i>PRO</i>{/if}</span><span class="nv-sub">{f.tag}</span></span>
              </a>
            {/each}
          </div>
          <a class="nv-promo" href="/features/pacing-budget/" data-cta="nav_promo_pacing">
            <i>NEW</i>
            <b>The pacing budget</b>
            <span>See the ceiling coming.</span>
            <span class="nv-promo-ph"><Phone w={140}><PacingScreen /></Phone></span>
          </a>
        </div>
      </div>
      <div class="nv-feat nv-cond">
        <a class="nv-feat-btn" href="/conditions/" aria-haspopup="true">Conditions<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></a>
        <div class="nv-menu">
          <div class="nv-menu-grid">
            {#each CONDITIONS as c}
              <a class="nv-item" href={c.href}>
                <span><span class="nv-name">{c.title}</span><span class="nv-sub">{c.question}</span></span>
              </a>
            {/each}
            <a class="nv-item" href="/conditions/#more">
              <span><span class="nv-name">Something else</span><span class="nv-sub">MCAS, hEDS, fibromyalgia and more</span></span>
            </a>
          </div>
          <a class="nv-promo nv-promo-photo" href="/conditions/#symptoms">
            <img src="/people/nav-symptoms.webp" width="384" height="480" alt="" loading="lazy" />
            <b>No diagnosis yet?</b>
            <span>Start from a symptom, in your own words.</span>
          </a>
        </div>
      </div>
      <a href="/pricing/">Pricing</a>
      <a class="nav-blog" href="/insights/">Blog</a>
    </nav>
    <div class="nav-cta">
      <!-- Platform-aware download CTA. No JS: falls back to the /#download
           section. With JS, the site-wide script in app.html either deep-links a
           phone straight to its store or opens the dual-download modal below. -->
      <a class="btn-v2-app btn-download" id="navDownload" data-cta="nav_get_app" data-dl-cta data-dl-plan="free" href="/#download" aria-label="Download Autonomic">
        <span class="btn-dl-ic" aria-hidden="true"></span>
        <span class="btn-dl-label">Get the app</span>
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
    <span class="v2-appicon dlm-icon" aria-hidden="true"><svg viewBox="0 0 651.59 348.34"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
    <p class="dlm-eyebrow">Free to download</p>
    <h2 class="dlm-title" id="dlmTitle">Get Autonomic</h2>
    <p class="dlm-sub">On iPhone and Android, with {pricing.trialDays} days of Pro to start. No card needed.</p>

    <div class="dlm-cols">
      <div class="dlm-col">
        <a class="dlm-badge" href={appStoreLink} data-dl-store="ios" aria-label="Download on the App Store">
          <img src="/badges/app-store.svg" width="132" height="44" alt="" />
        </a>
        <div class="dlm-qr">
          <img src="/qr-ios.svg" width="140" height="140" alt="QR code to download Autonomic on the App Store" />
        </div>
        <span class="dlm-scan">Scan for iPhone</span>
      </div>

      <div class="dlm-col">
        <a class="dlm-badge" href={playStoreLink} data-dl-store="android" aria-label="Get it on Google Play">
          <img src="/badges/google-play.png" width="149" height="44" alt="" />
        </a>
        <div class="dlm-qr">
          <img src="/qr-android.svg" width="140" height="140" alt="QR code to download Autonomic on Google Play" />
        </div>
        <span class="dlm-scan">Scan for Android</span>
      </div>
    </div>
    <p class="dlm-trust"><span class="v2-appline-r"><StarRow /><b>{rating.label}</b> {rating.store}</span><span>No account · Your data stays on your phone</span></p>
  </div>
</div>
