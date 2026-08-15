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
 * limitation is not ours to fix and the copy in Settings says the same thing.
 *
 * This page has NO push server. The `/ping/report` counter is polled by the
 * page itself, every five minutes, while the page is on screen (`app.js`), and
 * a service worker with no push subscription does not run when the app is
 * closed. So a notification can only ever fire while the dashboard is OPEN.
 * What it buys you is real but bounded: the dashboard sitting on a second
 * monitor, or in a background tab, or as an installed app you have switched
 * away from but not closed — all cases where a toast in the corner of a window
 * you are not looking at is worth nothing.
 *
 * That is exactly the condition used: `document.hasFocus()`. Not
 * `document.hidden`, which would be wrong twice over — the refresh timer
 * already refuses to run while hidden, so a hidden-only rule would mean the
 * notification never fires at all; and a visible-but-unfocused window is the
 * single most likely place for this dashboard to live.
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
    onUpdate: onUpdate
  };
})();
