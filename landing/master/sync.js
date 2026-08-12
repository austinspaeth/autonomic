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

  /* Mirrors cleanEvent() in the Lambda, same rule as normalize(): if the two
     shapes disagree, every diff reports every event as changed forever. */
  var EVENT_CATEGORIES = ['RELEASE', 'MARKETING', 'STORE', 'EXTERNAL'];

  function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ''))) return null;
    var id = String(raw.id || '').slice(0, 64);
    var title = String(raw.title || '').slice(0, 200);
    if (!id || !title) return null;
    var out = {
      id: id, date: raw.date, title: title,
      category: EVENT_CATEGORIES.indexOf(raw.category) >= 0 ? raw.category : 'EXTERNAL'
    };
    if (raw.time && /^\d{2}:\d{2}$/.test(raw.time)) out.time = raw.time;
    if (raw.type) out.type = String(raw.type).slice(0, 80);
    if (raw.note) out.note = String(raw.note).slice(0, 2000);
    if (raw.url) out.url = String(raw.url).slice(0, 500);
    var amount = Number(raw.amount);
    if (raw.amount !== undefined && raw.amount !== null && raw.amount !== '' && isFinite(amount)) {
      out.amount = amount;
    }
    return out;
  }

  /* Mirrors cleanAd() / cleanCost() in the Lambda — same rule again: if the two
     shapes disagree, every diff reports every row as changed forever. */
  var COST_CATEGORIES = ['ADS', 'CREATIVE', 'INFRA', 'TOOLS', 'FEES', 'SERVICES', 'HARDWARE', 'OTHER'];
  var RECURRENCES = ['weekly', 'monthly', 'quarterly', 'yearly'];
  var AD_PLATFORMS = ['all', 'ios', 'android'];

  function normalizeAd(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = String(raw.id || '').slice(0, 64);
    var name = String(raw.name || '').slice(0, 120);
    if (!id || !name) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.start || ''))) return null;
    var out = {
      id: id, name: name, start: raw.start,
      platform: AD_PLATFORMS.indexOf(raw.platform) >= 0 ? raw.platform : 'all'
    };
    if (raw.channel) out.channel = String(raw.channel).slice(0, 80);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw.end || ''))) out.end = raw.end;
    if (raw.url) out.url = String(raw.url).slice(0, 500);
    if (raw.note) out.note = String(raw.note).slice(0, 2000);
    return out;
  }

  var COST_NUMBERS = ['impressions', 'clicks', 'installs'];

  function normalizeCost(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = String(raw.id || '').slice(0, 64);
    if (!id) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ''))) return null;
    var amount = Number(raw.amount);
    if (!isFinite(amount)) return null;
    var out = {
      id: id, date: raw.date, amount: amount,
      category: COST_CATEGORIES.indexOf(raw.category) >= 0 ? raw.category : 'OTHER'
    };
    if (raw.label) out.label = String(raw.label).slice(0, 200);
    if (raw.note) out.note = String(raw.note).slice(0, 2000);
    if (raw.adId) out.adId = String(raw.adId).slice(0, 64);
    if (RECURRENCES.indexOf(raw.recurrence) >= 0) out.recurrence = raw.recurrence;
    if (out.recurrence && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.until || ''))) out.until = raw.until;
    COST_NUMBERS.forEach(function (k) {
      var n = Number(raw[k]);
      if (raw[k] === undefined || raw[k] === null || raw[k] === '' || !isFinite(n)) return;
      out[k] = n;
    });
    return out;
  }

  function snapshotOf(db, state) {
    var entries = new Map();
    (db.entries || []).forEach(function (e) {
      var n = normalize(e);
      if (n) entries.set(keyOf(n), stable(n));
    });
    var events = new Map();
    (db.events || []).forEach(function (e) {
      var n = normalizeEvent(e);
      if (n) events.set(n.id, stable(n));
    });
    var adsMap = new Map();
    (db.ads || []).forEach(function (a) {
      var n = normalizeAd(a);
      if (n) adsMap.set(n.id, stable(n));
    });
    var costsMap = new Map();
    (db.costs || []).forEach(function (c) {
      var n = normalizeCost(c);
      if (n) costsMap.set(n.id, stable(n));
    });
    return {
      entries: entries, events: events, ads: adsMap, costs: costsMap,
      settings: stable(db.settings || {}), ui: stable(state || {})
    };
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

    var eventUpserts = [];
    var eventDeletes = [];
    now.events.forEach(function (json, id) {
      if (!baseline || !baseline.events || baseline.events.get(id) !== json) eventUpserts.push(JSON.parse(json));
    });
    if (baseline && baseline.events) {
      baseline.events.forEach(function (_json, id) {
        if (!now.events.has(id)) eventDeletes.push(id);
      });
    }

    /* Ads and costs diff exactly like events: keyed by id, upserts for anything
       whose JSON moved, deletes for anything the baseline had and we no longer
       do. Factored because there are now three id-keyed collections and a
       fourth copy of this loop would be where they start to disagree. */
    function diffById(name) {
      var ups = [], dels = [];
      now[name].forEach(function (json, id) {
        if (!baseline || !baseline[name] || baseline[name].get(id) !== json) ups.push(JSON.parse(json));
      });
      if (baseline && baseline[name]) {
        baseline[name].forEach(function (_json, id) {
          if (!now[name].has(id)) dels.push(id);
        });
      }
      return { ups: ups, dels: dels };
    }
    var adDiff = diffById('ads');
    var costDiff = diffById('costs');

    var payload = {};
    if (adDiff.ups.length) payload.adUpserts = adDiff.ups;
    if (adDiff.dels.length) payload.adDeletes = adDiff.dels;
    if (costDiff.ups.length) payload.costUpserts = costDiff.ups;
    if (costDiff.dels.length) payload.costDeletes = costDiff.dels;
    if (upserts.length) payload.upserts = upserts;
    if (deletes.length) payload.deletes = deletes;
    if (eventUpserts.length) payload.eventUpserts = eventUpserts;
    if (eventDeletes.length) payload.eventDeletes = eventDeletes;
    if (!baseline || baseline.settings !== now.settings) payload.settings = db.settings;
    if (!baseline || baseline.ui !== now.ui) payload.ui = state;
    return { payload: payload, snapshot: now, empty: Object.keys(payload).length === 0 };
  }

  /* Returns a promise so a caller that must not race the push — the header's
     refresh, which pulls the server's copy over the top of ours — can wait for
     it. Fire-and-forget callers ignore it, as they always have. */
  function flush() {
    if (inFlight || !getStore) return Promise.resolve();
    var store = getStore();
    var d = diff(store.db, store.state);
    if (d.empty) { setStatus('synced'); return Promise.resolve(); }

    inFlight = true;
    setStatus('saving');
    return window.Api.call('SYNC', d.payload).then(function () {
      inFlight = false;
      // Commit the snapshot only on success, so a failed push retries the same
      // work instead of quietly losing it.
      baseline = d.snapshot;
      retryDelay = RETRY_BASE_MS;
      if (pending) { pending = false; return flush(); }
      setStatus('synced');
      return null;
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
    flush: flush,
    bind: bind,
    adopt: adopt,
    schedule: schedule,
    replaceAll: replaceAll,
    onStatus: onStatus,
    normalize: normalize,
    normalizeAd: normalizeAd,
    normalizeCost: normalizeCost
  };
})();
