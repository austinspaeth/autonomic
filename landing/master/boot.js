/* boot.js — the order the master dashboard comes up in.
 *
 *   sign in  ->  paint the cache  ->  pull from DynamoDB  ->  hydrate  ->  repaint
 *
 * The cache paints FIRST. This is a deliberate reversal: the page used to hold
 * everything back until the pull landed, on the grounds that a second device
 * would otherwise flash the first one's numbers. That is a real cost, and it is
 * the smaller one — it buys a moment of possibly-stale figures, where waiting
 * bought a loading screen on every single open, on every device, forever. This
 * is one person's dashboard read from a phone as often as from a laptop, and on
 * a phone the round trip is the difference between an app and a website.
 *
 * What keeps the trade honest is that the pull is already in flight while the
 * cache is on screen, the refresh control spins until it lands, and the repaint
 * is the whole store rather than a merge. A browser with nothing cached — a
 * first sign-in, or the one after "Delete all data" — gets the view's skeleton
 * instead, which is what `Dashboard.skeleton` is for.
 */
(function () {
  'use strict';

  /* There is no longer a status pill in the header: "Saved" was on screen
     essentially always, which made it furniture rather than information.
     Silence now means saved. Only the two states worth interrupting for say
     anything, and they say it once per transition rather than on every tick of
     a retry loop — otherwise a long offline stretch would toast forever. */
  var lastNoisyStatus = null;

  function statusLabel(status, detail) {
    var noisy = status === 'error' || status === 'offline';
    if (!noisy) { lastNoisyStatus = null; return; }
    if (lastNoisyStatus === status) return;
    lastNoisyStatus = status;
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = status === 'offline'
      ? 'Working from this browser\'s cache — changes will sync when the connection returns.'
      : 'Could not save: ' + ((detail && detail.message) || 'no answer from the server') + '. Retrying.';
    toast.classList.add('on');
    setTimeout(function () { toast.classList.remove('on'); }, 6000);
  }

  function fatal(message) {
    var gate = document.getElementById('gate');
    var err = document.getElementById('gateError');
    document.body.classList.add('gated');
    gate.classList.remove('hidden');
    gate.classList.remove('busy');
    document.getElementById('gateEmailStep').classList.add('hidden');
    document.getElementById('gateCodeStep').classList.add('hidden');
    err.textContent = message;
    err.classList.add('on');
  }

  function start() {
    window.Sync.onStatus(statusLabel);
    window.Sync.bind(window.Dashboard.store);

    var signOut = document.getElementById('btnSignOut');
    if (signOut) signOut.addEventListener('click', function () { window.Auth.signOut(); });

    /* Paint whatever this browser already holds, then go and get the rest.
       `painted` is carried into the hydrate as `keepUi`: the reader is looking
       at a view already, and the server's copy of the UI state belongs to
       whichever device wrote it last, which may not be this one. */
    var painted = false;
    if (window.Dashboard.hasCache()) {
      window.Dashboard.start();
      painted = true;
      var btn = document.getElementById('btnRefresh');
      if (btn) btn.dataset.busy = 'true';
    } else {
      window.Dashboard.skeleton(true);
    }

    window.Sync.pull().then(function (remote) {
      window.Dashboard.hydrate(remote, painted);
      var store = window.Dashboard.store();
      // Baseline == what we just received, so booting doesn't push anything back.
      window.Sync.adopt(store.db, store.state);
      if (painted) {
        var b = document.getElementById('btnRefresh');
        if (b) b.dataset.busy = 'false';
        // Migrations + repaint, both of which must follow the adopt.
        window.Dashboard.adopted();
      } else {
        window.Dashboard.skeleton(false);
        window.Dashboard.start();
      }
    }).catch(function (err) {
      var b = document.getElementById('btnRefresh');
      if (b) b.dataset.busy = 'false';
      if (err.status === 403) {
        // Signed in fine, just not on the allowlist. Signing them out would
        // only send them round the same loop, so say so and stop.
        fatal('That account is not authorized.');
        return;
      }
      if (err.status === 401) {
        // Token rejected — force a fresh sign-in.
        window.Auth.signOut();
        return;
      }
      // Network or server trouble: run from the cache. No baseline is adopted,
      // so the first save pushes everything we hold rather than a partial diff.
      statusLabel('offline');
      /* Already on screen if there was a cache to paint — starting twice would
         wire every listener a second time. */
      if (!painted) {
        window.Dashboard.skeleton(false);
        window.Dashboard.start();
      }
      var toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = 'Could not reach the server — working offline.';
        toast.classList.add('on');
        setTimeout(function () { toast.classList.remove('on'); }, 5000);
      }
    });
  }

  /* The service worker is registered before the gate resolves, deliberately:
     it is what makes an installed dashboard open at all with no signal, and
     that has to be true of the sign-in screen too. */
  function boot() {
    if (window.Pwa) window.Pwa.init();
    window.Auth.init(start);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
