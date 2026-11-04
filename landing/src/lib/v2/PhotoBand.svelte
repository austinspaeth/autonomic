<!-- A tall photo of the person, with one short hopeful line over it and a link.
     The whole band is the link. On the page's own background, not a white
     section, so it reads as a pause between sections. -->
<script lang="ts">
  export let src: string;
  export let alt: string;
  export let title: string;
  export let body: string;
  export let link: string;
  export let href: string;
  /** object-position for the photo, to keep the person in frame. */
  export let pos = '50% 25%';
  export let mpos = '45% 25%';
</script>

<section class="v2-sec">
  <div class="v2-wrap">
    <a class="pb" {href} style="--pos:{pos};--mpos:{mpos}">
      <img {src} width="1200" height="670" {alt} loading="lazy" />
      <span class="pb-t"><b>{title}</b><span>{body}</span><em>{link} →</em></span>
    </a>
  </div>
</section>

<style>
  .pb { position: relative; display: block; height: 620px; border-radius: 30px; overflow: hidden; color: #fff; isolation: isolate; }
  .pb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: var(--pos); z-index: -1; transition: transform .6s cubic-bezier(.2,.7,.2,1); }
  .pb::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, rgba(20,14,26,.82) 0%, rgba(20,14,26,.55) 32%, rgba(20,14,26,0) 62%), linear-gradient(0deg, rgba(20,14,26,.5) 0%, rgba(20,14,26,0) 45%); }
  .pb-t { position: absolute; left: 48px; bottom: 48px; max-width: 440px; display: flex; flex-direction: column; gap: 10px; text-shadow: 0 1px 12px rgba(20,14,26,.45); }
  .pb-t b { font-size: clamp(30px, 3.6vw, 44px); font-weight: 800; letter-spacing: -.03em; line-height: 1.05; }
  .pb-t span { font-size: 18.5px; font-weight: 500; line-height: 1.5; color: #fff; }
  .pb-t em { font-style: normal; font-weight: 800; font-size: 16px; }
  @media (hover: hover) { .pb:hover img { transform: scale(1.03); } }
  .pb:focus-visible { outline: 3px solid var(--red); outline-offset: 4px; }
  @media (max-width: 620px) {
    .pb { height: 560px; border-radius: 24px; }
    .pb img { object-position: var(--mpos); }
    .pb::after { background: linear-gradient(180deg, rgba(20,14,26,0) 30%, rgba(20,14,26,.88) 100%); }
    .pb-t { left: 22px; right: 22px; bottom: 24px; }
    .pb-t span { font-size: 16.5px; }
  }
</style>
