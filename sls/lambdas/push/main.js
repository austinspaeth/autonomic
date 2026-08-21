/**
 * push — the hour that actually ticks.
 *
 * ----------------------------------------------------------- why this exists
 *
 * The dashboard has been able to raise a notification since the PWA shipped,
 * and `landing/master/pwa.js` is honest at the top of the file about what that
 * was worth: the page polls the counter every five minutes WHILE IT IS OPEN, so
 * a notification could only ever reach a window you had switched away from. Not
 * a phone in a pocket.
 *
 * The obvious fix — have the service worker check every hour — is the one thing
 * that cannot be built. A service worker runs when its page is open, when a
 * fetch it controls happens, or when a PUSH arrives, and then it is killed
 * within seconds. There is no timer that survives it. Periodic Background Sync
 * would be the API for it and iOS does not implement it (and where it does
 * exist it is gated behind engagement heuristics that a private dashboard will
 * never satisfy). An hourly `setInterval` inside a worker is not a feature that
 * works badly; it is a feature that silently never fires, which is worse than
 * not shipping it.
 *
 * So the hour moved to where an hour can be kept: an EventBridge schedule, once
 * an hour, running this. The worker's job is the half it CAN do — receive.
 * iOS 16.4+ delivers Web Push to a PWA that has been added to the home screen,
 * with the app closed, which is exactly the case the old notification missed.
 *
 * -------------------------------------------------------------- the sending
 *
 * `web-push` does the RFC 8291 payload encryption and the RFC 8292 VAPID
 * signature. It is the one dependency in this service that is not the AWS SDK,
 * and it is here rather than hand-rolled on `node:crypto` because ECDH + HKDF +
 * AES-128-GCM written from the spec fails silently when it is wrong: Apple
 * returns the same 201 for a payload it cannot decrypt as for one it can.
 *
 * ------------------------------------------------------------------- safety
 *
 * VAPID keys come from the environment, injected by CodeBuild out of SSM
 * exactly the way PING_REPORT_KEY is (see infrastructure/pipeline.yml).
 * **Unset is safe and is the default**: with no keys this function subscribes
 * nobody, sends nothing, and says so in its log. A dashboard that has never
 * been given keys therefore behaves precisely as it did before this shipped,
 * which is what makes the feature deployable before the secret exists.
 *
 * A subscription that the push service rejects as gone (404 / 410) is DELETED
 * rather than retried. That is not an optimisation — an endpoint is revoked
 * when the PWA is deleted or its permission withdrawn, and a job that kept
 * retrying would spend every hour failing against a device that no longer
 * wants to hear from us.
 */

'use strict';

const crypto = require('node:crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');

const { report: pingReport } = require('../ping/main');
const { snapshotDays, risen, headline, WINDOW_DAYS, shiftDay } = require('./news');

const TABLE = process.env.DYNAMO_TABLE_NAME;

/* Who may hold a subscription. The same allowlist the dashboard API enforces —
   this job reads each allowed partition by key rather than scanning, so a row
   written under any other partition is unreachable from here by construction. */
const ALLOWED = String(process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/* --------------------------------------------------------------- the keys
 *
 * One SSM SecureString holding both halves and the contact address:
 *
 *   { "publicKey": "...", "privateKey": "...", "subject": "mailto:..." }
 *
 * Read on a cold start rather than injected at build time. The reason is in
 * serverless.yml at length; the short version is that a build-time parameter
 * that does not exist yet fails the whole build, landing site included, and
 * this feature has to be mergeable before the secret exists.
 *
 * A MISSING PARAMETER IS A NORMAL STATE, not an error. It means the feature is
 * dark: nothing subscribes, nothing sends, and the settings card says so. Only
 * a genuinely unexpected failure is logged, and even then the answer is the
 * same — behave as if unconfigured rather than throw, because the alternative
 * is an hourly job that alarms in CloudWatch about a feature nobody turned on.
 */
const VAPID_PARAM = String(process.env.VAPID_PARAM || '').trim();
const DEFAULT_SUBJECT = 'mailto:austinspaeth@msn.com';

let keysPromise = null;

function loadKeys() {
  if (keysPromise) return keysPromise;
  keysPromise = (async () => {
    if (!VAPID_PARAM) return null;
    try {
      // Required lazily so this module still loads where the SDK is absent.
      // eslint-disable-next-line global-require
      const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
      const ssm = new SSMClient({});
      const res = await ssm.send(new GetParameterCommand({
        Name: VAPID_PARAM, WithDecryption: true,
      }));
      const raw = res && res.Parameter && res.Parameter.Value;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const publicKey = String(parsed.publicKey || '').trim();
      const privateKey = String(parsed.privateKey || '').trim();
      if (!publicKey || !privateKey) return null;
      return { publicKey, privateKey, subject: String(parsed.subject || DEFAULT_SUBJECT).trim() };
    } catch (err) {
      const name = err && (err.name || err.code);
      /* The parameter simply not being there is the dark state, and must not
         look like a fault. Anything else is worth a line in the log. */
      if (name !== 'ParameterNotFound') {
        console.error('push: could not read VAPID keys —', name || (err && err.message));
      }
      return null;
    }
  })();
  return keysPromise;
}

/** Configured means: we hold both halves of a keypair. Nothing else is checked
 *  here — a malformed key fails at send time, per subscription, and is logged. */
async function configured() {
  return !!(await loadKeys());
}

/** The public half, for handing to a browser. Empty when unconfigured; it is
 *  meant to be public — it is what `pushManager.subscribe` signs against. */
async function publicKey() {
  const k = await loadKeys();
  return (k && k.publicKey) || '';
}

/* ------------------------------------------------------------------ storage */

const pushPk = (email) => `PUSH#${String(email).toLowerCase().trim()}`;

/* One row, not one per user. There is one counter and its news is the same for
   everybody who can see it, so a per-user watermark would only be a way for two
   devices to disagree about what had already been announced. */
const STATE_PK = 'PUSH#STATE';
const STATE_SK = 'WATERMARK';

/** A stable id for an endpoint, so re-subscribing the same device replaces its
 *  row instead of adding a second one. The endpoint is long and contains
 *  characters a sort key would rather not carry; its hash is neither. */
const subId = (endpoint) => crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 32);

async function listSubscriptions() {
  const out = [];
  for (const email of ALLOWED) {
    let ExclusiveStartKey;
    do {
      // eslint-disable-next-line no-await-in-loop
      const res = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': pushPk(email), ':sk': 'SUB#' },
        ExclusiveStartKey,
      }));
      (res.Items || []).forEach((item) => {
        if (!item.endpoint || !item.p256dh || !item.auth) return;
        out.push({
          email,
          sk: item.SK,
          endpoint: item.endpoint,
          keys: { p256dh: item.p256dh, auth: item.auth },
        });
      });
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }
  return out;
}

async function readWatermark() {
  const res = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: STATE_PK, SK: STATE_SK },
  }));
  const item = res.Item;
  if (!item || !item.days) return null;
  return item.days;
}

async function writeWatermark(days, at) {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { PK: STATE_PK, SK: STATE_SK, days, at },
  }));
}

async function dropSubscription(sub) {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { PK: pushPk(sub.email), SK: sub.sk },
  }));
}

/* --------------------------------------------------------------- the sending */

/** Send one notification to every subscription, dropping the dead ones.
 *  Returns `{ sent, dropped, failed }`. Never throws: one bad endpoint must not
 *  cost the others their notification, or a single stale device would silence
 *  the phone that is still listening. */
async function sendToAll(subs, payload) {
  const keys = await loadKeys();
  if (!keys) return { sent: 0, dropped: 0, failed: 0, unconfigured: true };

  // Required lazily so the module still loads (and the pure half still tests)
  // in an environment where the dependency is not installed.
  // eslint-disable-next-line global-require
  const webpush = require('web-push');
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

  let sent = 0; let dropped = 0; let failed = 0;
  const body = JSON.stringify(payload);

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        body,
        /* Apple drops a push with no urgency hint on a device in Low Power
           Mode. TTL is one hour: this job runs again in an hour, and a banner
           about arrivals that is older than the next check is worse than no
           banner — it would land as news that has already been superseded. */
        { TTL: 3600, urgency: 'normal' },
      );
      sent += 1;
    } catch (err) {
      const status = err && (err.statusCode || err.status);
      if (status === 404 || status === 410) {
        dropped += 1;
        try { await dropSubscription(sub); } catch (e) { /* it will be retried next hour */ }
        return;
      }
      failed += 1;
      console.error('push send failed', status || (err && err.message));
    }
  }));

  return { sent, dropped, failed };
}

/* ------------------------------------------------------------------ handler */

/**
 * The hourly run.
 *
 * Order matters at exactly one point: the watermark is written whether or not
 * a send succeeded. A run that found news, failed to deliver it and then left
 * the watermark alone would find the same news next hour, and the hour after —
 * a device that is offline for a morning would come back to the same arrival
 * announced six times. The news is worth at most one attempt.
 */
const run = async () => {
  if (!(await configured())) {
    console.log('push: no VAPID keys configured — nothing sent');
    return { ok: true, configured: false };
  }

  /* Only what the window could possibly need. The report is keyed by day and
     the diff ignores anything older than WINDOW_DAYS, so reading a year of it
     every hour would be a year of rows to prove nothing changed. One extra day
     of slack covers a report whose newest day lags the calendar. */
  const since = shiftDay(new Date().toISOString().slice(0, 10), -(WINDOW_DAYS + 1));
  const report = await pingReport(since);

  const next = snapshotDays(report);
  const days = Object.keys(next).sort();
  const newest = days[days.length - 1] || null;

  const prev = await readWatermark();
  const gain = risen(prev, next, newest);
  const at = new Date().toISOString();

  if (gain.seeded) {
    /* First run. Store what is there and say nothing — announcing the whole
       back catalogue is how a new notification channel teaches its owner to
       turn it off on day one. */
    await writeWatermark(next, at);
    console.log('push: seeded watermark in silence', { days: days.length });
    return { ok: true, seeded: true };
  }

  const copy = headline(gain);
  await writeWatermark(next, at);

  if (!copy) return { ok: true, sent: 0, quiet: true };

  const subs = await listSubscriptions();
  if (!subs.length) {
    console.log('push: news but no subscriptions', copy.title);
    return { ok: true, sent: 0, subscriptions: 0 };
  }

  const result = await sendToAll(subs, {
    title: copy.title,
    body: copy.body,
    tag: copy.tag,
    url: '/master/?view=ping',
  });
  console.log('push:', copy.title, result);
  return { ok: true, ...result, title: copy.title };
};

const handler = async () => run();

module.exports = {
  handler,
  run,
  configured,
  publicKey,
  subId,
  pushPk,
  listSubscriptions,
  sendToAll,
};
