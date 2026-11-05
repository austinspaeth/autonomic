<!-- Free and Pro side by side, as the home page's pricing section draws them.
     The rows are homeData's, so the two places state the same boundary. -->
<script lang="ts">
  import { pricing, priceLabel, yearlySavePct } from '$lib/site';
  import { FREE_ROWS, PRO_ROWS } from './homeData';
  const CHECK =
    '<svg class="v2-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';
  const monthly = priceLabel(pricing.monthly);
  const yearly = priceLabel(pricing.yearly);
</script>

<div class="v2-prices">
  <div class="v2-price">
    <b class="n">Free</b>
    <div class="amt"><b>$0</b><span>forever</span></div>
    <ul>{#each FREE_ROWS as r}<li>{@html CHECK}{r}</li>{/each}</ul>
    <a class="v2-btn ghost" data-cta="plans_free" data-dl-cta data-dl-plan="free" href="/#download"><span class="btn-dl-ic" aria-hidden="true"></span>Download free</a>
  </div>
  <div class="v2-price pro">
    <div class="n-row"><b class="n">Pro</b><i>{pricing.trialDays} days free</i></div>
    <div class="amt"><b>{monthly}</b><span>a month, or {yearly} a year (save {yearlySavePct}%)</span></div>
    <ul>{#each PRO_ROWS as r}<li>{@html CHECK}{r}</li>{/each}</ul>
    <a class="v2-btn" data-cta="plans_pro" data-dl-cta data-dl-plan="pro" href="/#download"><span class="btn-dl-ic" aria-hidden="true"></span>Start {pricing.trialDays} days free</a>
  </div>
</div>
