<!-- The official store badges, unaltered (static/badges). -->
<script lang="ts">
  import { appStoreLink, playStoreLink } from '$lib/site';
  export let stack = false;
  export let tone = '';
  // A campaign page (the /download short link) passes its own attributed links.
  export let ios = appStoreLink;
  export let android = playStoreLink;
</script>

<div class="v2-stores" class:stack data-tone={tone}>
  <a class="v2-badge" href={ios} data-dl-store="ios"><img src="/badges/app-store.svg" width="150" height="50" alt="Download on the App Store" /></a>
  <a class="v2-badge" href={android} data-dl-store="android"><img src="/badges/google-play.png" width="169" height="50" alt="Get it on Google Play" /></a>
</div>
