<!-- Drawn: a morning HRV run sliding under the user's own usual. Sample data. -->
<script lang="ts">
  const bars = [46, 52, 44, 54, 50, 56, 48, 44, 40, 46, 30, 28, 26, 24];
</script>

<div class="sc-card">
  <div class="sc-eyebrow">MORNING HRV · 14 DAYS</div>
  <div class="sc-big"><b>31</b><span class="o">6 below your usual</span></div>
  <div class="sc-bars">
    {#each bars as h, i}<i style="height:{h * 1.3}px" class:warn={i > 9}></i>{/each}
  </div>
  <p class="sc-note">Three days below your own baseline. A good day to go easier and watch tomorrow's reading.</p>
</div>
<div class="sc-card sm">
  <div class="sc-eyebrow sm">TODAY</div>
  <div class="sc-row"><span>Morning reading</span><span class="g">6:42am</span></div>
  <div class="sc-row"><span>Water</span><span>1.5 L</span></div>
  <div class="sc-row"><span>Symptoms</span><span>2 logged</span></div>
</div>
