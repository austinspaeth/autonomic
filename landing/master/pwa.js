/* pwa.js — the in-page half of making /master an installable app.
 *
 * The other half is `landing/static/master/sw.js`, which has to be a real URL
 * (see the note at the top of that file). This module registers it, and owns
 * the one browser capability the dashboard did not have before: a notification
 * that survives you looking at something else.
 *
 * ------------------------------------------------------------------ scope
 *
 * Be clear about what a notification can and cannot be here, because the
 * limitations are not ours to fix and the copy in Settings says the same thing.
 *
 * There are now TWO of them, and they are different mechanisms with different
 * reach. Do not conflate them.
 *
 * **In-page** (`notify`) is the original. The `/ping/report` counter is polled
 * by the page itself, every five minutes, while the page is on screen
 * (`app.js`), so this can only ever fire while the dashboard is OPEN. What it
 * buys is real but bounded: the dashboard on a second monitor, in a background
 * tab, or as an installed app you have switched away from but not closed — all
 * cases where a toast in the corner of a window you are not looking at is
 * worth nothing.
 *
 * That is exactly the condition used: `document.hasFocus()`. Not
 * `document.hidden`, which would be wrong twice over — the refresh timer
 * already refuses to run while hidden, so a hidden-only rule would mean the
 * notification never fires at all; and a visible-but-unfocused window is the
 * single most likely place for this dashboard to live.
 *
 * **Background** (`subscribePush`) reaches a closed app, and the reason it can
 * is that the CLOCK IS NOT HERE. A service worker cannot check anything
 * hourly — it runs when its page is open, when a fetch it controls happens, or
 * when a push arrives, and is killed within seconds; there is no timer in it
 * that survives, and iOS has no Periodic Background Sync to lend it one. So
 * the hour is kept by an EventBridge schedule (`sls/lambdas/push/main.js`),
 * which diffs the counter and sends. This half only holds a subscription.
 * Unconfigured servers are normal — see that file — so every call here fails
 * soft rather than throwing.
 *
 * iOS supports this from 16.4, and only for a PWA added to the home screen —
 * `Notification.requestPermission` in an ordinary Safari tab does nothing
 * useful. `state()` reports that case as `needs-install` rather than as an
 * error, so the settings card can say what to do instead of looking broken.
 */
window.Pwa = (function () {
  'use strict';

  var SW_URL = '/master/sw.js';
  var SW_SCOPE = '/master/';

  var reg = null;              // ServiceWorkerRegistration, once it resolves
  var updateListeners = [];

  /* ------------------------------------------------------------ standalone */

  /** Is this running as an installed app rather than as a browser tab? */
  function isStandalone() {
    try {
      if (window.navigator.standalone === true) return true;   // iOS
      return window.matchMedia('(display-mode: standalone)').matches ||
             window.matchMedia('(display-mode: fullscreen)').matches;
    } catch (e) { return false; }
  }

  /* ---------------------------------------------------------------- worker */

  function register() {
    if (!('serviceWorker' in window.navigator)) return Promise.resolve(null);
    /* A worker cannot be registered from a file:// or a cross-origin document,
       and jsdom has no `serviceWorker` at all — every one of those is a page
       that simply has no offline shell, never an error worth showing. */
    return window.navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
      .then(function (r) { reg = r; return r; })
      .catch(function () { return null; });
  }

  /** The registration, if there is one. Notifications are shown through it. */
  function registration() {
    if (reg) return Promise.resolve(reg);
    if (!('serviceWorker' in window.navigator)) return Promise.resolve(null);
    try {
      return window.navigator.serviceWorker.getRegistration(SW_SCOPE)
        .then(function (r) { reg = r || null; return reg; })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function onUpdate(fn) { updateListeners.push(fn); }

  /* --------------------------------------------------------- notifications */

  function supported() {
    return typeof window.Notification === 'function';
  }

  /**
   * One of:
   *   'unsupported'   — no Notification API in this browser
   *   'needs-install' — iOS Safari in a tab: the API exists but only an
   *                     installed PWA may use it, so asking here is a dead end
   *   'default'       — supported, never asked
   *   'granted' / 'denied'
   */
  function state() {
    if (!supported()) {
      return (isIOS() && !isStandalone()) ? 'needs-install' : 'unsupported';
    }
    var p = window.Notification.permission;
    if (p !== 'granted' && isIOS() && !isStandalone()) return 'needs-install';
    return p;
  }

  function isIOS() {
    try {
      var ua = window.navigator.userAgent || '';
      /* iPadOS reports itself as a Mac; the touch-point count is what tells
         the two apart. */
      return /iPad|iPhone|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && (window.navigator.maxTouchPoints || 0) > 1);
    } catch (e) { return false; }
  }

  /**
   * Ask for permission. MUST be called from a user gesture — Safari drops the
   * request otherwise, silently, which reads as a broken button.
   */
  function enable() {
    if (!supported()) return Promise.resolve(state());
    try {
      var out = window.Notification.requestPermission();
      /* Older Safari passes the answer to a callback and returns undefined. */
      if (!out || typeof out.then !== 'function') {
        return new Promise(function (resolve) {
          window.Notification.requestPermission(function (p) { resolve(p); });
        });
      }
      return out.then(function (p) { return p; }).catch(function () { return state(); });
    } catch (e) { return Promise.resolve(state()); }
  }

  /**
   * Show one, if this is a moment where it helps.
   *
   * `opts.force` is for the "Send a test" button, which has to appear even
   * though the window it was pressed in is by definition focused.
   *
   * Shown through the service worker registration when there is one: iOS and
   * Android Chrome both refuse `new Notification()` outright and only accept
   * `registration.showNotification`, so the constructor is the fallback rather
   * than the path.
   */
  function notify(opts) {
    var o = opts || {};
    if (!supported() || window.Notification.permission !== 'granted') return Promise.resolve(false);
    if (!o.force) {
      try { if (document.hasFocus()) return Promise.resolve(false); } catch (e) { /* no document focus API */ }
    }
    var payload = {
      body: o.body || '',
      /* A tag replaces the previous notification with the same one, which is
         what stops five refreshes stacking five "1 new download" banners. */
      tag: o.tag || 'autonomic-master',
      renotify: !!o.tag,
      icon: '/web-app-manifest-192x192.png',
      badge: '/web-app-manifest-192x192.png',
      silent: !!o.silent,
      data: { url: '/master/' }
    };
    return registration().then(function (r) {
      if (r && r.showNotification) return r.showNotification(o.title || 'Autonomic', payload).then(function () { return true; });
      /* eslint-disable no-new */
      new window.Notification(o.title || 'Autonomic', payload);
      return true;
    }).catch(function () { return false; });
  }

  /* ------------------------------------------------------------------ push
   *
   * The upgrade the section above says this page did not have: a notification
   * that arrives with the dashboard CLOSED.
   *
   * What changed is not this file, it is where the clock lives. A service
   * worker cannot check anything hourly — it runs when its page is open, when
   * a fetch it controls happens, or when a push arrives, and iOS has no
   * Periodic Background Sync — so the hour is kept by an EventBridge schedule
   * (`sls/lambdas/push/main.js`), which diffs the ping counter and sends. All
   * this half does is hold a subscription.
   *
   * The iOS conditions are unchanged and unforgiving: 16.4+, added to the home
   * screen, and the permission asked from a real user gesture. `state()` above
   * already reports `needs-install` for the tab case, and every function here
   * refuses rather than throwing when the capability is absent — a dashboard
   * opened in a desktop browser must not show an error for a feature it simply
   * cannot have.
   */

  /** The applicationServerKey has to be bytes; the server sends base64url. */
  function urlBase64ToUint8Array(base64) {
    var padding = '='.repeat((4 - (base64.length % 4)) % 4);
    var raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function pushSupported() {
    return ('serviceWorker' in window.navigator) &&
      typeof window.PushManager === 'function' &&
      supported();
  }

  /** The subscription this browser already holds, or null. */
  function currentSubscription() {
    if (!pushSupported()) return Promise.resolve(null);
    return registration().then(function (r) {
      if (!r || !r.pushManager) return null;
      return r.pushManager.getSubscription().catch(function () { return null; });
    }).catch(function () { return null; });
  }

  /**
   * Subscribe this device and hand the result to the server.
   *
   * `applicationServerKey` is the VAPID PUBLIC key, fetched by the caller —
   * this module does not know about the API. Re-subscribing an already
   * subscribed browser returns the existing subscription rather than a second
   * one, which is what keeps the server's row count equal to the device count.
   *
   * Permission is requested FIRST and from the caller's gesture. Safari drops
   * a `requestPermission` that is not in one, silently, and a `subscribe` on an
   * ungranted permission throws — so the order here is the difference between
   * a button that works and one that appears to do nothing.
   */
  function subscribePush(publicKey) {
    if (!pushSupported()) return Promise.resolve({ ok: false, reason: 'unsupported' });
    if (!publicKey) return Promise.resolve({ ok: false, reason: 'no-key' });

    return enable().then(function (p) {
      if (p !== 'granted') return { ok: false, reason: p === 'denied' ? 'denied' : 'dismissed' };
      return registration().then(function (r) {
        if (!r || !r.pushManager) return { ok: false, reason: 'unsupported' };
        return r.pushManager.getSubscription().then(function (existing) {
          if (existing) return existing;
          return r.pushManager.subscribe({
            /* Required, and required to be true: a push that shows nothing is
               a permission the browser takes back. The worker's push handler
               always ends in a showNotification for the same reason. */
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          });
        }).then(function (sub) {
          return { ok: true, subscription: sub.toJSON ? sub.toJSON() : sub };
        });
      });
    }).catch(function (e) {
      return { ok: false, reason: 'failed', message: (e && e.message) || '' };
    });
  }

  /** Drop this device's subscription. Returns the endpoint that was dropped so
   *  the caller can tell the server which row to delete — after `unsubscribe()`
   *  resolves there is nothing left to read it off. */
  function unsubscribePush() {
    return currentSubscription().then(function (sub) {
      if (!sub) return { ok: true, endpoint: null };
      var endpoint = sub.endpoint;
      return sub.unsubscribe().then(function () {
        return { ok: true, endpoint: endpoint };
      }).catch(function () {
        return { ok: false, endpoint: endpoint };
      });
    });
  }

  /* ------------------------------------------------------------------ init */

  function init() {
    register();

    if ('serviceWorker' in window.navigator) {
      try {
        window.navigator.serviceWorker.addEventListener('message', function (ev) {
          if (!ev.data || ev.data.type !== 'sw-activated') return;
          updateListeners.forEach(function (fn) {
            try { fn(ev.data); } catch (e) { /* a listener must not kill the worker channel */ }
          });
        });
      } catch (e) { /* older implementations expose no message channel */ }
    }
  }

  return {
    init: init,
    isStandalone: isStandalone,
    isIOS: isIOS,
    supported: supported,
    state: state,
    enable: enable,
    notify: notify,
    onUpdate: onUpdate,
    pushSupported: pushSupported,
    currentSubscription: currentSubscription,
    subscribePush: subscribePush,
    unsubscribePush: unsubscribePush
  };
})();
