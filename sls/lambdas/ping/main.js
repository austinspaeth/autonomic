/**
 * Cohort ping — the only endpoint the mobile app itself talks to.
 *
 * Five routes. Four public writers, no auth, no body, no response payload:
 *
 *   GET /ping/open/D082126I   the app was opened today by an install from that cohort
 *   GET /ping/sub/D082126I    an install from that cohort became a paid subscriber
 *   GET /ping/act/D082126IB   an install from that cohort took its FIRST HRV reading
 *   GET /ping/hrv/D082126IB   an install from that cohort took a reading TODAY
 *
 * and one reader, guarded by a shared key:
 *
 *   GET /ping/report?key=...&since=2026-08-01   the counts back out as JSON
 *
 * The path segment is the install's COHORT date in D{MMDDYY} form — the day
 * that install first ran the app — followed by one letter for the platform the
 * build runs on: I for iOS, A for Android, U for unknown (which is also what a
 * missing letter means, since builds that shipped before the marker existed
 * send none). That pair is the only thing the app sends. The server stamps the
 * day it arrived, so the stored shape is "one row per day, holding a count per
 * cohort+platform" — which read as a grid is a retention matrix: of the
 * installs born on cohort C, how many opened the app on day D.
 *
 * The two READING routes carry ONE more letter, the sensor that took the
 * reading: W watch, B Bluetooth strap, F finger on the camera. It rides in the
 * same code rather than in a query parameter so there is exactly one thing to
 * decode and one string to store, and it turns the same matrix into "of the
 * installs born on cohort C, how many got a reading, and with what". Activation
 * fires once per install, so its rows count installs; the HRV route fires once
 * per install per day, so its rows count install-days. Read together they are
 * the only way to ask whether people who START on the camera KEEP measuring:
 * there is no identifier here, so the two routes cannot be joined per person,
 * and comparing their sensor mixes by install age is what is left.
 *
 * The HRV route is the open route's twin. Opening the app is not using it: an
 * install that launches every morning and never measures produces a healthy
 * retention curve and an empty journal, and the open counter cannot tell that
 * apart from a reading a day. Because both are capped at one per install per
 * Eastern day by the same client rule, HRV over OPEN on one day is a genuine
 * SHARE OF PEOPLE — the only ratio on this endpoint that is.
 *
 * The sensor letter does not cost that, because a row's letters partition its
 * installs rather than multiplying them: summing an HRV day across W/B/F/none
 * gives back exactly the count the letterless route reported. What must never
 * be added to one of the two without the other is anything that changes the
 * POPULATION — a second ping per day, a different day boundary, a different
 * trigger than "the app was used". Those would break the ratio; a breakdown
 * does not.
 *
 * Days here are US EASTERN days, not UTC ones: these are the business's own
 * numbers and are read against its own calendar, so a ping at 8pm in New York
 * belongs to that evening rather than to tomorrow. The client dedupes against
 * the same Eastern boundary (mobile/src/lib/ping.ts holds an identical
 * `easternDay`), which is what keeps one install to one count per row.
 *
 * What this deliberately is NOT: there is no device id, no install id, no
 * session id, no IP retained, no request body, no user agent stored. Nothing
 * here can be tied back to a person or a phone, and nothing here can be
 * de-duplicated server-side either — which is why the CLIENT pings at most
 * once per Eastern day (mobile/src/store/ping.ts). One ping == one active install
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

const KINDS = { open: 'OPEN', sub: 'SUB', act: 'ACT', hrv: 'HRV' };

/* ------------------------------------------------------------------ dates */

/** Platforms a ping may declare. Anything else, or nothing, reads as U. */
const PLATFORMS = { I: 'ios', A: 'android', U: 'unknown' };

/** Capture methods a READING ping may declare. */
const METHODS = { W: 'watch', B: 'bluetooth', F: 'finger' };

/** The kinds whose rows may carry a method letter — the two reading routes.
 *  An open or a subscribe has no sensor, so a letter arriving on one of those
 *  is discarded at the write. */
const METHOD_KINDS = { ACT: true, HRV: true };

/**
 * Decode D{MMDDYY}{P}{M?} into `{ iso, platform, method }`, or null if it isn't
 * a real date. Two-digit years are 20xx — this endpoint outlives neither the app
 * nor 2099. The platform letter is optional: builds that shipped before the
 * marker existed send `D082126`, and they count as U rather than being refused.
 * The method letter is optional too and only the two reading routes send one
 * (the handler discards it on the others); an unrecognised letter is dropped
 * rather than refused, so a future sensor can ship on the client before this
 * endpoint knows its name.
 */
const decodeCohort = (raw) => {
  const m = /^D(\d{2})(\d{2})(\d{2})([A-Z])?([A-Z])?$/.exec(String(raw || ''));
  if (!m) return null;
  const [, mm, dd, yy, p, meth] = m;
  const iso = `20${yy}-${mm}-${dd}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  // Round-trip guards against 02-31 and friends, which Date.parse accepts.
  if (new Date(t).toISOString().slice(0, 10) !== iso) return null;
  return { iso, platform: PLATFORMS[p] ? p : 'U', method: METHODS[meth] ? meth : null };
};

/**
 * The key a cohort is counted under inside a day row: MMDDYY + platform, e.g.
 * `082126I`. Platform lives in the key rather than in a counter of its own so
 * that every question the matrix already answers (retention, conversion, day
 * N) can also be asked per platform. Reads split it back apart.
 */
const cohortKey = (iso, platform, method) => (
  `${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(2, 4)}${platform || 'U'}${method || ''}`
);

/** Day-of-month of the `n`th Sunday of a month (1-based n, 0-based month). */
const nthSunday = (year, month, n) => {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
};

/**
 * Is this instant inside US Eastern daylight time? Second Sunday of March at
 * 02:00 standard (07:00 UTC) through the first Sunday of November at 02:00
 * daylight (06:00 UTC). Spelled out rather than asked of `Intl` so that this
 * and the client's copy can't drift apart across runtimes.
 */
const isEasternDst = (ms) => {
  const year = new Date(ms).getUTCFullYear();
  return ms >= Date.UTC(year, 2, nthSunday(year, 2, 2), 7)
      && ms < Date.UTC(year, 10, nthSunday(year, 10, 1), 6);
};

/** The US Eastern calendar day of a timestamp, as YYYY-MM-DD. */
const easternDay = (nowMs) => new Date(nowMs - (isEasternDst(nowMs) ? 4 : 5) * 3600000)
  .toISOString().slice(0, 10);

const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/* ---------------------------------------------------------------- storage */

/**
 * One item per day per kind, holding every cohort's count for that day:
 *
 *   PK  PING#OPEN
 *   SK  2026-08-21
 *   { day: '2026-08-21', total: 137, cohorts: { '082126I': 12, '080126A': 4 } }
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
const bump = async (kind, day, cohortIso, platform, method) => {
  const key = cohortKey(cohortIso, platform, method);
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
        // Every spelling a consumer might want: the stored key as-is, the
        // MMDDYY date without its platform letter, the ISO date (so a consumer
        // can do date arithmetic — day N of a cohort — without re-implementing
        // the decode), and the platform on its own. Rows written before the
        // marker existed have a 6-character key and report as U.
        cohorts: Object.keys(cohorts)
          .map((key) => {
            const cohortDate = key.slice(0, 6);
            const platform = key.length > 6 ? key.slice(6, 7) : 'U';
            // Only the two reading kinds carry an 8th character, and the HRV
            // route only from the build that started sending it — so null here
            // means "this row names no sensor", which a consumer must read as
            // UNKNOWN rather than as a sensor it could not identify. Days of
            // HRV rows written before the letter shipped are all null, and the
            // dashboard dates the breakdown from the first row that isn't.
            const method = key.length > 7 ? key.slice(7, 8) : null;
            return {
              key,
              cohortDate,
              cohort: `20${cohortDate.slice(4, 6)}-${cohortDate.slice(0, 2)}-${cohortDate.slice(2, 4)}`,
              platform,
              method,
              count: Number(cohorts[key]) || 0,
            };
          })
          .sort((a, b) => a.cohort.localeCompare(b.cohort)
            || a.platform.localeCompare(b.platform)
            || String(a.method).localeCompare(String(b.method))),
      });
    });
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return rows;
};

/** All four kinds, `{ open, sub, act, hrv }`. Shared with the dashboard API.
 *
 *  A consumer written before the HRV counter existed reads the same object it
 *  always did and simply ignores the extra key; one written after it must treat
 *  a MISSING `hrv` row the way it treats a missing day, since the counter only
 *  starts on the day the first build carrying it shipped. */
const report = async (since) => {
  const from = isIsoDate(since) ? since : EPOCH;
  const [open, sub, act, hrv] = await Promise.all([
    readDays('OPEN', from), readDays('SUB', from), readDays('ACT', from), readDays('HRV', from),
  ]);
  return { since: from, open, sub, act, hrv };
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

  const kindKey = /\/ping\/(open|sub|act|hrv)\//.exec(path)?.[1];
  const kind = KINDS[kindKey];
  if (!kind) return noContent;

  const decoded = decodeCohort(event?.pathParameters?.cohort);
  if (!decoded) return noContent;
  const { iso: cohort, platform, method } = decoded;

  const now = Date.now();
  if (cohort < EPOCH) return noContent;
  if (Date.parse(`${cohort}T00:00:00Z`) > now + SKEW_MS) return noContent;

  try {
    // Only the two READING routes carry a sensor letter. Opens and subscribes
    // are not readings, so a letter on one of those is junk from a prober and
    // is dropped rather than stored — otherwise it would fork their cohort keys
    // and quietly split one day's count across two of them.
    await bump(kind, easternDay(now), cohort, platform, METHOD_KINDS[kind] ? method : null);
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

module.exports = { handler, decodeCohort, cohortKey, easternDay, report };
