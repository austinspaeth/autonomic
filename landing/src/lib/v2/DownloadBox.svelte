<!-- The hero download block: both store badges stacked beside one QR code, in a
     white box. One component, so the home hero and every feature and condition
     hero offer the download the same way. Below 900px the QR and divider drop
     out and the badges sit in a row (v2.css). -->
<script lang="ts">
  import Stores from './Stores.svelte';
  import Qr from './Qr.svelte';
</script>

<div class="v2-dlbox" data-cta="hero_download">
  <Stores stack />
  <span class="v2-dlbox-div"></span>
  <div class="v2-dlbox-qr"><Qr /><span><b>Scan to get the app</b></span></div>
</div>
