/**
 * Autonomic master dashboard API.
 *
 * One POST endpoint, action-dispatched, behind the HTTP API's Cognito JWT
 * authorizer. The authorizer proves the caller holds a valid token from the
 * DiscoveryMark user pool — which every DiscoveryMark customer also holds — so
 * the email allowlist below is the actual access control. Never remove it.
 *
 * Actions:
 *   LOAD         -> { entries, settings, ui }
 *   SYNC         { upserts, deletes, settings, ui } -> applies a client diff
 *   REPLACE_ALL  { entries, settings } -> wipes and rewrites every entry
 *   PINGS        { since } -> the mobile app's cohort-ping counters
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
  PutCommand,
} = require('@aws-sdk/lib-dynamodb');

/* One implementation of the ping read, shared with the public keyed route. */
const { report: pingReport } = require('../ping/main');

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

const DEFAULT_SETTINGS = { trialDays: 7, wallDays: 14, currency: '$' };

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

const cleanSettings = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const trialDays = Number(raw.trialDays);
  const wallDays = Number(raw.wallDays);
  return {
    trialDays: Number.isFinite(trialDays) && trialDays > 0 ? Math.round(trialDays) : DEFAULT_SETTINGS.trialDays,
    wallDays: Number.isFinite(wallDays) && wallDays > 0 ? Math.round(wallDays) : DEFAULT_SETTINGS.wallDays,
    currency: typeof raw.currency === 'string' && raw.currency.length <= 4 ? raw.currency : DEFAULT_SETTINGS.currency,
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
    }
  });

  entries.sort((a, b) => (a.date === b.date
    ? a.platform.localeCompare(b.platform)
    : a.date.localeCompare(b.date)));

  return { entries, settings, ui };
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

  return { upserted: upserts.length, deleted: deletes.length };
};

/** Wipe every entry and write the supplied set. Backs a JSON-backup restore. */
const replaceAll = async (pk, payload) => {
  const existing = await readAll(pk);
  const staleKeys = existing
    .filter((i) => typeof i.SK === 'string' && i.SK.startsWith('ENTRY#'))
    .map((i) => i.SK);

  const incoming = (Array.isArray(payload.entries) ? payload.entries : [])
    .map(cleanEntry)
    .filter(Boolean);

  // Keys we're about to rewrite don't need deleting first.
  const keeping = new Set(incoming.map((e) => entrySk(e.date, e.platform)));
  const toDelete = staleKeys.filter((sk) => !keeping.has(sk));

  if (toDelete.length) {
    await writeBatches(toDelete.map((SK) => ({ DeleteRequest: { Key: { PK: pk, SK } } })));
  }

  return sync(pk, { upserts: incoming, settings: payload.settings });
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
      // (PING#OPEN / PING#SUB), not any dashboard user's, but they are read
      // through this handler so the allowlist above guards them too — the
      // dashboard already holds a token, and shouldn't also hold the ping
      // lambda's shared key.
      case 'PINGS':
        return json(200, await pingReport(payload.since));
      default:
        return json(400, { error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`Action ${action} failed for ${email}:`, err);
    return json(500, { error: 'Something went wrong saving your data. Please retry.' });
  }
};

module.exports = { handler };
