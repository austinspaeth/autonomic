/**
 * Cohort ping — the only endpoint the mobile app itself talks to.
 *
 * Three routes. Two public writers, no auth, no body, no response payload:
 *
 *   GET /ping/open/D082126   the app was opened today by an install from that cohort
 *   GET /ping/sub/D082126    an install from that cohort became a paid subscriber
 *
 * and one reader, guarded by a shared key:
 *
 *   GET /ping/report?key=...&since=2026-08-01   the counts back out as JSON
 *
 * The path segment is the install's COHORT date in D{MMDDYY} form — the day
 * that install first ran the app. It is the only thing the app sends. The
 * server stamps the day it arrived (UTC), so the stored shape is
 * "one row per day, holding a count per cohort" — which read as a grid is a
 * retention matrix: of the installs born on cohort C, how many opened the app
 * on day D.
 *
 * What this deliberately is NOT: there is no device id, no install id, no
 * session id, no IP retained, no request body, no user agent stored. Nothing
 * here can be tied back to a person or a phone, and nothing here can be
 * de-duplicated server-side either — which is why the CLIENT pings at most
 * once per UTC day (mobile/src/store/ping.ts). One ping == one active install
 * that day. A cohort date is shared by every install from that day, so it
 * identifies a day, not a user.
 *
 * The trade this makes: counts are trusted rather than verified. Anyone can
 * curl a write URL and inflate a number. That is accepted — the alternative is
 * an identifier, which is the thing we are refusing to collect.
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE = process.env.DYNAMO_TABLE_NAME;

/** Shared secret for the read route. Unset ⇒ the route refuses everyone, which
 *  is the right way to fail: these are the business's numbers. */
const REPORT_KEY = String(process.env.PING_REPORT_KEY || '');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** Cohorts older than this are rejected as junk — the app did not exist. */
const EPOCH = '2025-01-01';

/** A cohort can't be in the future; allow a day of clock skew / timezone. */
const SKEW_MS = 36 * 60 * 60 * 1000;

const KINDS = { open: 'OPEN', sub: 'SUB' };

/* ------------------------------------------------------------------ dates */

/**
 * Decode D{MMDDYY} into an ISO date, or null if it isn't a real one.
 * Two-digit years are 20xx — this endpoint outlives neither the app nor 2099.
 */
const decodeCohort = (raw) => {
  const m = /^D(\d{2})(\d{2})(\d{2})$/.exec(String(raw || ''));
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const iso = `20${yy}-${mm}-${dd}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  // Round-trip guards against 02-31 and friends, which Date.parse accepts.
  if (new Date(t).toISOString().slice(0, 10) !== iso) return null;
  return iso;
};

/** The MMDDYY key a cohort is counted under inside a day row. */
const cohortKey = (iso) => `${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(2, 4)}`;

const utcDay = (nowMs) => new Date(nowMs).toISOString().slice(0, 10);

const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/* ---------------------------------------------------------------- storage */

/**
 * One item per day per kind, holding every cohort's count for that day:
 *
 *   PK  PING#OPEN
 *   SK  2026-08-21
 *   { day: '2026-08-21', total: 137, cohorts: { '082126': 12, '080126': 4 } }
 *
 * A map rather than a list because a list has no addressable slot to increment:
 * appending would need a read-modify-write, and two phones pinging in the same
 * millisecond would lose a count. A map key is addressable, so the whole bump
 * is one atomic UpdateItem and concurrent pings never collide. Reads hand it
 * back as an array (see `report`), which is the shape a chart wants.
 *
 * The increment is `SET x = if_not_exists(x, 0) + 1` rather than the more
 * obvious `ADD x 1`: ADD only works on top-level attributes, and the per-cohort
 * counter is nested. Both are atomic; only one is legal here.
 *
 * Size: the map gains one small entry per distinct cohort seen that day, so a
 * row grows with the app's age (a few thousand keys after a decade), nowhere
 * near DynamoDB's 400KB item ceiling.
 */
const bump = async (kind, day, cohortIso) => {
  const key = cohortKey(cohortIso);
  const add = new UpdateCommand({
    TableName: TABLE,
    Key: { PK: `PING#${kind}`, SK: day },
    UpdateExpression: [
      'SET #cohorts.#c = if_not_exists(#cohorts.#c, :zero) + :one',
      '#total = if_not_exists(#total, :zero) + :one',
      '#day = :day',
      'entityType = :t',
    ].join(', '),
    ExpressionAttributeNames: { '#cohorts': 'cohorts', '#c': key, '#total': 'total', '#day': 'day' },
    ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':day': day, ':t': 'PING_DAY' },
  });

  try {
    await ddb.send(add);
  } catch (err) {
    // Writing into a nested path fails while the parent map doesn't exist yet,
    // i.e. on the first ping of the day. Create the empty map, then redo the
    // bump. `if_not_exists` keeps that safe against another Lambda racing us
    // here — whoever loses the race leaves the winner's counts alone.
    if (err?.name !== 'ValidationException') throw err;
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `PING#${kind}`, SK: day },
      UpdateExpression: 'SET #cohorts = if_not_exists(#cohorts, :empty)',
      ExpressionAttributeNames: { '#cohorts': 'cohorts' },
      ExpressionAttributeValues: { ':empty': {} },
    }));
    await ddb.send(add);
  }
};

/** Every day row of one kind from `since` onwards. SK is the ISO day, so the
 *  range condition is the query and nothing is filtered client-side. */
const readDays = async (kind, since) => {
  const rows = [];
  let ExclusiveStartKey;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND SK >= :since',
      ExpressionAttributeValues: { ':pk': `PING#${kind}`, ':since': since },
      ExclusiveStartKey,
    }));
    (res.Items || []).forEach((item) => {
      const cohorts = item.cohorts || {};
      rows.push({
        day: item.SK,
        total: Number(item.total) || 0,
        // Both spellings of the cohort: the MMDDYY key as stored, and the ISO
        // date, so a consumer can do date arithmetic (day N of a cohort)
        // without re-implementing the decode.
        cohorts: Object.keys(cohorts)
          .map((cohortDate) => ({
            cohortDate,
            cohort: `20${cohortDate.slice(4, 6)}-${cohortDate.slice(0, 2)}-${cohortDate.slice(2, 4)}`,
            count: Number(cohorts[cohortDate]) || 0,
          }))
          .sort((a, b) => a.cohort.localeCompare(b.cohort)),
      });
    });
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return rows;
};

/** Both kinds, `{ open: [...], sub: [...] }`. Shared with the dashboard API. */
const report = async (since) => {
  const from = isIsoDate(since) ? since : EPOCH;
  const [open, sub] = await Promise.all([readDays('OPEN', from), readDays('SUB', from)]);
  return { since: from, open, sub };
};

/* ---------------------------------------------------------------- handler */

/* 204 for everything a pinging client could see. The app must never learn
 * whether a ping landed — it would only be tempted to retry, and a retry is a
 * double count. Bad input is 204 too: a 4xx tells a prober which shapes are
 * real. */
const noContent = { statusCode: 204, body: '' };

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const handleReport = async (event) => {
  const q = event?.queryStringParameters || {};
  const given = String(q.key || event?.headers?.['x-ping-key'] || '');
  // Length check first so a mismatch can't be timed out of the comparison, and
  // an unset server key can't be satisfied by an empty one.
  if (!REPORT_KEY || given.length !== REPORT_KEY.length || given !== REPORT_KEY) {
    return json(403, { error: 'Not authorized.' });
  }
  return json(200, await report(q.since));
};

const handler = async (event) => {
  const path = event?.requestContext?.http?.path || '';

  if (path.endsWith('/ping/report')) {
    try {
      return await handleReport(event);
    } catch (err) {
      console.error('ping report failed', err);
      return json(500, { error: 'Could not read the ping counters.' });
    }
  }

  const kindKey = /\/ping\/(open|sub)\//.exec(path)?.[1];
  const kind = KINDS[kindKey];
  if (!kind) return noContent;

  const cohort = decodeCohort(event?.pathParameters?.cohort);
  if (!cohort) return noContent;

  const now = Date.now();
  if (cohort < EPOCH) return noContent;
  if (Date.parse(`${cohort}T00:00:00Z`) > now + SKEW_MS) return noContent;

  try {
    await bump(kind, utcDay(now), cohort);
  } catch (err) {
    // Nothing downstream cares and the client is already gone, but log the
    // failure so a flatlined chart has an explanation other than "nobody
    // opened the app".
    //
    // WITHOUT the cohort. A log line naming what one request carried is the
    // request, retained in readable form for the log group's 30 days — the
    // one thing that would turn this endpoint from "increments a counter"
    // into "collects data". The error and the kind are enough to debug with.
    console.error('ping write failed', kind, err);
  }
  return noContent;
};

module.exports = { handler, decodeCohort, cohortKey, report };
