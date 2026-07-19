<script lang="ts">
  // Renders a copy-ready "share kit" of platform-specific posts above an article.
  // Shown only when the page is opened with ?social=true (which sets a localStorage
  // flag so it persists across in-session navigation). The site ships with csr=false,
  // so all interactivity is self-contained vanilla JS injected via {@html} in <head>.
  type SocialPosts = {
    linkedin?: string;
    reddit?: string;
    x?: string;
    facebook?: string;
  };

  export let social: SocialPosts | undefined = undefined;

  type Platform = { key: keyof SocialPosts; label: string; hint: string };
  const platforms: Platform[] = [
    { key: 'linkedin', label: 'LinkedIn', hint: 'Long-form professional post' },
    { key: 'reddit',   label: 'Reddit',   hint: 'Title + body for r/ submission' },
    { key: 'x',        label: 'X',        hint: '≤280 characters incl. URL' },
    { key: 'facebook', label: 'Facebook', hint: 'Conversational post' }
  ];
</script>

<svelte:head>
  {@html `<script>
    (function(){
      var STORAGE_KEY = 'ssw-enabled';
      function init(){
        var root = document.getElementById('ssw-root');
        if (!root) return;

        var url = new URL(window.location.href);
        var fromQuery = url.searchParams.get('social') === 'true';
        if (fromQuery) {
          try { localStorage.setItem(STORAGE_KEY, '1'); } catch(e) {}
          url.searchParams.delete('social');
          var qs = url.searchParams.toString();
          var cleaned = url.pathname + (qs ? '?' + qs : '') + url.hash;
          window.history.replaceState({}, '', cleaned);
        }

        var enabled = false;
        try { enabled = localStorage.getItem(STORAGE_KEY) === '1'; } catch(e) {}
        if (!enabled) return;

        root.removeAttribute('hidden');
        root.setAttribute('data-ssw-state', 'expanded');

        Array.prototype.forEach.call(root.querySelectorAll('[data-ssw-copy]'), function(btn){
          btn.addEventListener('click', function(){
            var key = btn.getAttribute('data-ssw-copy');
            var ta = root.querySelector('[data-ssw-text="' + key + '"]');
            if (!ta) return;
            var done = function(){
              var orig = btn.getAttribute('data-orig') || btn.textContent;
              btn.setAttribute('data-orig', orig);
              btn.textContent = 'Copied';
              btn.classList.add('ssw-copy-done');
              setTimeout(function(){
                btn.textContent = orig;
                btn.classList.remove('ssw-copy-done');
              }, 1600);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(ta.value).then(done, function(){
                ta.focus(); ta.select();
                try { document.execCommand('copy'); done(); } catch(e){}
              });
            } else {
              ta.focus(); ta.select();
              try { document.execCommand('copy'); done(); } catch(e){}
            }
          });
        });

        Array.prototype.forEach.call(root.querySelectorAll('[data-ssw-text]'), function(ta){
          ta.addEventListener('focus', function(){ ta.select(); });
        });

        var toggle = root.querySelector('[data-ssw-toggle]');
        if (toggle) toggle.addEventListener('click', function(){
          var next = root.getAttribute('data-ssw-state') === 'minimized' ? 'expanded' : 'minimized';
          root.setAttribute('data-ssw-state', next);
          toggle.setAttribute('aria-label', next === 'minimized' ? 'Expand share kit' : 'Minimize share kit');
          toggle.setAttribute('title', next === 'minimized' ? 'Expand' : 'Minimize');
        });

        var close = root.querySelector('[data-ssw-close]');
        if (close) close.addEventListener('click', function(){
          try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
          root.setAttribute('hidden', '');
          root.setAttribute('data-ssw-state', 'hidden');
        });
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
      else init();
    })();
  <\/script>`}
</svelte:head>

<div id="ssw-root" class="ssw" hidden data-ssw-state="hidden">
  <div class="ssw-body">
    <div class="ssw-head">
      <div class="ssw-title">
        <span class="ssw-eyebrow">Share kit</span>
        <h3>Social posts for this article</h3>
      </div>
      <div class="ssw-actions">
        <button class="ssw-act" type="button" data-ssw-toggle aria-label="Minimize share kit" title="Minimize">
          <svg class="ssw-ico-min" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          <svg class="ssw-ico-exp" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="ssw-act" type="button" data-ssw-close aria-label="Close share kit (won't show again until ?social=true)" title="Close — won't show again">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>

    {#if !social}
      <p class="ssw-empty">No social posts defined in this article's frontmatter yet.</p>
    {:else}
      <div class="ssw-grid">
        {#each platforms as p}
          {@const text = social?.[p.key]}
          <div class="ssw-card" class:ssw-card-empty={!text}>
            <div class="ssw-card-head">
              <div>
                <div class="ssw-platform">{p.label}</div>
                <div class="ssw-hint">{p.hint}</div>
              </div>
              {#if text}
                <button type="button" class="ssw-copy" data-ssw-copy={p.key}>Copy</button>
              {/if}
            </div>
            {#if text}
              <textarea class="ssw-text" data-ssw-text={p.key} readonly rows="6">{text}</textarea>
            {:else}
              <p class="ssw-missing">Not provided.</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .ssw { margin: 0 0 24px; position: relative; font-family: var(--body); }
  .ssw[hidden] { display: none; }
  .ssw[data-ssw-state="hidden"] { display: none; }
  .ssw[data-ssw-state="minimized"] .ssw-grid,
  .ssw[data-ssw-state="minimized"] .ssw-empty { display: none; }
  .ssw[data-ssw-state="minimized"] .ssw-head { margin-bottom: 0; }
  .ssw[data-ssw-state="minimized"] .ssw-body { padding: 12px 18px; }
  .ssw[data-ssw-state="expanded"] .ssw-ico-exp { display: none; }
  .ssw[data-ssw-state="minimized"] .ssw-ico-min { display: none; }

  .ssw-body {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--r);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    padding: 20px 22px;
  }
  .ssw-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .ssw-title { display: flex; flex-direction: column; gap: 4px; }
  .ssw-eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--accent-2);
  }
  .ssw-title h3 { margin: 0; font-size: 18px; letter-spacing: -0.01em; color: var(--text); font-family: var(--display); }
  .ssw-actions { display: flex; align-items: center; gap: 4px; }
  .ssw-act {
    width: 28px; height: 28px; border-radius: 8px; background: transparent; border: 1px solid transparent;
    color: var(--dim); display: grid; place-items: center; cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .ssw-act:hover { background: rgba(255, 255, 255, 0.06); color: var(--text); }

  .ssw-empty { color: var(--dim); font-size: 14px; margin: 0; }
  .ssw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .ssw-card {
    border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;
    background: var(--panel-2); display: flex; flex-direction: column; gap: 10px;
  }
  .ssw-card-empty { opacity: 0.6; }
  .ssw-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .ssw-platform { font-size: 14px; font-weight: 700; color: var(--text); }
  .ssw-hint { font-size: 11.5px; color: var(--dim); margin-top: 2px; }
  .ssw-copy {
    font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 8px;
    background: var(--accent); color: #fff; border: 1px solid var(--accent); cursor: pointer;
    transition: background 0.15s ease;
  }
  .ssw-copy:hover { background: var(--accent-2); }
  .ssw-copy-done { background: var(--accent-2); }
  .ssw-text {
    width: 100%; font-family: inherit; font-size: 13px; line-height: 1.5; color: var(--text);
    background: var(--bg-1); border: 1px solid var(--line-2); border-radius: 8px; padding: 10px 12px;
    resize: vertical; box-sizing: border-box; min-height: 120px;
  }
  .ssw-text:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .ssw-missing { margin: 0; font-size: 13px; color: var(--dim); font-style: italic; }
  @media (max-width: 720px) {
    .ssw-grid { grid-template-columns: 1fr; }
    .ssw-body { padding: 16px; }
  }
</style>
