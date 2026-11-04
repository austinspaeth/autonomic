<script lang="ts">
  import '../../app.css';
  import '$lib/v2/v2.css';
  import Nav from '$lib/Nav.svelte';
  import Footer from '$lib/Footer.svelte';

  /* Every "Good to know" list (.faq details) opens and closes with a height
     animation. The site ships no framework runtime (csr = false), so this
     rides along as an inline script. Native <details> still does the work:
     the click is only intercepted to animate, the element's own `open` state
     is set as usual (so find-in-page, keyboard and screen readers behave),
     and reduced motion keeps the plain instant toggle. */
  const faqScript = `<script>
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var EASE = 'cubic-bezier(.2,.8,.2,1)', MS = 320;
  document.querySelectorAll('.faq details').forEach(function (d) {
    var s = d.querySelector('summary'), body = d.querySelector('summary ~ *'), anim = null;
    if (!s) return;
    s.addEventListener('click', function (e) {
      e.preventDefault();
      var from = d.offsetHeight;
      var opening = !d.open || d.classList.contains('closing');
      if (anim) anim.cancel();
      d.style.overflow = 'hidden';
      if (opening) { d.classList.remove('closing'); d.open = true; }
      else d.classList.add('closing');
      var chrome = d.offsetHeight - d.clientHeight;
      var to = opening ? d.scrollHeight + chrome : s.offsetHeight + chrome;
      anim = d.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: MS, easing: EASE });
      if (body) body.animate(opening ? [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 1 }, { opacity: 0 }], { duration: opening ? MS : MS * 0.6, easing: EASE, fill: opening ? 'none' : 'forwards' });
      anim.onfinish = function () {
        if (!opening) { d.open = false; d.classList.remove('closing'); if (body) body.getAnimations().forEach(function (a) { a.cancel(); }); }
        d.style.overflow = ''; anim = null;
      };
    });
  });
})();
<\/script>`;
</script>

<a class="skip" href="#main">Skip to content</a>
<div class="v2-shell">
  <Nav />
  <main id="main">
    <slot />
  </main>
  <Footer />
</div>
{@html faqScript}
