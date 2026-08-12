/* boot.js — the order the master dashboard comes up in.
 *
 *   sign in  ->  pull from DynamoDB  ->  hydrate  ->  render
 *
 * Nothing renders from the localStorage cache before the pull lands, so a
 * second device never flashes another machine's stale numbers.
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

    window.Sync.pull().then(function (remote) {
      window.Dashboard.hydrate(remote);
      var store = window.Dashboard.store();
      // Baseline == what we just received, so booting doesn't push anything back.
      window.Sync.adopt(store.db, store.state);
      window.Dashboard.start();
    }).catch(function (err) {
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
      window.Dashboard.start();
      var toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = 'Could not reach the server — working offline.';
        toast.classList.add('on');
        setTimeout(function () { toast.classList.remove('on'); }, 5000);
      }
    });
  }

  function boot() { window.Auth.init(start); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
