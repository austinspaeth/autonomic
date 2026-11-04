<script lang="ts">
  import InsightsNav from '$lib/InsightsNav.svelte';

  /* The topic bar. On a phone it scrolls sideways, so the active pill is brought
     into view; with a mouse it can be dragged. On the blog home its title stays
     folded away until the hero's own title has scrolled under it. */
  const barScript = `<script>
(function () {
  var bar = document.querySelector('[data-ib]'), row = document.querySelector('[data-ib-row]');
  if (!bar || !row) return;
  var a = row.querySelector('.insights-pill.active');
  if (a && a.offsetLeft - row.offsetLeft + a.offsetWidth > row.clientWidth - 40) row.scrollLeft = a.offsetLeft - row.offsetLeft - 56;

  function edges() {
    row.classList.toggle('fade-l', row.scrollLeft > 4);
    row.classList.toggle('fade-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  }
  row.addEventListener('scroll', edges, { passive: true });
  window.addEventListener('resize', edges);
  edges();

  var down = null, moved = false;
  row.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || row.scrollWidth <= row.clientWidth) return;
    down = { x: e.clientX, s: row.scrollLeft }; moved = false;
  });
  window.addEventListener('pointermove', function (e) {
    if (!down) return;
    var dx = e.clientX - down.x;
    if (Math.abs(dx) > 4) { moved = true; row.classList.add('dragging'); }
    row.scrollLeft = down.s - dx;
  });
  window.addEventListener('pointerup', function () { down = null; setTimeout(function () { row.classList.remove('dragging'); }, 0); });
  row.addEventListener('click', function (e) { if (moved) { e.preventDefault(); moved = false; } }, true);

  if (bar.classList.contains('ib-wait')) {
    var h = document.querySelector('.bl-h1');
    var t = bar.querySelector('.ib-title');
    var tick = false;
    function check() {
      tick = false;
      var show = h ? h.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom : window.scrollY > 200;
      if (show !== bar.classList.contains('ib-on')) {
        bar.classList.toggle('ib-on', show);
        if (t) t.tabIndex = show ? 0 : -1;
        setTimeout(edges, 420);
      }
    }
    window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(check); } }, { passive: true });
    check();
  }
})();
<\/script>`;
</script>

<InsightsNav />
<slot />
{@html barScript}
