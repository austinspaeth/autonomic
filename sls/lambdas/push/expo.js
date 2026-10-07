/**
 * expo — instant pushes to the owner's phone, for the three events worth
 * being interrupted for: a NEW INSTALL, a SALE, and a HARD CRASH.
 *
 * The hourly Web Push job (./main.js) reaches the installed /master PWA; this
 * reaches the native dashboard app (mobile-dashboard/), through Expo's push
 * service, the moment the ping that carries the news arrives. The app
 * registers its Expo push token through the authenticated /api/master
 * (`PUSH_EXPO_REGISTER`), so only an allowlisted owner's phone is ever on the
 * list. Rows: PK `EXPOPUSH`, SK `TOKEN#<token>`.
 *
 * Three rules, because this runs inside the ping handler, which counts the
 * production app's usage and must never be made worse by it:
 *
 *  - IT NEVER THROWS and never delays the count: the caller bumps the counter
 *    FIRST, and every failure here is swallowed and logged. A push that does
 *    not arrive is a missed notification; a ping that does not count is a hole
 *    in a chart.
 *  - IT IS BOUNDED. A short timeout on the send, and the token list is cached
 *    in the warm container for a few minutes, so a burst of installs costs one
 *    table read, not one per ping.
 *  - IT CARRIES NOTHING PERSONAL. A push names the store, the tier, the plan
 *    or the crash's call site: the same facts the dashboard already shows.
 *    Never a cohort key, never a message body beyond the redacted fault text.
 */

'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, DeleteCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE = process.env.DYNAMO_TABLE_NAME;
const PK = 'EXPOPUSH';
const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const SEND_TIMEOUT_MS = 2500;
const CACHE_MS = 5 * 60 * 1000;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const STORE = { I: 'iOS', A: 'Android', U: 'unknown store' };
const TIER = { F: 'Free', T: 'Trial', P: 'Pro' };
const PLAN = { Y: 'Yearly', M: 'Monthly', P: 'Promo year', F: 'Founder year' };

/** An Expo push token, and nothing else, may be stored. */
const isToken = (t) => typeof t === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(t);

let cache = null;

async function tokens() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.list;
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': PK },
  }));
  const list = (res.Items || []).map((i) => i.token).filter(isToken);
  cache = { at: Date.now(), list };
  return list;
}

/** Register (or refresh) a device. Called from the authenticated API only. */
async function register(email, token, device) {
  if (!isToken(token)) return { ok: false, error: 'That is not an Expo push token.' };
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK,
      SK: `TOKEN#${token}`,
      token,
      email,
      device: String(device || '').slice(0, 80),
      at: new Date().toISOString(),
    },
  }));
  cache = null;
  return { ok: true };
}

async function unregister(token) {
  if (!isToken(token)) return { ok: false };
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK, SK: `TOKEN#${token}` } }));
  cache = null;
  return { ok: true };
}

/**
 * Send one notification to every registered phone. Never throws. A token
 * Expo reports as DeviceNotRegistered is deleted, the same rule the Web Push
 * job applies to a gone endpoint.
 */
async function send(title, body, data) {
  try {
    const list = await tokens();
    if (!list.length) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), SEND_TIMEOUT_MS);
    const res = await fetch(SEND_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(list.map((to) => ({ to, title, body, sound: 'default', data: data || {} }))),
    }).finally(() => clearTimeout(timer));
    const out = await res.json().catch(() => null);
    const tickets = (out && out.data) || [];
    await Promise.all(tickets.map((t, i) => (
      t && t.status === 'error' && t.details && t.details.error === 'DeviceNotRegistered'
        ? unregister(list[i]).catch(() => {})
        : null
    )));
  } catch (err) {
    console.error('expo push failed', err && (err.name || err.message));
  }
}

const join = (...xs) => xs.filter(Boolean).join(' · ');

/** A first run: an open ping whose install day IS the day it arrived. */
function newInstall({ platform, tier, version }) {
  return send('New install', join(STORE[platform] || STORE.U, TIER[tier], version ? `v${version}` : null), { kind: 'download' });
}

/** A subscribe ping: somebody just paid. */
function sale({ platform, slot, tier }) {
  return send('New sale', join(PLAN[slot] || 'Plan unknown', STORE[platform] || STORE.U, TIER[tier]), { kind: 'sale' });
}

/** A FATAL fault: the app went down in front of somebody. Not a handled error. */
function crash({ tag, msg, platform, version }) {
  return send(`Crash: ${tag}`, join(STORE[platform] || STORE.U, version ? `v${version}` : null, msg), { kind: 'crash' });
}

/** Tests only: forget the warm container's cached token list. */
const _resetCache = () => { cache = null; };

module.exports = { register, unregister, send, newInstall, sale, crash, isToken, _resetCache };
