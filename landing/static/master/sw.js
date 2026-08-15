/* sw.js — the /master dashboard's service worker.
 *
 * This file is deliberately NOT in `landing/master/`: everything in that
 * folder is inlined into the prerendered document, and a service worker is the
 * one piece of this app that has to be a real URL the browser can register. It
 * is served from `static/master/sw.js`, so its scope is `/master/` and it can
 * never see a request for the marketing site.
 *
 * What it is for, in one line: the dashboard opens instantly and works with no
 * network, because the DATA already lives in localStorage (app.js) and this
 * keeps the DOCUMENT that reads it available too. Without a worker, an
 * installed PWA with no signal shows the browser's offline page and the cache
 * underneath it is unreachable.
 *
 * Three rules run through it:
 *
 * - **Only same-origin GETs are touched.** The API is a POST to
 *   api.autonomic.care and sign-in is a POST to Cognito; both are cross-origin
 *   and neither is cacheable in any useful sense. They are not intercepted at
 *   all — a worker that "handles" them can only ever be a way to serve a stale
 *   number as if it were fresh.
 * - **Navigations are network-first.** The document carries the whole app, so
 *   a deploy has to reach the reader on their next open rather than whenever a
 *   cache happens to expire. The cached copy is the fallback, not the default.
 * - **The cached copy is refreshed on every successful load**, so "offline"
 *   always means the last version that actually worked.
 */

/* Bump on any change to this file. The old cache is deleted on activate, so a
   version that is never bumped is a version that never updates. */
var CACHE = 'autonomic-master-v1';

/* The document plus the two files it references by absolute URL. Everything
   else — the stylesheet, every script, the brand mark — is inlined into the
   document itself, so this list is the whole of the app's shell. */
var SHELL = [
  '/master/',
  '/master/manifest.json',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE)
      /* Individually rather than addAll: one 404 fails the whole batch, and an
         icon that has moved should not cost the offline document. */
      .then(function (cache) {
        return Promise.all(SHELL.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () { return null; });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys()
      .then(function (keys) {
        var old = keys.filter(function (k) { return k !== CACHE; });
        return Promise.all(old.map(function (k) { return caches.delete(k); }))
          .then(function () { return self.clients.claim(); })
          .then(function () { return old.length; });
      })
      .then(function (replaced) {
        /* A page whose worker has just been REPLACED should be told, so it can
           say the document on disk is no longer the one running. It says so
           rather than reloading itself: a reload mid-session throws away every
           open card, the scroll position and any half-typed row in the entry
           forms. app.js turns this into a toast.

           `replaced` is what stops that toast on a FIRST install, where there
           was no previous version and "a new version is ready" is a lie about
           the page the reader is already looking at. */
        if (!replaced) return null;
        return self.clients.matchAll({ type: 'window' }).then(function (list) {
          list.forEach(function (c) { c.postMessage({ type: 'sw-activated', version: CACHE }); });
        });
      })
  );
});

function isNavigation(req) {
  return req.mode === 'navigate' ||
    (req.method === 'GET' && (req.headers.get('accept') || '').indexOf('text/html') >= 0);
}

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  if (isNavigation(req)) {
    ev.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('/master/', copy); });
        }
        return res;
      }).catch(function () {
        return caches.match('/master/').then(function (hit) {
          return hit || Response.error();
        });
      })
    );
    return;
  }

  /* Everything else on this origin is a static file (the manifest, an icon).
     Serve what we hold and refresh it in the background — they change about
     once a year, and waiting on the network for them is the difference between
     an app that opens and one that spins. */
  ev.respondWith(
    caches.match(req).then(function (hit) {
      var live = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit || Response.error(); });
      return hit || live;
    })
  );
});
