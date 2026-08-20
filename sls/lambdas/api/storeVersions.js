/**
 * What version of the app is live in each store, read from the stores.
 *
 * The dashboard cannot ask either store directly — one has no CORS headers and
 * the other serves a whole HTML page — so this runs in the Lambda, behind the
 * same allowlist as every other action, and caches the answer in the table.
 *
 * The two stores are not remotely equivalent sources, and the difference is the
 * most important thing on this page:
 *
 *   **iOS is an API.** `itunes.apple.com/lookup` is a public, documented,
 *   unauthenticated JSON endpoint that returns the live version, the day it was
 *   released, the release notes and the rating. It is what the App Store's own
 *   web pages are built on. It is reliable, and what it says is true.
 *
 *   **Android is a SCRAPE.** Google publishes no equivalent. The official route
 *   is the Play Developer API, which needs a service account and Play Console
 *   grants; the route taken here instead is to read the public listing page,
 *   where the version survives inside an undocumented JSON blob that Google can
 *   restructure without notice and has before. So this is written to FAIL, not
 *   to guess: it reports which shape it matched, it refuses to answer when two
 *   candidate versions disagree, and every failure mode comes back as a named
 *   reason the dashboard prints. A wrong version number is worse than none —
 *   the whole point of the card is to tell you whether a release actually went
 *   live, and a stale or invented number answers that question incorrectly with
 *   total confidence.
 *
 * Nothing here is user data and nothing is per-account: one cache row serves
 * every reader, which also keeps us well inside Apple's informal rate limit
 * when the dashboard refreshes itself every five minutes on three devices.
 */

/* The AWS SDK is required INSIDE the two cache helpers rather than at the top
   of the file. The half of this module worth testing is `parsePlay`, which is
   pure, and a top-level import would make loading it depend on the Lambda's
   own node_modules being installed — which is how a pure function ends up with
   no test. Node caches the require, so it costs nothing on the second call. */

/* The app, in both stores. Hard-coded rather than configurable: this dashboard
   is one product's, and `mobile/app.json` is where these actually live. */
const BUNDLE_ID = 'com.autonomic.journal';
const PACKAGE = 'com.autonomic.journal';

/* How long an answer is served before we go and ask again. The stores change
   a few times a month; the dashboard refreshes every five minutes on every
   view, on every open device. Thirty minutes is the difference between a
   handful of requests a day and a few thousand. The header's refresh button
   passes `force` and ignores this. */
const CACHE_MS = 30 * 60 * 1000;

/* Neither store is on the critical path of anything. A slow answer must never
   hold up the dashboard's own refresh, so both fetches are bounded well inside
   the function's own timeout and a timeout is just another named failure. */
const FETCH_MS = 6000;

const CACHE_PK = 'STORE#VERSIONS';
const CACHE_SK = 'latest';

/** A version we are willing to believe: 1, 1.2, 1.2.3 or 1.2.3.4. */
const VERSION_RE = /^\d+(?:\.\d+){0,3}$/;

/* -------------------------------------------------------------- fetching */

async function get(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, { headers: headers || {}, signal: ctrl.signal, redirect: 'follow' });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ iOS */

/**
 * Apple's lookup API. `country` matters: an app is a different listing in each
 * storefront and can be live in one before another, so the answer is always
 * labelled with the storefront it came from rather than presented as "the"
 * version.
 */
async function readAppStore(country = 'us') {
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(BUNDLE_ID)}&country=${country}`;
  let res;
  try {
    res = await get(url);
  } catch (err) {
    return { error: 'unreachable', detail: String((err && err.name) || err) };
  }
  if (!res.ok) return { error: 'http', detail: `Apple answered ${res.status}` };

  let data;
  try {
    data = JSON.parse(res.text);
  } catch (err) {
    return { error: 'unreadable', detail: 'Apple did not answer with JSON' };
  }

  const app = (data.results || [])[0];
  /* Not an error: an app that has never been approved is simply not there, and
     saying so is the correct answer rather than a failure to report. */
  if (!app) return { error: 'not-listed', detail: `No app with bundle id ${BUNDLE_ID} in the ${country.toUpperCase()} store` };

  return {
    version: String(app.version || '') || null,
    released: app.currentVersionReleaseDate ? String(app.currentVersionReleaseDate).slice(0, 10) : null,
    notes: app.releaseNotes ? String(app.releaseNotes).slice(0, 4000) : null,
    minimumOs: app.minimumOsVersion || null,
    rating: typeof app.averageUserRating === 'number' ? app.averageUserRating : null,
    ratingCount: typeof app.userRatingCount === 'number' ? app.userRatingCount : null,
    url: app.trackViewUrl || null,
    country: country.toUpperCase(),
    source: 'itunes-lookup'
  };
}

/* -------------------------------------------------------------- Android */

/**
 * The Play listing, parsed.
 *
 * Two shapes are tried, most specific first, and BOTH are heuristics over
 * markup nobody promised us:
 *
 *   `labelled`  the old listing layout, where a "Current Version" label sits
 *               next to its value. Google removed this from most listings in
 *               2021, but it still appears on some.
 *   `nested`    the version as it sits inside the page's `AF_initDataCallback`
 *               data blob, which serialises as the distinctive `[[["1.2.3"]]]`.
 *               This is what actually matches today.
 *
 * The nested shape can match more than one string on a page. Rather than pick
 * one — which is how a scraper reports a number from a screenshot caption as
 * the app's version — every match is collected and the answer is only given if
 * they AGREE. Disagreement is reported as disagreement.
 */
function parsePlay(html) {
  const page = String(html || '');

  const labelled = page.match(/Current Version<\/[^>]+>(?:(?!\d)[\s\S]){0,200}?>(\d+(?:\.\d+){0,3})</);
  if (labelled && VERSION_RE.test(labelled[1])) {
    return { version: labelled[1], source: 'play-labelled' };
  }

  /* Narrow to the `ds:5` payload before looking. The listing embeds a dozen
     `AF_initDataCallback` blocks and the app's own details are one of them;
     scanning the whole page instead means competing with review text, the
     minimum Android version and anything else that serialises the same way.
     If the key ever moves, we scan everything and lean on the agreement rule
     below rather than reporting nothing. */
  const blocks = [];
  const blockRe = /AF_initDataCallback\((\{[\s\S]*?\})\);?\s*<\/script>/g;
  let b;
  while ((b = blockRe.exec(page)) !== null) {
    if (/key:\s*'ds:5'/.test(b[1])) blocks.push(b[1]);
  }
  const scope = blocks.length ? blocks.join('\n') : page;

  const found = new Set();
  const re = /\[\[\["(\d+(?:\.\d+){1,3})"\]\]\]/g;
  let m;
  while ((m = re.exec(scope)) !== null) {
    if (VERSION_RE.test(m[1])) found.add(m[1]);
  }

  if (found.size === 1) {
    return { version: [...found][0], source: blocks.length ? 'play-nested-json' : 'play-nested-json-unscoped' };
  }
  if (found.size > 1) {
    /* Deliberately not "pick the first" or "pick the highest". Two candidates
       means the shape we are matching is no longer specific to the version,
       and the next number it hands back could be anything. */
    return {
      error: 'ambiguous',
      detail: `The listing page held more than one version-shaped value (${[...found].sort().join(', ')}), so none of them is trustworthy`
    };
  }
  return {
    error: 'not-found',
    detail: 'No version in the listing page — Google publishes this only inside an undocumented blob, and the shape of it has changed'
  };
}

async function readPlayStore(country = 'US') {
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(PACKAGE)}&hl=en&gl=${country}`;
  let res;
  try {
    /* A browser-shaped UA, because the version only appears in the page Google
       serves to browsers. This is the whole trade of scraping in one line: we
       are asking for a page meant for a person, and everything downstream of
       it is inference. */
    res = await get(url, {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    });
  } catch (err) {
    return { error: 'unreachable', detail: String((err && err.name) || err) };
  }

  if (res.status === 404) {
    return { error: 'not-listed', detail: `No Play listing for ${PACKAGE}` };
  }
  if (!res.ok) return { error: 'http', detail: `Google answered ${res.status}` };

  const parsed = parsePlay(res.text);
  if (parsed.error) return Object.assign({ country, url }, parsed);
  return {
    version: parsed.version,
    source: parsed.source,
    country,
    url: `https://play.google.com/store/apps/details?id=${PACKAGE}`
  };
}

/* ---------------------------------------------------------------- cache */

async function readCache(ddb, table) {
  try {
    const { GetCommand } = require('@aws-sdk/lib-dynamodb');
    const out = await ddb.send(new GetCommand({ TableName: table, Key: { PK: CACHE_PK, SK: CACHE_SK } }));
    return out.Item || null;
  } catch (err) {
    /* A cache that cannot be read is not an error worth failing on — it just
       means we go and ask the stores. */
    return null;
  }
}

async function writeCache(ddb, table, value) {
  try {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');
    await ddb.send(new PutCommand({
      TableName: table,
      Item: Object.assign({ PK: CACHE_PK, SK: CACHE_SK }, value)
    }));
  } catch (err) {
    console.warn('Could not cache store versions:', err && err.message);
  }
}

/* -------------------------------------------------------------- exported */

/**
 * `{ at, ios, android, cached }`.
 *
 * Each store is either `{ version, ... }` or `{ error, detail }`, never a
 * mixture and never absent — the dashboard prints whichever it gets, and a
 * missing key would render as a blank where a reason belongs.
 *
 * The two are fetched together and one failing does not affect the other:
 * they are independent sources, and the Android one is expected to break
 * eventually.
 */
async function storeVersions(ddb, table, opts) {
  const force = !!(opts && opts.force);

  if (!force) {
    const hit = await readCache(ddb, table);
    if (hit && hit.at && (Date.now() - Number(hit.at)) < CACHE_MS) {
      return { at: Number(hit.at), ios: hit.ios || null, android: hit.android || null, cached: true };
    }
  }

  const [ios, android] = await Promise.all([
    readAppStore('us').catch((err) => ({ error: 'unreachable', detail: String(err && err.message) })),
    readPlayStore('US').catch((err) => ({ error: 'unreachable', detail: String(err && err.message) }))
  ]);

  const value = { at: Date.now(), ios, android };
  await writeCache(ddb, table, value);
  return Object.assign({ cached: false }, value);
}

module.exports = {
  storeVersions,
  // exported for the unit test — the parse is the fragile half, and it is the
  // only half that can be tested without the network
  parsePlay,
  BUNDLE_ID,
  PACKAGE,
  CACHE_MS
};
