/**
 * The Dysautonomia Awareness Month giveaway sign-up:
 *
 *   POST /ping/gvw/D082126I-TF-V1.30.0
 *   { "email": "someone@example.com",
 *     "entries": [ { "d": "2026-10-03", "m": "B" }, { "d": "2026-10-04", "m": "F" } ],
 *     "dev": false }
 *
 * THIS IS NOT A PING, and it is the one route on this function that is not
 * anonymous. It carries an email address, because a giveaway has to be able to
 * reach its winner, and the user typed it in and pressed a button that said so.
 * It rides the ping function for the plumbing only (the install code in the
 * path gives cohort, platform, tier and version with no second decoder) and
 * lives in its own file so none of that file's "no identifier" promises have to
 * carry an exception.
 *
 * What it may hold is fixed here, not by the client: the address, and one row
 * per giveaway day the user took a reading on — the DATE and the SENSOR letter
 * (W watch, B strap, F camera, G Garmin), never the reading. The entry count is
 * derived from that list and capped, so a client cannot claim more than it
 * lists.
 *
 * One row per ADDRESS (`PK GIVEAWAY`, `SK <lowercased email>`), written as an
 * upsert: the app sends again whenever its entry list grows, and a second phone
 * signing up with the same address updates the same row rather than doubling
 * the person's chances. `firstAt` survives every update.
 *
 * Unlike every ping it ANSWERS: 200 when the row is written, 400 when the body
 * is not a sign-up, 500 when the write failed. A counter must never tell the
 * app whether it landed (a retry is a double count); a sign-up must, because
 * the card says "You're signed up" only once it is true.
 */
const { UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const PK = 'GIVEAWAY';
/** Entries a person can earn: one per day with a reading, up to this. */
const GIVEAWAY_MAX_ENTRIES = 10;
/** The window a reading has to fall in to count (inclusive, day keys). */
const GIVEAWAY_START = '2026-10-01';
const GIVEAWAY_END = '2026-10-31';
/** A body larger than this is not one the app wrote. */
const GIVEAWAY_BODY_MAX = 4096;
const SENSORS = { W: 'Apple Watch', B: 'Bluetooth strap', F: 'Camera', G: 'Garmin' };

/** Lowercased and trimmed, or null. Deliberately loose past the basic shape:
 *  a strict pattern only ever refuses real addresses. */
const normEmail = (raw) => {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
};

/** Decode and clamp one sign-up body, or null if it is not one. Pure. */
const readGiveaway = (event) => {
  let raw = event?.body;
  if (typeof raw !== 'string' || !raw) return null;
  if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
  if (raw.length > GIVEAWAY_BODY_MAX) return null;
  let b;
  try { b = JSON.parse(raw); } catch { return null; }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const email = normEmail(b.email);
  if (!email) return null;

  // One entry per day inside the window, the first sensor named for it wins,
  // sorted, capped. Anything else in the list is dropped rather than refused.
  const seen = {};
  (Array.isArray(b.entries) ? b.entries : []).forEach((e) => {
    const d = e && typeof e.d === 'string' ? e.d : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < GIVEAWAY_START || d > GIVEAWAY_END) return;
    if (seen[d] !== undefined) return;
    seen[d] = SENSORS[e.m] ? e.m : null;
  });
  const entries = Object.keys(seen).sort().slice(0, GIVEAWAY_MAX_ENTRIES)
    .map((d) => ({ d, m: seen[d] }));

  return { email, entries, dev: b.dev === true };
};

const writeGiveaway = async (ddb, table, g, install, nowMs) => {
  const now = new Date(nowMs).toISOString();
  await ddb.send(new UpdateCommand({
    TableName: table,
    Key: { PK, SK: g.email },
    UpdateExpression: [
      'SET #email = :email, #entries = :entries, #count = :count',
      '#cohort = :cohort, #platform = :platform, #tier = :tier, #version = :version',
      '#dev = :dev, #first = if_not_exists(#first, :now), #last = :now, entityType = :et',
    ].join(', '),
    ExpressionAttributeNames: {
      '#email': 'email', '#entries': 'entries', '#count': 'entryCount',
      '#cohort': 'cohort', '#platform': 'platform', '#tier': 'tier', '#version': 'version',
      '#dev': 'dev', '#first': 'firstAt', '#last': 'lastAt',
    },
    ExpressionAttributeValues: {
      ':email': g.email,
      ':entries': g.entries,
      ':count': g.entries.length,
      ':cohort': install.iso,
      ':platform': install.platform || 'U',
      ':tier': install.tier || null,
      ':version': install.version || null,
      ':dev': g.dev,
      ':now': now,
      ':et': 'GIVEAWAY',
    },
  }));
};

/** Every sign-up, newest first. Read only through the authenticated `/master`
 *  API — never through the shared-key ping report, since these are addresses. */
const readGiveaways = async (ddb, table) => {
  const rows = [];
  let ExclusiveStartKey;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await ddb.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': PK },
      ExclusiveStartKey,
    }));
    (res.Items || []).forEach((item) => {
      rows.push({
        email: item.email || item.SK,
        entries: Array.isArray(item.entries) ? item.entries : [],
        entryCount: Number(item.entryCount) || 0,
        cohort: item.cohort || null,
        platform: item.platform || 'U',
        tier: item.tier || null,
        version: item.version || null,
        dev: item.dev === true,
        firstAt: item.firstAt || null,
        lastAt: item.lastAt || null,
      });
    });
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  rows.sort((a, b) => String(b.firstAt).localeCompare(String(a.firstAt)));
  return { rows, maxEntries: GIVEAWAY_MAX_ENTRIES, start: GIVEAWAY_START, end: GIVEAWAY_END };
};

module.exports = {
  readGiveaway, writeGiveaway, readGiveaways, normEmail,
  GIVEAWAY_MAX_ENTRIES, GIVEAWAY_START, GIVEAWAY_END, SENSORS,
};
