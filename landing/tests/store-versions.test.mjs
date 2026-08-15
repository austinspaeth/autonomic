/* The Play-listing parse, which is the fragile half of "what is live in the
   stores" and the only half that can be tested without the network.

   It reaches across into `sls/lambdas/api/storeVersions.js` rather than living
   beside it, because `npm run test:master` is the one command in this repo that
   actually runs a test suite, and a test nobody runs is a test that rots. The
   backend of the /master dashboard is documented in MASTER_DASHBOARD.md for the
   same reason.

   What is being protected here is a refusal. Apple publishes an API and its
   answer is true; Google publishes nothing, so the Android version is read out
   of an undocumented blob on a page that can be restructured without notice.
   Every case below is a way that page could change such that a scraper keeps
   answering confidently with a number that is wrong — and a wrong version is
   worse than no version, because the card is read to decide whether a release
   went live. */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parsePlay } = require('../../sls/lambdas/api/storeVersions.js');

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

/* A `ds:5` block, which is where the app's own details actually live. Other
   blocks on a real listing hold reviews, similar apps and the developer's
   other titles — all of which can contain version-shaped strings. */
const ds = (key, body) => `<script class="ds:5">AF_initDataCallback({key: '${key}', hash: '9', data:${body}, sideChannel: {}});</script>`;

/* --------------------------------------------------------------- the page */

const REAL = ds('ds:5', '[[["Autonomic Journal"]],[[["1.24.1"]]]]');
const got = parsePlay(REAL);
check('the version comes out of the ds:5 blob', got.version === '1.24.1', JSON.stringify(got));
check('and says which shape it matched, so a silent change of shape is visible',
  got.source === 'play-nested-json', got.source);

/* The old listing layout still appears on some pages, and it is unambiguous
   where the blob is not — so it wins outright. */
const LABELLED = '<div>Current Version</div><div><span><div><span>1.23</span>' + REAL;
check('a labelled "Current Version" is preferred over the blob',
  parsePlay(LABELLED).version === '1.23', JSON.stringify(parsePlay(LABELLED)));
check('and is reported as the different source it is',
  parsePlay(LABELLED).source === 'play-labelled');

/* ------------------------------------------------------- what must NOT happen */

/* THE case this is all built around. Google reshapes the page, the pattern we
   match is no longer specific to the version, and two candidates come back.
   Picking either one — first, highest, longest — is how a scraper reports the
   version of some other app in the "similar apps" rail as yours. */
const TWO = ds('ds:5', '[[["1.24.1"]]],[[["3.0.2"]]]');
const amb = parsePlay(TWO);
check('two candidate versions is an ambiguity, never a pick',
  amb.error === 'ambiguous' && !amb.version, JSON.stringify(amb));
check('and the reason names both, so the next shape change is diagnosable',
  /1\.24\.1/.test(amb.detail) && /3\.0\.2/.test(amb.detail), amb.detail);

/* The same version appearing several times is one answer, not a conflict —
   the blob repeats it. */
const REPEATED = ds('ds:5', '[[["1.24.1"]]],[[["1.24.1"]]],[[["1.24.1"]]]');
check('the same version repeated is still one answer',
  parsePlay(REPEATED).version === '1.24.1', JSON.stringify(parsePlay(REPEATED)));

/* Version-shaped strings outside ds:5 — a review of a competitor, the rail of
   similar apps — must not be able to reach the answer at all. */
const NOISE = ds('ds:7', '[[["9.9.9"]]]') + REAL + ds('ds:4', '[[["0.1"]]]');
check('version-shaped values in other blocks are out of scope',
  parsePlay(NOISE).version === '1.24.1', JSON.stringify(parsePlay(NOISE)));

/* A page with nothing to read is a named failure, not an empty string that
   renders as a blank where a version belongs. */
const EMPTY = '<html><body>Sorry, the requested URL was not found.</body></html>';
const miss = parsePlay(EMPTY);
check('a page with no version says so', miss.error === 'not-found' && !miss.version, JSON.stringify(miss));
check('and says it in a sentence a human can act on', /undocumented|changed/.test(miss.detail), miss.detail);

check('an empty body does not throw', parsePlay('').error === 'not-found');
check('a missing body does not throw', parsePlay(undefined).error === 'not-found');

/* A single integer is not a version. Play pages are full of bare numbers in
   this shape — ratings counts, screenshot dimensions — so the pattern requires
   at least one dot before it will believe anything. */
const BARE = ds('ds:5', '[[["4"]]],[[["1000000"]]]');
check('a bare integer is not mistaken for a version',
  parsePlay(BARE).error === 'not-found', JSON.stringify(parsePlay(BARE)));

/* ------------------------------------------------------------------ report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
