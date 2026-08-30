/**
 * Cohort ping — the only endpoint the mobile app itself talks to.
 *
 * Thirteen routes. Twelve public writers, no auth, no body, no response payload:
 *
 *   GET /ping/open/D082126I   the app was opened today by an install from that cohort
 *   GET /ping/sub/D082126I    an install from that cohort became a paid subscriber
 *   GET /ping/act/D082126IB   an install from that cohort took its FIRST HRV reading
 *   GET /ping/cap/D082126IG   an install STARTED a reading today
 *   GET /ping/hrv/D082126IG   an install COMPLETED one today
 *   GET /ping/pay/D082126IR   an install met the PAYWALL today
 *   GET /ping/not/D082126IM   an install turned a NOTIFICATION on today
 *   GET /ping/pot/D082126IT   an install finished a POTS capture today
 *   GET /ping/see/D082126II   an install opened a gated VIEW today
 *   GET /ping/err/D082126I    something on this install has FAILED (once, ever)
 *   GET /ping/osh/D082126IA   an OFFER was shown today
 *   GET /ping/odm/D082126IA   ...and dismissed
 *   GET /ping/oac/D082126IA   ...or accepted
 *
 * plus ONE route that is not a ping at all:
 *
 *   GET /fault/D082126I-TP-V1.26.0?t=health.check&m=timeout+after+<n>ms&f=1
 *
 * and one reader, guarded by a shared key:
 *
 *   GET /ping/report?key=...&since=2026-08-01   the counts back out as JSON
 *
 * PHASES OF ONE THING GET THEIR OWN ROUTE; flavours of one thing share a route
 * and are told apart by the slot letter. Started/completed, and
 * shown/dismissed/accepted, are read AGAINST each other — a completion rate, an
 * offer's conversion — and a route is the one distinction no consumer can
 * accidentally pool away. A sensor, a wall, a view or an offer is a flavour, and
 * lives in the letter.
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
 * reading: W Apple Watch, B Bluetooth strap, F finger on the camera, G Garmin
 * watch. It rides in the same code rather than in a query parameter so there is
 * exactly one thing to decode and one string to store, and it turns the same
 * matrix into "of the installs born on cohort C, how many ever got a first
 * reading, and with what". Activation fires once per install, so its rows count
 * installs, not sessions. An unknown letter is dropped rather than refused, so
 * a new sensor can ship on the client before this endpoint learns its name —
 * it lands as "no sensor" until this file is deployed, never as a lost count.
 *
 * The HRV route is the open route's twin. Opening the app is not using it: an
 * install that launches every morning and never measures produces a healthy
 * retention curve and an empty journal, and the open counter cannot tell that
 * apart from a reading a day. Because both are capped at one per install per
 * Eastern day by the same client rule, HRV over OPEN on one day is a genuine
 * SHARE OF PEOPLE — the only ratio on this endpoint that is, which is why the
 * two are bucketed identically and why nothing may be added to one of them
 * that CHANGES WHAT A COUNT MEANS in one and not the other.
 *
 * The sensor letter is not such a thing, which is why the HRV route carries one
 * and the open route does not. It splits the KEY a count lands under, never the
 * count: a day's HRV rows still sum to one per install per Eastern day, so the
 * share of people is untouched and a consumer that ignores the letter reads
 * exactly the number it read before. What the letter cannot claim is a person's
 * whole day — the cap means it names whichever reading came FIRST — and the
 * dashboard says so rather than pretending otherwise.
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
 *
 * ------------------------------------------------------------------ faults
 *
 * `/fault` is the one route here that is NOT a counter, and it lives under its
 * own path prefix so nothing reads the two the same way. Every ping above is a
 * fixed alphabet and a number that means "how many people"; a fault carries
 * TEXT — a tag naming the call site and a short redacted message — because the
 * counter it sits beside cannot say what broke and never will.
 *
 * `/ping/err` fires once per install EVER. That makes it a clean population
 * ("how many phones have had something go wrong") and permanently blind to the
 * next question: an install that hiccuped in March has spent its ping and is
 * silent through every bug shipped since, so a release that broke Health
 * imports for every Android phone would not move it by one. Both now run. The
 * counter says how many; this says what, once per distinct failure per install
 * per Eastern day, so a bug that is still live is still reported tomorrow.
 *
 * Stored by SIGNATURE rather than by event: PK `FAULT`, SK
 * `<day>#<tag>#<hash>`, holding a count and the platform / version / tier
 * splits. One row per distinct failure per day, however many phones hit it, so
 * the table grows with the number of BUGS and not with the number of crashes —
 * and the row answers the only question that decides a hotfix: how many
 * installs, on which build, on which OS.
 *
 * A COUNT HERE IS INSTALL-DAYS, NOT OCCURRENCES. The client sends one report
 * per signature per day, so a phone stuck in a retry loop contributes 1. That
 * is the number worth having — how many phones are affected — and how often it
 * happened on one phone is what the support dump is for.
 *
 * THE MESSAGE IS REDACTED TWICE, on the client before it is sent and again
 * here before it is stored. Not belt and braces: the client's redaction is a
 * promise about builds we shipped, and this one is the promise about what can
 * ever be WRITTEN — a modified client, an old build, or somebody curling the
 * URL cannot put a path, an email or an id into this table. `redactFault`
 * below is the client's `redactMessage` (mobile/src/lib/errorReport.ts) again,
 * the same duplication `easternDay` already carries and for the same reason:
 * the two runtimes must agree and neither may depend on the other.
 *
 * Fault rows carry a TTL and expire after FAULT_TTL_DAYS. They are diagnostic,
 * not a historical series — nobody asks what was crashing fourteen months ago —
 * and an expiry is also what bounds the damage a prober can do, since this is
 * the one route where a request creates a ROW rather than incrementing one.
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

const KINDS = {
  open: 'OPEN', sub: 'SUB', act: 'ACT',
  cap: 'CAP', hrv: 'HRV',
  pay: 'PAY', not: 'NOT', pot: 'POT', see: 'SEE', err: 'ERR',
  osh: 'OSH', odm: 'ODM', oac: 'OAC',
};

/** The routes whose slot letter is a capture SENSOR. */
const READING_KINDS = { ACT: 1, CAP: 1, HRV: 1 };

/* ------------------------------------------------------------------ dates */

/** Platforms a ping may declare. Anything else, or nothing, reads as U. */
const PLATFORMS = { I: 'ios', A: 'android', U: 'unknown' };

/** Capture methods a READING ping may declare — the ACT and HRV routes. */
const METHODS = { W: 'watch', B: 'bluetooth', F: 'finger', G: 'garmin' };

/**
 * Locked surfaces a PAYWALL ping may declare. They ride in the same slot the
 * sensor letter uses, because a route only ever sends one alphabet: the reading
 * routes say which sensor, the paywall route says which wall, and neither can
 * be handed the other's letters (see the slot check in the handler).
 *
 * `S` is not a wall — it is the Upgrade button in Settings, tapped by somebody
 * who went LOOKING for the paywall. It is counted separately for exactly that
 * reason: a conversion rate that mixes people who walked into a lock with
 * people who went shopping is describing neither.
 */
const SURFACES = {
  R: 'progress-range',
  I: 'insights',
  P: 'pots',
  O: 'outlook-ai',
  M: 'metric-ai',
  N: 'insights-ai',
  S: 'settings',
};

/**
 * What an install could do at the instant it pinged. Every route carries it.
 * A missing letter is `?` — every ping sent before this shipped — and `?` is
 * never folded into free: "we did not ask" and "they had not paid" are
 * different facts, and only one of them is about the user.
 */
const TIERS = { F: 'free', T: 'trial', P: 'pro' };

/** Which notification was turned ON — the NOT route. Only enables are sent. */
const NOTIFY = { M: 'morning-reminder', C: 'crash-warning' };

/** Which POTS capture finished — the POT route. */
const POTS = { T: 'stand-test', E: 'episode' };

/** Which gated view was opened — the SEE route. */
const VIEWS = { I: 'insights', P: 'progress' };

/** Which offer — the OSH / ODM / OAC routes, one alphabet across all three so
 *  the three counts are directly comparable per offer. */
const OFFERS = { A: 'annual-half-off', F: 'founding-member' };

/**
 * The alphabet each route speaks, or null for the routes that carry no letter.
 *
 * Validated per route rather than globally, because the same slot means
 * different things on different routes and NOTHING on several of them. A route
 * that takes no letter must DROP one: otherwise a prober can append a character
 * to an open ping and fragment one cohort's opens across keys no consumer knows
 * to re-add, which is a silent, permanent undercount rather than a visible bad
 * row.
 */
const ALPHABET = {
  ACT: METHODS, CAP: METHODS, HRV: METHODS,
  PAY: SURFACES, NOT: NOTIFY, POT: POTS, SEE: VIEWS,
  OSH: OFFERS, ODM: OFFERS, OAC: OFFERS,
};

/**
 * Decode one ping code into `{ iso, platform, slot, tier, version }`, or null
 * if it isn't a real date.
 *
 * The shape is a fixed-width HEAD plus optional tagged tokens:
 *
 *   D082126IG-TP-V1.26.0
 *   |  |   ||  |    |
 *   |  |   ||  |    the build
 *   |  |   ||  the tier at the instant of the ping: F free / T trial / P paid
 *   |  |   |the slot: a sensor on a reading route, a surface on the paywall one
 *   |  |   the platform: I / A / U
 *   |  the cohort, MMDDYY
 *   the marker
 *
 * Two-digit years are 20xx — this endpoint outlives neither the app nor 2099.
 * Everything after `D{MMDDYY}` is optional, and that is not politeness: builds
 * predating each field are still installed and still pinging, and every one of
 * them must land as a real count with the field absent rather than be refused.
 * An unrecognised letter is likewise dropped rather than refused, so a new
 * sensor, surface or tier can ship on the client before this endpoint learns
 * its name — it lands as "unknown", never as a lost count.
 *
 * The tokens are TAGGED rather than positional because the head cannot be
 * extended: `[A-Z]?[A-Z]?` cannot tell a missing sensor from a tier letter in
 * the sensor's place, so `D082126IP` would be ambiguous forever. A tag says
 * what a token is whatever else is present.
 */
const decodeCohort = (raw) => {
  const parts = String(raw || '').split('-');
  const m = /^D(\d{2})(\d{2})(\d{2})([A-Z])?([A-Z])?$/.exec(parts[0] || '');
  if (!m) return null;
  const [, mm, dd, yy, p, slot] = m;
  const iso = `20${yy}-${mm}-${dd}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  // Round-trip guards against 02-31 and friends, which Date.parse accepts.
  if (new Date(t).toISOString().slice(0, 10) !== iso) return null;

  let tier = null;
  let version = null;
  parts.slice(1).forEach((tok) => {
    if (/^T[A-Z]$/.test(tok)) tier = TIERS[tok[1]] ? tok[1] : null;
    // A version is a map key, so it is accepted only in the one shape a human
    // can read back. Anything else is dropped, never stored as written.
    if (/^V\d+(\.\d+){0,2}$/.test(tok)) version = tok.slice(1);
  });

  return { iso, platform: PLATFORMS[p] ? p : 'U', slot: slot || null, tier, version };
};

/**
 * The key a cohort is counted under inside a day row: MMDDYY + platform + the
 * slot letter, then `-` and the tier, e.g. `082126IG-P`.
 *
 * Platform, slot and tier live in the KEY rather than in counters of their own
 * so that every question the matrix already answers — retention, conversion,
 * day N — can also be asked per platform, per sensor and per tier, which is
 * what makes "did the people who converted measure more first" answerable at
 * all. Reads split it back apart.
 *
 * The tier hangs off a `-` rather than being a fourth fixed character because
 * keys written before it existed are 6, 7 and 8 characters long and must keep
 * decoding exactly as they always did; a delimiter says "everything before this
 * is the old key" without a length check.
 *
 * THE VERSION IS DELIBERATELY NOT HERE. This map gains one entry per distinct
 * combination that pinged that day, and cohorts accumulate forever: multiplying
 * it by the number of live builds as well walks a busy day's row toward
 * DynamoDB's 400KB item ceiling, at which point the day stops counting
 * altogether. Version is counted in `builds` below, against platform and tier
 * but not against cohort — a bounded map, and the loss is only the three-way
 * question ("pro share of the day-30 cohort on 1.26"), which nothing asks.
 */
const cohortKey = (iso, platform, slot, tier) => (
  `${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(2, 4)}${platform || 'U'}${slot || ''}`
  + (tier ? `-${tier}` : '')
);

/**
 * The key a BUILD is counted under in the same day row: platform, tier and
 * version, e.g. `I-P-1.26.0`. Bounded by (2 platforms x 3 tiers x however many
 * builds are still installed), i.e. tens of entries, not thousands.
 *
 * Missing parts are `?` rather than omitted, so this map stays a complete
 * partition of the day: every ping lands in exactly one build key and the map
 * sums to the day's total. That is what lets the dashboard say "68% of today's
 * opens came from builds too old to name themselves" instead of quietly
 * reporting 32% adoption as if the rest were on something else.
 */
const buildKey = (platform, tier, version) => (
  `${platform || 'U'}-${tier || '?'}-${version || '?'}`
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
 *   {
 *     day: '2026-08-21',
 *     total: 137,
 *     cohorts: { '082126I-F': 12, '080126A-P': 4 },   // cohort x platform x slot x tier
 *     builds:  { 'I-F-1.26.0': 31, 'A-P-1.25.1': 9 }, // platform x tier x version
 *   }
 *
 * TWO maps, and the split is the whole design: `cohorts` answers everything
 * that needs an install's AGE (retention, activation, conversion by day N) and
 * `builds` answers everything about what is INSTALLED right now. Version is in
 * the second and not the first because putting it in the first multiplies a map
 * that already grows forever by the number of live builds — see `cohortKey`.
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
 * Size: `cohorts` gains one small entry per distinct cohort+platform+slot+tier
 * seen that day, so a row grows with the app's age, and `builds` is bounded by
 * the number of builds still installed. Both stay far from DynamoDB's 400KB
 * item ceiling — which is a live constraint here and not a theoretical one,
 * since an item that hits it stops counting the day rather than failing loudly.
 */
const bump = async (kind, day, cohortIso, platform, slot, tier, version) => {
  const cKey = cohortKey(cohortIso, platform, slot, tier);
  const bKey = buildKey(platform, tier, version);
  const add = new UpdateCommand({
    TableName: TABLE,
    Key: { PK: `PING#${kind}`, SK: day },
    UpdateExpression: [
      'SET #cohorts.#c = if_not_exists(#cohorts.#c, :zero) + :one',
      '#builds.#b = if_not_exists(#builds.#b, :zero) + :one',
      '#total = if_not_exists(#total, :zero) + :one',
      '#day = :day',
      'entityType = :t',
    ].join(', '),
    ExpressionAttributeNames: {
      '#cohorts': 'cohorts', '#c': cKey, '#builds': 'builds', '#b': bKey,
      '#total': 'total', '#day': 'day',
    },
    ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':day': day, ':t': 'PING_DAY' },
  });

  try {
    await ddb.send(add);
  } catch (err) {
    // Writing into a nested path fails while the parent map doesn't exist yet,
    // i.e. on the first ping of the day — and, for rows that predate it, on
    // every ping until `builds` is created. Create both maps, then redo the
    // bump. `if_not_exists` keeps that safe against another Lambda racing us
    // here — whoever loses the race leaves the winner's counts alone.
    if (err?.name !== 'ValidationException') throw err;
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `PING#${kind}`, SK: day },
      UpdateExpression: 'SET #cohorts = if_not_exists(#cohorts, :empty), #builds = if_not_exists(#builds, :empty)',
      ExpressionAttributeNames: { '#cohorts': 'cohorts', '#builds': 'builds' },
      ExpressionAttributeValues: { ':empty': {} },
    }));
    await ddb.send(add);
  }
};

/**
 * Every day row of one kind from `since` onwards. SK is the ISO day, so the
 * range condition is the query and nothing is filtered client-side.
 *
 * Keys are decoded here rather than in the dashboard so that every consumer
 * agrees about what a key means, and decoded LENIENTLY: this table holds rows
 * written by every version of this file that ever ran, from 6-character keys
 * with no platform through to today's. Each field is read only if its part is
 * present, and absent parts stay null rather than being guessed — `null` and
 * `'F'` are different claims, and the dashboard is built to show the
 * difference.
 */
const readDays = async (kind, since) => {
  const reading = !!READING_KINDS[kind];
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
      const builds = item.builds || {};
      rows.push({
        day: item.SK,
        total: Number(item.total) || 0,
        // Every spelling a consumer might want: the stored key as-is, the
        // MMDDYY date without its platform letter, the ISO date (so a consumer
        // can do date arithmetic — day N of a cohort — without re-implementing
        // the decode), and each letter on its own. Rows written before a
        // marker existed simply lack it.
        cohorts: Object.keys(cohorts)
          .map((key) => {
            const [head, tierPart] = String(key).split('-');
            const cohortDate = head.slice(0, 6);
            const platform = head.length > 6 ? head.slice(6, 7) : 'U';
            // The 8th character is the slot: a sensor on the reading routes, a
            // surface on the paywall route. It is reported under BOTH the
            // generic name and the name its route gives it, so a consumer can
            // tell "this kind of ping has no sensor" apart from "a sensor we
            // could not read" without knowing which kind it is holding.
            const slot = head.length > 7 ? head.slice(7, 8) : null;
            const tier = TIERS[tierPart] ? tierPart : null;
            return {
              key,
              cohortDate,
              cohort: `20${cohortDate.slice(4, 6)}-${cohortDate.slice(0, 2)}-${cohortDate.slice(2, 4)}`,
              platform,
              slot,
              method: reading ? slot : null,
              surface: kind === 'PAY' ? slot : null,
              tier,
              count: Number(cohorts[key]) || 0,
            };
          })
          .sort((a, b) => a.cohort.localeCompare(b.cohort)
            || a.platform.localeCompare(b.platform)
            || String(a.slot).localeCompare(String(b.slot))
            || String(a.tier).localeCompare(String(b.tier))),
        // The build split of the same day. `?` is a real value here, not a
        // gap: it is every ping from a build that predates the field, and
        // folding it into a named build would invent adoption that did not
        // happen. Rows written before this map existed report an empty array,
        // which is the same statement made by omission.
        builds: Object.keys(builds)
          .map((key) => {
            const [platform, tierPart, version] = String(key).split('-');
            return {
              key,
              platform: PLATFORMS[platform] ? platform : 'U',
              tier: TIERS[tierPart] ? tierPart : null,
              version: version && version !== '?' ? version : null,
              count: Number(builds[key]) || 0,
            };
          })
          .sort((a, b) => a.platform.localeCompare(b.platform)
            || String(a.tier).localeCompare(String(b.tier))
            || String(a.version).localeCompare(String(b.version))),
      });
    });
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return rows;
};

/* ----------------------------------------------------------------- faults */

/** How long a fault row lives. Diagnostic, not a series: nobody asks what was
 *  crashing fourteen months ago, and an expiry bounds the one route here that
 *  creates rows rather than incrementing them. */
const FAULT_TTL_DAYS = 120;

/** Caps on what may be stored. The client already applies both; these are what
 *  make them true of the TABLE rather than of the builds we shipped. */
const FAULT_MSG_MAX = 160;
const FAULT_TAG_MAX = 40;

/** Rows one read may return. A dashboard that has to draw ten thousand rows has
 *  stopped being a diagnostic tool; if this is ever hit, the answer is on the
 *  first page anyway (the query is newest-day-last, and the UI sorts). */
const FAULT_READ_MAX = 4000;

/**
 * A tag is a stable dotted key the app chose (`store.persist`, `health.check`).
 * Checked rather than cleaned: a string that is not one of ours is not a tag
 * with bad characters in it, and sanitising it would invent a call site.
 */
const safeTag = (raw) => {
  const t = String(raw || '').trim().toLowerCase().slice(0, FAULT_TAG_MAX);
  return /^[a-z0-9][a-z0-9._-]*$/.test(t) ? t : 'unknown';
};

/**
 * The client's `redactMessage`, again.
 *
 * Duplicated rather than shared, the same way `easternDay` is: the two run in
 * different runtimes, neither can import the other, and the property that
 * matters is that NOTHING unredacted can be written here whatever the caller
 * is. If these two ever disagree, this one wins, because this one is the only
 * promise that survives a build we did not ship.
 *
 * Each rule catches a real shape a real failure produces: an email in a file
 * name, a URL's path or query, an iOS container path holding the device's own
 * UUID, a receipt or update id, and any digit run long enough to be a timestamp
 * or a key. Short digit runs survive so `code 404` still reads as `code 404`.
 */
const redactFault = (raw) => {
  let s = String(raw == null ? '' : raw);
  s = s.replace(/[\u0000-\u001f\u007f]+/g, ' ');
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>');
  s = s.replace(/\b([a-z][a-z0-9+.-]*):\/\/([^\s/?#]*)[^\s]*/gi, '$1://$2');
  s = s.replace(/(^|[\s"'(\[<])((?:\/[^\s/]+){2,}\/?)/g, (_all, pre, p) => {
    const parts = p.split('/').filter(Boolean);
    return `${pre}…/${parts[parts.length - 1] || ''}`;
  });
  s = s.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>');
  s = s.replace(/\b[0-9a-f]{12,}\b/gi, '<id>');
  s = s.replace(/\b[A-Za-z0-9_-]{24,}\b/g, '<id>');
  s = s.replace(/\d{4,}/g, '<n>');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > FAULT_MSG_MAX ? `${s.slice(0, FAULT_MSG_MAX - 1)}…` : s;
};

/** FNV-1a, 32 bits, 8 hex characters. Not a security hash: it is the stable
 *  part of a signature's key, so the same failure lands on the same row. */
const hash8 = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/**
 * The row one fault lands on: `<day>#<tag>#<hash of the redacted message>`.
 *
 * The hash is taken of the message AS STORED, so what the dashboard shows is
 * what the grouping was computed from — hashing the raw text instead would let
 * two rows that read identically sit apart because of a timestamp neither of
 * them displays. A fatal is its own row: a crash and a swallowed error that
 * read alike are not the same bug.
 */
const faultKey = (day, tag, msg, fatal) => `${day}#${tag}#${hash8(msg)}${fatal ? '!' : ''}`;

/**
 * Count one fault, creating its row on first sight.
 *
 * `count` is install-days, per the header. The three splits beside it are the
 * ones a fix is actually decided from — which build, which OS, which tier —
 * and they are maps for the same reason the ping counters' are: a nested map
 * key is addressable, so the whole thing is one atomic UpdateItem and two
 * phones reporting in the same millisecond cannot lose a count.
 *
 * `msg` and `tag` are written with `if_not_exists` so the FIRST spelling of a
 * failure is the one that sticks. They hash to the same row by construction, so
 * this only matters if the redaction ever changes under a live key — and then
 * the stored row keeping its original text is the right answer, not a race.
 */
const bumpFault = async (day, tag, msg, fatal, platform, tier, version, nowMs) => {
  const key = faultKey(day, tag, msg, fatal);
  const add = new UpdateCommand({
    TableName: TABLE,
    Key: { PK: 'FAULT', SK: key },
    UpdateExpression: [
      'SET #platforms.#p = if_not_exists(#platforms.#p, :zero) + :one',
      '#versions.#v = if_not_exists(#versions.#v, :zero) + :one',
      '#tiers.#t = if_not_exists(#tiers.#t, :zero) + :one',
      '#count = if_not_exists(#count, :zero) + :one',
      '#day = :day, #tag = :tag, #fatal = :fatal',
      '#msg = if_not_exists(#msg, :msg)',
      '#first = if_not_exists(#first, :now)',
      '#last = :now',
      '#ttl = :ttl',
      'entityType = :et',
    ].join(', '),
    ExpressionAttributeNames: {
      '#platforms': 'platforms', '#p': platform || 'U',
      '#versions': 'versions', '#v': version || '?',
      '#tiers': 'tiers', '#t': tier || '?',
      '#count': 'count', '#day': 'day', '#tag': 'tag', '#msg': 'msg',
      '#fatal': 'fatal', '#first': 'firstAt', '#last': 'lastAt', '#ttl': 'expiresAt',
    },
    ExpressionAttributeValues: {
      ':zero': 0,
      ':one': 1,
      ':day': day,
      ':tag': tag,
      ':msg': msg,
      ':fatal': !!fatal,
      ':now': new Date(nowMs).toISOString(),
      ':ttl': Math.floor(nowMs / 1000) + FAULT_TTL_DAYS * 86400,
      ':et': 'FAULT',
    },
  });

  try {
    await ddb.send(add);
  } catch (err) {
    // Same shape as `bump`: a nested path can't be written while its parent map
    // does not exist, i.e. on a signature's first ever sighting. Create the
    // three maps, then redo. `if_not_exists` keeps that safe against a race.
    if (err?.name !== 'ValidationException') throw err;
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: 'FAULT', SK: key },
      UpdateExpression: 'SET #platforms = if_not_exists(#platforms, :empty), '
        + '#versions = if_not_exists(#versions, :empty), #tiers = if_not_exists(#tiers, :empty)',
      ExpressionAttributeNames: { '#platforms': 'platforms', '#versions': 'versions', '#tiers': 'tiers' },
      ExpressionAttributeValues: { ':empty': {} },
    }));
    await ddb.send(add);
  }
};

/**
 * Every fault row from `since` onwards. The day leads the sort key, so the
 * range condition is the query and nothing is filtered afterwards.
 *
 * The three splits come back as plain objects rather than as decoded arrays
 * (the shape `cohorts` and `builds` use) because their keys are single facts
 * with obvious names — a platform letter, a tier letter, a version string —
 * and there is no composite key to take apart.
 */
const readFaults = async (since) => {
  const rows = [];
  let ExclusiveStartKey;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND SK >= :since',
      ExpressionAttributeValues: { ':pk': 'FAULT', ':since': since },
      ExclusiveStartKey,
    }));
    (res.Items || []).forEach((item) => {
      const num = (m) => Object.keys(m || {}).reduce((a, k) => {
        a[k] = Number(m[k]) || 0;
        return a;
      }, {});
      rows.push({
        key: item.SK,
        day: item.day || String(item.SK || '').slice(0, 10),
        tag: item.tag || 'unknown',
        msg: item.msg || '',
        fatal: !!item.fatal,
        count: Number(item.count) || 0,
        firstAt: item.firstAt || null,
        lastAt: item.lastAt || null,
        platforms: num(item.platforms),
        versions: num(item.versions),
        tiers: num(item.tiers),
      });
    });
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey && rows.length < FAULT_READ_MAX);
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows.slice(0, FAULT_READ_MAX);
};

/**
 * Every kind, keyed by route name. Shared with the dashboard API.
 *
 * Each counter started on a different day, and that is the rule every consumer
 * has to honour: a MISSING row is "no build was sending this yet", which is
 * unknown, not zero. A consumer written before a counter existed reads the same
 * object it always did and ignores the extra key.
 *
 * Read in one fan-out rather than lazily per route because the dashboard draws
 * them against each other — completions against starts, accepts against shows,
 * anything against opens — and a view that fetched them one at a time would
 * render a funnel a stage at a time.
 */
const REPORT_KINDS = Object.keys(KINDS);

const report = async (since) => {
  const from = isIsoDate(since) ? since : EPOCH;
  const [rows, faults] = await Promise.all([
    Promise.all(REPORT_KINDS.map((k) => readDays(KINDS[k], from))),
    // Read alongside the counters rather than behind a second call: the
    // dashboard shows failures against opens ("of the phones in the app today,
    // how many hit this"), and a view that fetched them separately would draw
    // the numerator before the denominator.
    readFaults(from).catch((err) => {
      // A fault read must never take the counters down with it. This is the
      // newest partition in the table and the only one with no rows at all on a
      // stage that has never received one.
      console.error('fault read failed', err);
      return [];
    }),
  ]);
  const out = { since: from, faults };
  REPORT_KINDS.forEach((k, i) => { out[k] = rows[i]; });
  return out;
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

/**
 * One fault report: `/fault/{code}?t=<tag>&m=<message>&f=1`.
 *
 * The path is the same install code every ping sends, so cohort day, platform,
 * tier and build version arrive with no second decoder. The variable-length
 * parts ride in the query string, which is where a message can go without
 * fighting path encoding — error text is full of slashes, and an encoded slash
 * in a path parameter is a fight with API Gateway nobody wins.
 *
 * The cohort is decoded for its PLATFORM, TIER and VERSION and then thrown
 * away. That is deliberate: a fault is grouped by what broke, and adding the
 * cohort to the key would fragment one bug across every install age that hit
 * it — turning the one number that decides a hotfix ("how many phones") into a
 * scatter nobody can add up. It is also the one field here with no bearing on a
 * fix, so keeping it would be collecting for its own sake.
 */
const handleFault = async (event) => {
  const decoded = decodeCohort(event?.pathParameters?.cohort);
  if (!decoded) return noContent;
  const { iso: cohort, platform, tier, version } = decoded;

  const now = Date.now();
  if (cohort < EPOCH) return noContent;
  if (Date.parse(`${cohort}T00:00:00Z`) > now + SKEW_MS) return noContent;

  const q = event?.queryStringParameters || {};
  const msg = redactFault(q.m);
  // A report with nothing in it is not a report. Refusing it here is what stops
  // an empty-message row existing at all, which would otherwise be the one row
  // a prober could create for free and nobody could act on.
  if (!msg) return noContent;

  await bumpFault(
    easternDay(now), safeTag(q.t), msg, q.f === '1', platform, tier, version, now,
  );
  return noContent;
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

  // The fault route. Its own prefix, because it is not a counter: it carries
  // text, it is stored by signature rather than by cohort, and reading the two
  // the same way is the one mistake this endpoint's shape is designed to
  // prevent. Same 204-for-everything rule as the writers above.
  if (path.startsWith('/fault/')) {
    try {
      return await handleFault(event);
    } catch (err) {
      console.error('fault write failed', err);
      return noContent;
    }
  }

  const kindKey = /\/ping\/([a-z]{3,4})\//.exec(path)?.[1];
  const kind = KINDS[kindKey];
  if (!kind) return noContent;

  const decoded = decodeCohort(event?.pathParameters?.cohort);
  if (!decoded) return noContent;
  const { iso: cohort, platform, slot, tier, version } = decoded;

  const now = Date.now();
  if (cohort < EPOCH) return noContent;
  if (Date.parse(`${cohort}T00:00:00Z`) > now + SKEW_MS) return noContent;

  // The slot letter means different things on different routes and NOTHING on
  // the rest, so it is validated against the alphabet this route actually
  // speaks. A route that takes no slot drops it: otherwise an open ping could
  // be made to fragment its own key on a letter a prober appended, and one
  // cohort's opens would split across keys that no consumer knows to re-add.
  const alphabet = ALPHABET[kind] || null;
  const slotFor = alphabet && alphabet[slot] ? slot : null;

  try {
    await bump(kind, easternDay(now), cohort, platform, slotFor, tier, version);
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

module.exports = {
  handler, decodeCohort, cohortKey, buildKey, easternDay, report, ALPHABET, KINDS,
  redactFault, safeTag, faultKey, hash8, FAULT_MSG_MAX, FAULT_TTL_DAYS,
};
