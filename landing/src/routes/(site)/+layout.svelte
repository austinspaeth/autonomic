<script lang="ts">
  import '../../app.css';
  import Nav from '$lib/Nav.svelte';
  import Footer from '$lib/Footer.svelte';
</script>

<a class="skip" href="#main">Skip to content</a>
<Nav />
<main id="main">
  <slot />
</main>
<Footer />
