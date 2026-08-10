/* sync.js — keeps the dashboard's store mirrored into DynamoDB.
 *
 * The app still writes localStorage on every mutation, which is what makes the
 * page paint instantly and survive a dead network. DynamoDB is the source of
 * truth: on boot we pull and overwrite the cache, and from then on every
 * `save()` schedules a push.
 *
 * app.js calls `save()` from ~30 places without saying what changed, so rather
 * than instrument each one this layer diffs the whole store against the last
 * state the server confirmed. Cheap (a few thousand small objects), and it
 * cannot drift out of step with a call site someone forgets to update.
 */
window.Sync = (function () {
  'use strict';

  var DEBOUNCE_MS = 900;
  var RETRY_BASE_MS = 4000;
  var RETRY_MAX_MS = 60000;

  /* Mirrors cleanEntry() in the Lambda. Both sides must agree on the shape or
     every diff reports every row as changed, forever. */
  var NUMBERS = ['downloads', 'impressions', 'pageViews', 'updates', 'sales', 'revenue'];

  var baseline = null;   // { entries: Map<key,string>, settings: string, ui: string }
  var pending = false;   // a change arrived while a push was in flight
  var inFlight = false;
  var timer = null;
  var retryDelay = RETRY_BASE_MS;
  var listeners = [];
  var status = 'idle';
  var getStore = null;   // () => { db, state }

  function keyOf(entry) { return entry.date + '#' + entry.platform; }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ''))) return null;
    var out = { date: raw.date, platform: raw.platform === 'android' ? 'android' : 'ios' };
    NUMBERS.forEach(function (k) {
      var v = raw[k];
      if (v === undefined || v === null || v === '') return;
      var n = Number(v);
      if (isFinite(n)) out[k] = n;
    });
    if (typeof raw.notes === 'string' && raw.notes.length) out.notes = raw.notes.slice(0, 2000);
    return out;
  }

  /* Stable stringify — key order must not change the comparison. */
  function stable(obj) {
    if (!obj || typeof obj !== 'object') return JSON.stringify(obj);
    return JSON.stringify(Object.keys(obj).sort().reduce(function (acc, k) {
      acc[k] = obj[k];
      return acc;
    }, {}));
  }

  function snapshotOf(db, state) {
    var entries = new Map();
    (db.entries || []).forEach(function (e) {
      var n = normalize(e);
      if (n) entries.set(keyOf(n), stable(n));
    });
    return { entries: entries, settings: stable(db.settings || {}), ui: stable(state || {}) };
  }

  function setStatus(next, detail) {
    status = next;
    listeners.forEach(function (fn) { fn(next, detail); });
  }

  /* ---------------------------------------------------------------- pull */

  /**
   * Fetch the server's copy. Returns { entries, settings, ui } or null when the
   * account has nothing stored yet (first run on a fresh table).
   */
  function pull() {
    setStatus('loading');
    return window.Api.call('LOAD').then(function (data) {
      setStatus('synced');
      return data;
    });
  }

  /* ---------------------------------------------------------------- push */

  function diff(db, state) {
    var now = snapshotOf(db, state);
    var upserts = [];
    var deletes = [];

    now.entries.forEach(function (json, key) {
      if (!baseline || baseline.entries.get(key) !== json) upserts.push(JSON.parse(json));
    });
    if (baseline) {
      baseline.entries.forEach(function (_json, key) {
        if (!now.entries.has(key)) {
          var parts = key.split('#');
          deletes.push({ date: parts[0], platform: parts[1] });
        }
      });
    }

    var payload = {};
    if (upserts.length) payload.upserts = upserts;
    if (deletes.length) payload.deletes = deletes;
    if (!baseline || baseline.settings !== now.settings) payload.settings = db.settings;
    if (!baseline || baseline.ui !== now.ui) payload.ui = state;
    return { payload: payload, snapshot: now, empty: Object.keys(payload).length === 0 };
  }

  function flush() {
    if (inFlight || !getStore) return;
    var store = getStore();
    var d = diff(store.db, store.state);
    if (d.empty) { setStatus('synced'); return; }

    inFlight = true;
    setStatus('saving');
    window.Api.call('SYNC', d.payload).then(function () {
      inFlight = false;
      // Commit the snapshot only on success, so a failed push retries the same
      // work instead of quietly losing it.
      baseline = d.snapshot;
      retryDelay = RETRY_BASE_MS;
      if (pending) { pending = false; flush(); } else setStatus('synced');
    }).catch(function (err) {
      inFlight = false;
      pending = false;
      setStatus('error', err);
      clearTimeout(timer);
      timer = setTimeout(flush, retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    });
  }

  /** Called from app.js's save(). Coalesces a burst of mutations into one push. */
  function schedule() {
    if (inFlight) { pending = true; return; }
    setStatus('pending');
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  }

  /**
   * Replace the server's entries wholesale. Used by "Delete all data" and by a
   * JSON-backup restore, where a diff would be the wrong shape (the client's
   * idea of what existed is exactly what's being thrown away).
   */
  function replaceAll() {
    if (!getStore) return Promise.resolve();
    var store = getStore();
    var snapshot = snapshotOf(store.db, store.state);
    clearTimeout(timer);
    inFlight = true;
    setStatus('saving');
    return window.Api.call('REPLACE_ALL', {
      entries: (store.db.entries || []).map(normalize).filter(Boolean),
      settings: store.db.settings
    }).then(function () {
      inFlight = false;
      baseline = snapshot;
      setStatus('synced');
    }).catch(function (err) {
      inFlight = false;
      setStatus('error', err);
      throw err;
    });
  }

  /* Adopt the server's state as the baseline — nothing to push right after a
     pull. `state` is the UI object the pull returned (may be null). */
  function adopt(db, state) {
    baseline = snapshotOf(db, state);
    setStatus('synced');
  }

  function onStatus(fn) { listeners.push(fn); fn(status); }

  function bind(fn) { getStore = fn; }

  /* A push in flight when the tab closes would be lost; ask the browser to
     wait. Modern browsers ignore the prompt text but still hold the unload. */
  window.addEventListener('beforeunload', function (e) {
    if (status === 'saving' || status === 'pending' || status === 'error') {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* Coming back from offline or a backgrounded tab is the moment a stalled
     retry should get another go. */
  window.addEventListener('online', function () { retryDelay = RETRY_BASE_MS; flush(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && status === 'error') flush();
  });

  return {
    pull: pull,
    bind: bind,
    adopt: adopt,
    schedule: schedule,
    replaceAll: replaceAll,
    onStatus: onStatus,
    normalize: normalize
  };
})();
