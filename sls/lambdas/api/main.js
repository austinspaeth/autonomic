/**
 * Autonomic master dashboard API.
 *
 * One POST endpoint, action-dispatched, behind the HTTP API's Cognito JWT
 * authorizer. The authorizer proves the caller holds a valid token from the
 * DiscoveryMark user pool — which every DiscoveryMark customer also holds — so
 * the email allowlist below is the actual access control. Never remove it.
 *
 * Actions:
 *   LOAD           -> { entries, events, ads, costs, sales, settings, ui }
 *   SYNC           { upserts, deletes, settings, ui } -> applies a client diff
 *   REPLACE_ALL    { entries, sales, settings } -> wipes and rewrites both
 *   PINGS          { since } -> the mobile app's cohort-ping counters
 *   STORE_VERSIONS { force } -> what is live in the App Store and on Play
 *   PUSH_KEY       -> { configured, publicKey } for background alerts
 *   PUSH_SUBSCRIBE { subscription, ua } -> registers this device
 *   PUSH_UNSUBSCRIBE { endpoint } -> forgets it
 *   PUSH_TEST      -> sends one now, through the real encrypted path
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
  PutCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');

/* One implementation of the ping read, shared with the public keyed route. */
const { report: pingReport } = require('../ping/main');
/* The push half: registering a device here, sending to it from the hourly
   schedule. Both halves share one definition of a subscription's key so the
   job can find what this handler wrote. */
const {
  configured: pushConfigured,
  publicKey: pushPublicKey,
  subId,
  pushPk,
  listSubscriptions,
  sendToAll,
} = require('../push/main');
/* Reading the two stores. Its own file because the Play half is a scrape and
   wants explaining at length. */
const { storeVersions } = require('./storeVersions');

const TABLE = process.env.DYNAMO_TABLE_NAME;
const ALLOWED = String(process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/* DynamoDB caps a BatchWriteItem at 25 requests. */
const BATCH_SIZE = 25;

const DEFAULT_SETTINGS = { trialDays: 7, wallDays: 14, currency: '$', storeCutPct: 15 };

/* The numeric columns a dashboard entry carries. Anything else the client
   sends is dropped — the table is not a scratch pad. */
const ENTRY_NUMBERS = ['downloads', 'impressions', 'pageViews', 'updates', 'sales', 'revenue'];

const PLATFORMS = ['ios', 'android'];

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/* ------------------------------------------------------------------ keys */

const pkFor = (email) => `DASH#${email}`;
const entrySk = (date, platform) => `ENTRY#${date}#${platform}`;

/* ------------------------------------------------------------ validation */

const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Coerce a client entry into the stored shape, or return null if it can't be
 * keyed. Numbers are clamped to finite values so a NaN from the client can't
 * poison every chart that reads the day back.
 */
const cleanEntry = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const date = raw.date;
  if (!isIsoDate(date)) return null;
  const platform = PLATFORMS.includes(raw.platform) ? raw.platform : 'ios';

  const entry = { date, platform };
  ENTRY_NUMBERS.forEach((k) => {
    const n = Number(raw[k]);
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '' && Number.isFinite(n)) {
      entry[k] = n;
    }
  });
  if (typeof raw.notes === 'string' && raw.notes.length) entry.notes = raw.notes.slice(0, 2000);
  return entry;
};

/* A recorded event — a release, a campaign, a store change. These are the
   annotations every calendar chart draws, so they live with the dashboard's own
   data (one partition per user, synced like entries) rather than anywhere near
   the anonymous ping counters. */
const EVENT_CATEGORIES = ['RELEASE', 'MARKETING', 'STORE', 'EXTERNAL'];

const cleanEvent = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (!isIsoDate(raw.date)) return null;
  const id = String(raw.id || '').slice(0, 64);
  if (!id) return null;
  const out = {
    id,
    date: raw.date,
    category: EVENT_CATEGORIES.includes(raw.category) ? raw.category : 'EXTERNAL',
    title: String(raw.title || '').slice(0, 200),
  };
  if (raw.time && /^\d{2}:\d{2}$/.test(raw.time)) out.time = raw.time;
  if (raw.type) out.type = String(raw.type).slice(0, 80);
  if (raw.note) out.note = String(raw.note).slice(0, 2000);
  if (raw.url) out.url = String(raw.url).slice(0, 500);
  const amount = Number(raw.amount);
  if (raw.amount !== undefined && raw.amount !== null && raw.amount !== '' && Number.isFinite(amount)) {
    out.amount = amount;
  }
  return out.title ? out : null;
};

/* An advertising campaign, and a dated cost that may or may not belong to one.
   Same partition and the same diff-driven sync as entries and events: the money
   the dashboard spends is dashboard data, not app data, and nothing here ever
   goes near the anonymous ping counters. */

/* An AD SPOT: one thing bought once, carrying its own price. It used to be a
   campaign whose money lived in a pile of daily ADS cost rows; the dashboard
   collapses those into spots on first load and pushes the result here, so this
   accepts both shapes — `channel` and the old iOS/Android `platform` are read
   through unchanged rather than dropped, or a browser that has not run the
   migration yet would have its unmigrated campaigns stripped on the way past.
   `amount` is optional for exactly the same reason: a pre-migration campaign
   has none. Counts are what the platform reported, not what the store did. */
const AD_NUMBERS = ['amount', 'impressions', 'clicks', 'installs'];

const cleanAd = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').slice(0, 64);
  const name = String(raw.name || '').slice(0, 120);
  if (!id || !name || !isIsoDate(raw.start)) return null;
  const out = { id, name, start: raw.start };
  if (raw.platform) out.platform = String(raw.platform).slice(0, 80);
  if (raw.channel) out.channel = String(raw.channel).slice(0, 80);
  if (isIsoDate(raw.end)) out.end = raw.end;
  if (raw.url) out.url = String(raw.url).slice(0, 500);
  if (raw.note) out.note = String(raw.note).slice(0, 2000);
  AD_NUMBERS.forEach((k) => {
    const n = Number(raw[k]);
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '' && Number.isFinite(n)) out[k] = n;
  });
  return out;
};

/* A single PURCHASE. Sales used to be two numeric columns on a store entry, a
   count and an amount summed per day; they are a collection of their own now
   because the two things the dashboard needs to know about a sale — the plan's
   term and the buyer's install date — are properties of the purchase and are
   averaged away by a daily total. `plan: 'unknown'` is what the migrated daily
   columns become, and it is a real value rather than a missing one: those rows
   are money of an unknown term and must never be counted into MRR. */
const SALE_PLANS = ['monthly', 'annual', 'lifetime', 'unknown'];

const cleanSale = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').slice(0, 64);
  if (!id || !isIsoDate(raw.date)) return null;
  const price = Number(raw.price);
  if (!Number.isFinite(price)) return null;
  const qty = Number(raw.qty);
  const out = {
    id,
    date: raw.date,
    platform: PLATFORMS.includes(raw.platform) ? raw.platform : 'ios',
    plan: SALE_PLANS.includes(raw.plan) ? raw.plan : 'unknown',
    price,
    qty: Number.isFinite(qty) && qty >= 1 ? Math.round(qty) : 1,
  };
  // An install date only makes sense on a single purchase, and only if it is
  // not after the purchase itself. A qty>1 row is an aggregate of buyers who do
  // not share one, so it never carries a cohort — see sales.js rule FOUR.
  if (out.qty === 1 && isIsoDate(raw.cohort) && raw.cohort <= out.date) out.cohort = raw.cohort;
  if (isIsoDate(raw.cancelled) && raw.cancelled >= out.date) out.cancelled = raw.cancelled;
  if (raw.refunded) out.refunded = true;
  if (raw.note) out.note = String(raw.note).slice(0, 2000);
  return out;
};

const COST_CATEGORIES = ['ADS', 'CREATIVE', 'INFRA', 'TOOLS', 'FEES', 'SERVICES', 'HARDWARE', 'OTHER'];
const RECURRENCES = ['weekly', 'monthly', 'quarterly', 'yearly'];
const COST_NUMBERS = ['impressions', 'clicks', 'installs'];

const cleanCost = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').slice(0, 64);
  if (!id || !isIsoDate(raw.date)) return null;
  const amount = Number(raw.amount);
  // A cost with no readable amount is not a cost. Dropping it is better than
  // storing a NaN that every chart downstream has to defend against.
  if (!Number.isFinite(amount)) return null;

  const out = {
    id,
    date: raw.date,
    amount,
    category: COST_CATEGORIES.includes(raw.category) ? raw.category : 'OTHER',
  };
  if (raw.label) out.label = String(raw.label).slice(0, 200);
  if (raw.note) out.note = String(raw.note).slice(0, 2000);
  if (raw.adId) out.adId = String(raw.adId).slice(0, 64);
  if (RECURRENCES.includes(raw.recurrence)) out.recurrence = raw.recurrence;
  if (out.recurrence && isIsoDate(raw.until)) out.until = raw.until;
  COST_NUMBERS.forEach((k) => {
    const n = Number(raw[k]);
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '' && Number.isFinite(n)) out[k] = n;
  });
  return out;
};

const cleanSettings = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const trialDays = Number(raw.trialDays);
  const wallDays = Number(raw.wallDays);
  const storeCutPct = Number(raw.storeCutPct);
  return {
    trialDays: Number.isFinite(trialDays) && trialDays > 0 ? Math.round(trialDays) : DEFAULT_SETTINGS.trialDays,
    wallDays: Number.isFinite(wallDays) && wallDays > 0 ? Math.round(wallDays) : DEFAULT_SETTINGS.wallDays,
    currency: typeof raw.currency === 'string' && raw.currency.length <= 4 ? raw.currency : DEFAULT_SETTINGS.currency,
    storeCutPct: Number.isFinite(storeCutPct) && storeCutPct >= 0 && storeCutPct <= 100
      ? storeCutPct : DEFAULT_SETTINGS.storeCutPct,
  };
};

/* --------------------------------------------------------------- storage */

/** Every item under one partition — the whole dashboard for one user. */
const readAll = async (pk) => {
  const items = [];
  let ExclusiveStartKey;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey,
    }));
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
};

const writeBatches = async (requests) => {
  for (const group of chunk(requests, BATCH_SIZE)) {
    let unprocessed = { [TABLE]: group };
    // BatchWriteItem can partially succeed under throttling; retry what it
    // hands back rather than silently dropping writes.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: unprocessed }));
      const left = res.UnprocessedItems && res.UnprocessedItems[TABLE];
      if (!left || left.length === 0) { unprocessed = null; break; }
      unprocessed = { [TABLE]: left };
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
    }
    if (unprocessed) throw new Error('DynamoDB did not accept every write after retries.');
  }
};

/* --------------------------------------------------------------- actions */

const load = async (pk) => {
  const items = await readAll(pk);
  const entries = [];
  const events = [];
  const ads = [];
  const costs = [];
  const sales = [];
  let settings = { ...DEFAULT_SETTINGS };
  let ui = null;

  items.forEach((item) => {
    if (item.SK === 'SETTINGS') {
      settings = { ...settings, ...(item.settings || {}) };
    } else if (item.SK === 'UI') {
      ui = item.ui || null;
    } else if (typeof item.SK === 'string' && item.SK.startsWith('ENTRY#')) {
      const entry = cleanEntry(item.entry || item);
      if (entry) entries.push(entry);
    } else if (typeof item.SK === 'string' && item.SK.startsWith('EVENT#')) {
      const event = cleanEvent(item.event || item);
      if (event) events.push(event);
    } else if (typeof item.SK === 'string' && item.SK.startsWith('AD#')) {
      const ad = cleanAd(item.ad || item);
      if (ad) ads.push(ad);
    } else if (typeof item.SK === 'string' && item.SK.startsWith('COST#')) {
      const cost = cleanCost(item.cost || item);
      if (cost) costs.push(cost);
    } else if (typeof item.SK === 'string' && item.SK.startsWith('SALE#')) {
      const sale = cleanSale(item.sale || item);
      if (sale) sales.push(sale);
    }
  });

  events.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  // Newest first for both: the dashboard lists them that way, and sorting here
  // means a fresh load and a locally-edited list are in the same order.
  ads.sort((a, b) => (a.start === b.start ? a.id.localeCompare(b.id) : b.start.localeCompare(a.start)));
  costs.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)));
  // Sales ascend, unlike ads and costs: the ledger is a history read forwards
  // and every series built from it walks it in order.
  sales.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));

  entries.sort((a, b) => (a.date === b.date
    ? a.platform.localeCompare(b.platform)
    : a.date.localeCompare(b.date)));

  return { entries, events, ads, costs, sales, settings, ui };
};

const sync = async (pk, payload) => {
  const now = new Date().toISOString();
  const requests = [];

  const upserts = Array.isArray(payload.upserts) ? payload.upserts : [];
  upserts.forEach((raw) => {
    const entry = cleanEntry(raw);
    if (!entry) return;
    requests.push({
      PutRequest: {
        Item: {
          PK: pk,
          SK: entrySk(entry.date, entry.platform),
          entityType: 'DASH_ENTRY',
          entry,
          updatedAt: now,
        },
      },
    });
  });

  const eventUpserts = Array.isArray(payload.eventUpserts) ? payload.eventUpserts : [];
  eventUpserts.forEach((raw) => {
    const event = cleanEvent(raw);
    if (!event) return;
    requests.push({
      PutRequest: {
        Item: { PK: pk, SK: `EVENT#${event.id}`, entityType: 'DASH_EVENT', event, updatedAt: now },
      },
    });
  });

  const eventDeletes = Array.isArray(payload.eventDeletes) ? payload.eventDeletes : [];
  eventDeletes.forEach((id) => {
    if (typeof id === 'string' && id) requests.push({ DeleteRequest: { Key: { PK: pk, SK: `EVENT#${id}` } } });
  });

  /* Ads and costs, keyed by id under their own SK prefixes. One shape of loop
     for both, because they differ only in prefix, cleaner and entity type. */
  const idKeyed = [
    { prefix: 'AD', entityType: 'DASH_AD', field: 'ad', clean: cleanAd, ups: payload.adUpserts, dels: payload.adDeletes },
    { prefix: 'COST', entityType: 'DASH_COST', field: 'cost', clean: cleanCost, ups: payload.costUpserts, dels: payload.costDeletes },
    { prefix: 'SALE', entityType: 'DASH_SALE', field: 'sale', clean: cleanSale, ups: payload.saleUpserts, dels: payload.saleDeletes },
  ];
  const idKeptCounts = {};
  idKeyed.forEach((kind) => {
    const ups = Array.isArray(kind.ups) ? kind.ups : [];
    ups.forEach((raw) => {
      const item = kind.clean(raw);
      if (!item) return;
      requests.push({
        PutRequest: {
          Item: {
            PK: pk, SK: `${kind.prefix}#${item.id}`, entityType: kind.entityType,
            [kind.field]: item, updatedAt: now,
          },
        },
      });
    });
    const dels = Array.isArray(kind.dels) ? kind.dels : [];
    dels.forEach((id) => {
      if (typeof id === 'string' && id) requests.push({ DeleteRequest: { Key: { PK: pk, SK: `${kind.prefix}#${id}` } } });
    });
    idKeptCounts[kind.prefix] = { upserted: ups.length, deleted: dels.length };
  });

  const deletes = Array.isArray(payload.deletes) ? payload.deletes : [];
  deletes.forEach((d) => {
    if (!d || !isIsoDate(d.date)) return;
    const platform = PLATFORMS.includes(d.platform) ? d.platform : 'ios';
    requests.push({ DeleteRequest: { Key: { PK: pk, SK: entrySk(d.date, platform) } } });
  });

  // A single key can't be both put and deleted in one BatchWriteItem call.
  // Last write wins, matching what the client just did locally.
  const seen = new Set();
  const deduped = [];
  for (let i = requests.length - 1; i >= 0; i -= 1) {
    const req = requests[i];
    const sk = req.PutRequest ? req.PutRequest.Item.SK : req.DeleteRequest.Key.SK;
    if (seen.has(sk)) continue;
    seen.add(sk);
    deduped.push(req);
  }

  if (deduped.length) await writeBatches(deduped);

  const settings = cleanSettings(payload.settings);
  if (settings) {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: pk, SK: 'SETTINGS', entityType: 'DASH_SETTINGS', settings, updatedAt: now },
    }));
  }

  if (payload.ui && typeof payload.ui === 'object') {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: pk, SK: 'UI', entityType: 'DASH_UI', ui: payload.ui, updatedAt: now },
    }));
  }

  return {
    upserted: upserts.length, deleted: deletes.length,
    eventsUpserted: eventUpserts.length, eventsDeleted: eventDeletes.length,
    adsUpserted: idKeptCounts.AD.upserted, adsDeleted: idKeptCounts.AD.deleted,
    costsUpserted: idKeptCounts.COST.upserted, costsDeleted: idKeptCounts.COST.deleted,
    salesUpserted: idKeptCounts.SALE.upserted, salesDeleted: idKeptCounts.SALE.deleted,
  };
};

/**
 * Wipe every entry AND every sale, then write the supplied sets. Backs a
 * JSON-backup restore and the "Delete all data" button.
 *
 * Sales are in here rather than left to the ordinary diff for a timing reason
 * worth remembering: `Sync.replaceAll` adopts its own snapshot as the new
 * baseline and cancels any pending push, so a diff produced moments earlier
 * (the sale deletes, say) is discarded before it ever leaves the browser. A
 * wipe has to be stated outright, which is the same reason entries are here.
 *
 * Ads, costs and events deliberately survive. The money was spent and the
 * releases happened whichever store rows you throw away — the same rule that
 * keeps a deleted campaign's spend on the books.
 */
const replaceAll = async (pk, payload) => {
  const existing = await readAll(pk);

  const incoming = (Array.isArray(payload.entries) ? payload.entries : [])
    .map(cleanEntry)
    .filter(Boolean);
  const incomingSales = (Array.isArray(payload.sales) ? payload.sales : [])
    .map(cleanSale)
    .filter(Boolean);

  // Keys we're about to rewrite don't need deleting first.
  const keeping = new Set([
    ...incoming.map((e) => entrySk(e.date, e.platform)),
    ...incomingSales.map((s) => `SALE#${s.id}`),
  ]);
  const toDelete = existing
    .filter((i) => typeof i.SK === 'string' && (i.SK.startsWith('ENTRY#') || i.SK.startsWith('SALE#')))
    .map((i) => i.SK)
    .filter((sk) => !keeping.has(sk));

  if (toDelete.length) {
    await writeBatches(toDelete.map((SK) => ({ DeleteRequest: { Key: { PK: pk, SK } } })));
  }

  return sync(pk, { upserts: incoming, saleUpserts: incomingSales, settings: payload.settings });
};

/* ------------------------------------------------------------ push devices
 *
 * Registering a phone to be told about a sale or a new install while the
 * dashboard is CLOSED. The hourly job that does the telling is
 * `lambdas/push/main.js`, and the long note at the top of that file is where
 * the design lives — in particular why the hour is kept on a schedule here
 * rather than by a timer in the service worker, which is a thing iOS does not
 * have.
 *
 * These live behind the same allowlist as everything else in this handler, so
 * only an account that may READ the numbers may ask to be woken about them.
 * A subscription is stored under the subscriber's own partition (PUSH#<email>)
 * keyed by a hash of its endpoint, so re-subscribing the same device replaces
 * its row rather than adding a second one and buzzing it twice.
 *
 * Nothing here is a secret: the VAPID PUBLIC key is meant to be handed to the
 * browser (it is what `pushManager.subscribe` signs against), and the private
 * half never leaves the Lambda environment.
 */
const pushSubscribe = async (email, payload) => {
  const sub = payload.subscription || {};
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint.trim() : '';
  const keys = sub.keys || {};
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : '';
  const auth = typeof keys.auth === 'string' ? keys.auth : '';

  /* All three or none. A row missing a key is a row the sender will throw on
     every hour forever, and the browser never produces a partial one — so this
     is a malformed request, not a state to store. */
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, error: 'That subscription was missing its endpoint or keys.' };
  }
  if (!/^https:\/\//i.test(endpoint)) {
    return { ok: false, error: 'A push endpoint must be https.' };
  }

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK: pushPk(email),
      SK: `SUB#${subId(endpoint)}`,
      endpoint,
      p256dh,
      auth,
      /* Which device this is, in the only terms the browser offers. Kept so a
         list of three subscriptions is readable when one of them needs
         removing; never used for anything else. */
      ua: String(payload.ua || '').slice(0, 200),
      at: new Date().toISOString(),
    },
  }));

  return { ok: true, id: subId(endpoint) };
};

const pushUnsubscribe = async (email, payload) => {
  const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint.trim() : '';
  if (!endpoint) return { ok: false, error: 'No endpoint given.' };
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { PK: pushPk(email), SK: `SUB#${subId(endpoint)}` },
  }));
  return { ok: true };
};

/* The "Send a test" button's server half. It goes all the way through the real
   sender on purpose: the failure this is here to catch is a key that does not
   match the subscription, and only a real encrypted send can tell you that. */
const pushTest = async (email) => {
  if (!(await pushConfigured())) return { ok: false, error: 'No VAPID keys are configured on the server.' };
  const subs = (await listSubscriptions()).filter((s) => s.email === email);
  if (!subs.length) return { ok: false, error: 'This device is not registered for background alerts.' };
  const result = await sendToAll(subs, {
    title: '\u{1F44B} Autonomic',
    body: 'Background alerts are working.',
    tag: 'autonomic-test',
    url: '/master/',
  });
  return { ok: result.sent > 0, ...result };
};

/* --------------------------------------------------------------- handler */

const handler = async (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  const email = String(claims.email || '').toLowerCase().trim();

  // The gate. A DiscoveryMark customer's token authenticates fine against this
  // pool; only the allowlist stops them reading Autonomic's numbers.
  if (!email || !ALLOWED.includes(email)) {
    console.warn('Rejected master dashboard request for', email || '(no email claim)');
    return json(403, { error: 'Not authorized for this dashboard.' });
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (err) {
    return json(400, { error: 'Body was not valid JSON.' });
  }

  const action = body.action;
  const payload = body.payload || {};
  const pk = pkFor(email);

  try {
    switch (action) {
      case 'LOAD':
        return json(200, await load(pk));
      case 'SYNC':
        return json(200, await sync(pk, payload));
      case 'REPLACE_ALL':
        return json(200, await replaceAll(pk, payload));
      // The mobile app's cohort counters. They live under their own partitions
      // (PING#OPEN / PING#SUB / PING#ACT / PING#HRV), not any dashboard user's,
      // but they are read
      // through this handler so the allowlist above guards them too — the
      // dashboard already holds a token, and shouldn't also hold the ping
      // lambda's shared key.
      case 'PINGS':
        return json(200, await pingReport(payload.since));
      /* Read from Apple and Google rather than from us, cached in a row of
         its own (PK STORE#VERSIONS) that belongs to no dashboard user — there
         is one answer and it is the same for everybody who can see it. */
      case 'STORE_VERSIONS':
        return json(200, await storeVersions(ddb, TABLE, { force: !!payload.force }));
      /* Background alerts. `PUSH_KEY` is what the browser needs before it can
         subscribe at all, and it reports `configured: false` rather than
         failing when no keys are set — an unconfigured server is a normal
         state (see the note in lambdas/push/main.js), and the settings card
         says so instead of showing an error. */
      case 'PUSH_KEY':
        return json(200, { configured: await pushConfigured(), publicKey: await pushPublicKey() });
      case 'PUSH_SUBSCRIBE':
        return json(200, await pushSubscribe(email, payload));
      case 'PUSH_UNSUBSCRIBE':
        return json(200, await pushUnsubscribe(email, payload));
      case 'PUSH_TEST':
        return json(200, await pushTest(email));
      default:
        return json(400, { error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`Action ${action} failed for ${email}:`, err);
    return json(500, { error: 'Something went wrong saving your data. Please retry.' });
  }
};

module.exports = { handler };
