/* The paywall, tier and build cards of the App usage view, rendered against a
   fixture whose answers are worked out by hand below.

   Separate from master-ping.test.mjs on purpose: that file pins the counters
   that existed before these fields did, and the thing most worth protecting
   here is that ADDING them changed none of its numbers. This file pins what
   the new cards claim, and — the part that actually bites — what they refuse
   to claim on days and builds that could not answer.

   The fixture is relative to today, since the view anchors its range to the
   newest ping day:

     A  born T-4, 10 installs
     B  born T-3, 4 installs

   The paywall counter starts at T-2, two days after the opens do, so T-4 and
   T-3 are days the app was demonstrably open and this counter was not running.
   They must read as a gap, never as "nobody met a wall".                     */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) {
  console.error(`No built page at ${PAGE} — run \`npm run build\` first.`);
  process.exit(1);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

const pad = (n) => (n < 10 ? '0' + n : '' + n);
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const T = (back) => { const d = new Date(); d.setDate(d.getDate() - back); return iso(d); };

/* Opens carry a tier from the start: 35 install-days over the window, of which
   6 are Pro. Two of the T-4 pings come from a build too old to say, and THOSE
   must stay out of the denominator — the Pro share is 6 of 33 (18.2%), not 6 of
   35, or retiring an old build would look like people converting. */
const OPEN = {
  [T(4)]: { [T(4)]: { F: 8, '?': 2 } },
  [T(3)]: { [T(4)]: { F: 4, P: 1 }, [T(3)]: { F: 4 } },
  [T(2)]: { [T(4)]: { F: 3, P: 2 }, [T(3)]: { F: 2 } },
  [T(1)]: { [T(4)]: { F: 2, P: 2 }, [T(3)]: { F: 1 } },
  [T(0)]: { [T(4)]: { F: 2, P: 1 }, [T(3)]: { F: 1 } },
};

/* Paywalls, from T-2 only. Progress ranges lead the walls (5), Insights next
   (3), the AI reports one each — and 4 taps on the Settings Upgrade button,
   which is NOT a wall and must be kept out of the ranking. If it were counted,
   Settings would tie Insights and the card would name the wrong front door. */
const PAY = {
  [T(2)]: { [T(4)]: { R: 2, I: 1, S: 2 } },
  [T(1)]: { [T(4)]: { R: 2, I: 1, O: 1 }, [T(3)]: { S: 1 } },
  [T(0)]: { [T(4)]: { R: 1, I: 1, M: 1, S: 1 } },
};

/* Builds — one map per day, summing to that day's opens, which is the property
   that makes an adoption share meaningful at all. 1.26.0 is the new release and
   reaches 15 of the 35 pings (42.9%); 2 are from builds too old to name
   themselves (5.71%), which the card must show rather than divide away. */
const BUILDS = {
  [T(4)]: { 'I-F-1.25.1': 8, 'I-?-?': 2 },
  [T(3)]: { 'I-F-1.25.1': 6, 'I-P-1.26.0': 1, 'A-F-1.26.0': 2 },
  [T(2)]: { 'I-F-1.25.1': 3, 'I-P-1.26.0': 2, 'A-F-1.26.0': 2 },
  [T(1)]: { 'I-F-1.25.1': 1, 'I-P-1.26.0': 2, 'A-F-1.26.0': 2 },
  [T(0)]: { 'I-P-1.26.0': 1, 'A-F-1.26.0': 3 },
};

/* One row per (cohort, tier), the way the endpoint decodes them. Platform is
   split iOS-odd-half so the platform arithmetic is exercised too. */
const split = (n) => [['I', Math.ceil(n / 2)], ['A', n - Math.ceil(n / 2)]].filter((p) => p[1] > 0);

const shapeTiered = (map, slotKey) => Object.keys(map).sort().map((day) => ({
  day,
  total: Object.values(map[day]).reduce(
    (a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0),
  cohorts: Object.keys(map[day]).sort().reduce((rows, cohort) => rows.concat(
    Object.keys(map[day][cohort]).sort().reduce((out, letter) => out.concat(
      split(map[day][cohort][letter]).map(([platform, count]) => {
        const row = {
          cohort,
          cohortDate: cohort.slice(5, 7) + cohort.slice(8, 10) + cohort.slice(2, 4),
          platform,
          slot: null,
          method: null,
          surface: null,
          tier: null,
          count,
        };
        if (slotKey === 'tier') row.tier = letter === '?' ? null : letter;
        else { row.slot = letter; row.surface = letter; row.tier = 'F'; }
        return row;
      }),
    ), []),
  ), []),
  builds: Object.keys(BUILDS[day] || {}).map((key) => {
    const [platform, tier, version] = key.split('-');
    return {
      key,
      platform,
      tier: tier === '?' ? null : tier,
      version: version === '?' ? null : version,
      count: BUILDS[day][key],
    };
  }),
}));

/* The capture pair. 20 readings begun over the 3 counted days and 13 finished
   — a 65% completion rate, and the split is the point: the camera finishes 6 of
   12 (50%) where the strap finishes 7 of 8 (87.5%). A pooled rate would hide
   exactly that. */
const CAP = {
  [T(2)]: { [T(4)]: { F: 4, B: 3 } },
  [T(1)]: { [T(4)]: { F: 4, B: 3 } },
  [T(0)]: { [T(4)]: { F: 4, B: 2 } },
};
const HRV = {
  [T(2)]: { [T(4)]: { F: 2, B: 3 } },
  [T(1)]: { [T(4)]: { F: 3, B: 2 } },
  [T(0)]: { [T(4)]: { F: 1, B: 2 } },
};

/* The offer funnel. The annual card is shown 10 times, accepted 2, dismissed 3
   — so 5 were IGNORED, which is the outcome with no gesture attached and has to
   be counted rather than left implied. */
const OSH = { [T(2)]: { [T(4)]: { A: 4 } }, [T(1)]: { [T(4)]: { A: 4 } }, [T(0)]: { [T(4)]: { A: 2 } } };
const OAC = { [T(1)]: { [T(4)]: { A: 1 } }, [T(0)]: { [T(4)]: { A: 1 } } };
const ODM = { [T(2)]: { [T(4)]: { A: 2 } }, [T(0)]: { [T(4)]: { A: 1 } } };

/* The per-letter routes. Somebody who opens both views in a day is counted in
   both — that is the whole reason these are capped per letter — so Insights (7)
   and Progress (5) are independent headcounts and must never be added. */
const SEE = { [T(2)]: { [T(4)]: { I: 3, P: 2 } }, [T(1)]: { [T(4)]: { I: 2, P: 2 } }, [T(0)]: { [T(4)]: { I: 2, P: 1 } } };
const POT = { [T(1)]: { [T(4)]: { T: 2, E: 1 } }, [T(0)]: { [T(4)]: { E: 2 } } };
const NOT = { [T(2)]: { [T(4)]: { M: 3, C: 2 } } };
/* Once per install ever, so this is a population joining, not a daily event. */
const ERR = { [T(1)]: { [T(4)]: { '?': 2 } }, [T(0)]: { [T(4)]: { '?': 1 } } };

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [b64u({ alg: 'RS256' }), b64u({ email: 'austinspaeth@msn.com', exp: Math.floor(Date.now() / 1000) + 3600 }), 'sig'].join('.');

const dom = new JSDOM(fs.readFileSync(PAGE, 'utf8'), {
  url: 'https://autonomic.care/master/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};

window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (obj) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(obj)) });

  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (body.action === 'LOAD') {
    return reply({
      entries: [], events: [],
      settings: { trialDays: 7, wallDays: 14, currency: '$' },
      ui: { view: 'ping' },
    });
  }
  if (body.action === 'PINGS') {
    return reply({
      since: body.payload.since,
      open: shapeTiered(OPEN, 'tier'),
      sub: [],
      act: [],
      hrv: [],
      pay: shapeTiered(PAY, 'surface'),
      cap: shapeTiered(CAP, 'surface'),
      hrv: shapeTiered(HRV, 'surface'),
      osh: shapeTiered(OSH, 'surface'),
      oac: shapeTiered(OAC, 'surface'),
      odm: shapeTiered(ODM, 'surface'),
      see: shapeTiered(SEE, 'surface'),
      pot: shapeTiered(POT, 'surface'),
      not: shapeTiered(NOT, 'surface'),
      err: shapeTiered(ERR, 'surface'),
    });
  }
  return reply({ ok: true });
};

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.error || e.message)));

await new Promise((r) => window.addEventListener('load', r));
await new Promise((r) => setTimeout(r, 200));
const $ = (id) => window.document.getElementById(id);

$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await new Promise((r) => setTimeout(r, 150));
[...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));

window.document.querySelector('.tab[data-view="ping"]').click();
await new Promise((r) => setTimeout(r, 400));

const text = (id) => ($(id).textContent || '').replace(/\s+/g, ' ').trim();

/* ---------------------------------------------------------------- paywall */

check('the paywall card drew a chart', $('pgPayDaily').querySelectorAll('path, rect').length > 0);

/* 15 walls-and-taps over 20 install-days, but only the 3 counted days are in
   the denominator: 15 of 15 install-days on T-2..T-0. The two earlier days are
   before the counter and have to be SAID, not silently dropped. */
check('the paywall note says how many days it had to leave out',
  /left out because the counter was not running yet/.test(text('pgPayNote')), text('pgPayNote'));

check('the paywall note reports a share of install-days',
  /of install-days on the app met the paywall/.test(text('pgPayNote')), text('pgPayNote'));

check('the paywall note says these are people, not taps',
  /share of the people who were there and not the number of times a lock fired/.test(text('pgPayNote')));

/* ---------------------------------------------------------------- surfaces */

check('the front door is the Progress range, which leads the WALLS',
  /front door to Pro is .*Progress range/.test(text('pgSurfaceNote')), text('pgSurfaceNote'));

/* The load-bearing one. Settings has 4 and Insights 3; if Settings were ranked
   as a wall it would come second and, with one more tap, first. It must be
   named separately and kept out. */
check('the deliberate Settings taps are counted apart from the walls',
  /A further 4 went looking for it in Settings, which is not a wall/.test(text('pgSurfaceNote')),
  text('pgSurfaceNote'));

check('Settings is never called the front door',
  !/front door to Pro is Settings/.test(text('pgSurfaceNote')), text('pgSurfaceNote'));

/* ------------------------------------------------------------------- tier */

/* 6 Pro of the 33 pings that named a tier = 18.2%. NOT 6 of 35: the two pings
   from a build too old to say are `?`, and folding them into Free would make the
   share sag while that build was still out there — and jump, falsely, the day it
   was retired. */
check('the Pro share is measured against the pings that named a tier',
  /18\.2%/.test(text('pgTierNote')) && /6 of 33/.test(text('pgTierNote')), text('pgTierNote'));

check('the tier rows name the counter each one is read off',
  /Pro share of actives/.test(text('pgTierNote'))
  && /Pro share of the people meeting walls/.test(text('pgTierNote')), text('pgTierNote'));

check('the tier chart drew a band per tier', $('pgTiers').querySelectorAll('path, rect').length > 0);

/* ------------------------------------------------------------------ build */

/* 1.26.0 is on 15 of the 35 pings = 42.9%, and the 2 that could not say are
   5.71%. Both numbers are shown; 15 of 33 (45.5%) would be the share of the
   builds new enough to answer, which is a claim about the wrong population. */
check('adoption is a share of every ping, including the ones that could not say',
  /1\.26\.0.*is on 42\.9%/.test(text('pgBuildNote')), text('pgBuildNote'));

check('the builds too old to name themselves are disclosed',
  /5\.71% came from builds too old to say/.test(text('pgBuildNote')), text('pgBuildNote'));

check('the build chart drew a band per version', $('pgBuilds').querySelectorAll('path, rect').length > 0);

/* The adoption twin. Counts move with the day's active total, so the same
   release can be spreading and still draw a narrower band; shares are what make
   the climb readable. On the last day every ping is 1.26.0, so its share is
   100% even though that is only four pings. */
check('the share chart drew a band per version too',
  $('pgBuildShare').querySelectorAll('path, rect').length > 0);
check('adoption is reported against the latest day with pings',
  /1\.26\.0 is on 100\.0% of the latest day/.test(text('pgBuildShareNote')), text('pgBuildShareNote'));
check('and says how long the release has been out',
  /first seen .*4 days ago so far/.test(text('pgBuildShareNote')), text('pgBuildShareNote'));

/* --------------------------------------------------------- capture funnel */

check('the capture funnel drew both counters', $('pgFunnel').querySelectorAll('path, rect').length > 0);

/* 13 of 20 finished = 65%, and 7 were begun and walked away from. That gap is
   the only place an abandoned reading exists at all: neither counter shows it. */
check('the funnel reports the completion rate over install-days',
  /65\.0% of started readings were finished/.test(text('pgFunnelNote')), text('pgFunnelNote'));

check('the readings walked away from are counted, not implied',
  /7 readings were begun and walked away from/.test(text('pgFunnelNote')), text('pgFunnelNote'));

/* The per-sensor split is the reason the card exists. Pooled, 65% is a number
   to worry about; split, it says which sensor to put in front of a new user. */
check('the funnel splits by sensor',
  /Phonecamera50\.0%/.test(text('pgFunnelNote').replace(/\s+/g, ''))
  && /Cheststrap87\.5%/.test(text('pgFunnelNote').replace(/\s+/g, '')),
  text('pgFunnelNote'));

/* --------------------------------------------------------------- offers */

check('the offer card drew a band per offer', $('pgOffers').querySelectorAll('path, rect').length > 0);

/* 2 accepted of 10 shown = 20%, 3 dismissed, and the remaining 5 ignored. */
check('the offer funnel reports accepts over shows',
  /20\.0%/.test(text('pgOfferNote')) && /2 accepted of 10 shown/.test(text('pgOfferNote')),
  text('pgOfferNote'));

check('the ignored outcome is counted rather than left implied',
  /5 ignored/.test(text('pgOfferNote')), text('pgOfferNote'));

/* The distinction that must survive any rewording: a tap on the buy button is
   not a purchase, and calling this "converted" would close that gap silently. */
check('accepted is not described as a purchase',
  /tap on the card's buy button, not a completed purchase/.test(text('pgOfferNote')),
  text('pgOfferNote'));

/* ------------------------------------------------------- product events */

check('the events card drew the live lines', $('pgEvents').querySelectorAll('path, rect').length > 0);

/* Insights 7 and Progress 5 are independent headcounts — the per-letter cap is
   exactly what lets somebody who opened both in a day count in both. */
check('each per-letter route is its own headcount',
  /OpenedInsights7/.test(text('pgEventNote').replace(/\s+/g, ''))
  && /OpenedProgress5/.test(text('pgEventNote').replace(/\s+/g, '')), text('pgEventNote'));

check('a stand test and an episode are told apart',
  /Standtest2/.test(text('pgEventNote').replace(/\s+/g, ''))
  && /POTSepisode3/.test(text('pgEventNote').replace(/\s+/g, '')), text('pgEventNote'));

check('the lines are never presented as addable',
  /each number is a headcount for that one thing and the lines must not be added together/
    .test(text('pgEventNote')), text('pgEventNote'));

/* The error counter is a population, not a daily event, and says nothing about
   what went wrong — there is no tag in the ping and the card must not imply
   one. That is the whole reason the Failures view exists beside it, and the
   copy has to point there rather than leaving the reader at a dead end. */
check('the failure counter reports installs, once per install ever',
  /Installsreportingafirstfailure3/.test(text('pgEventNote').replace(/\s+/g, '')), text('pgEventNote'));

check('the failure counter still promises no diagnosis of its own',
  /can never say what broke/.test(text('pgEventNote')), text('pgEventNote'));

check('...and sends the reader to the route that can',
  /What broke is the Failures tab/.test(text('pgEventNote')), text('pgEventNote'));

/* --------------------------------------------------------- the raw ping tab */

window.document.querySelector('.tab[data-view="pings"]').click();
await new Promise((r) => setTimeout(r, 300));

check('the raw tab counts paywall pings', /Paywall pings/.test(text('pgRawTiles')), text('pgRawTiles'));
check('the raw table has a tier column', /Tier/.test(text('pgRawTable')));
check('a paywall row prints its surface rather than a dash',
  /Progress range/.test(text('pgRawTable')), text('pgRawTable').slice(0, 300));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
if (errors.length) console.log('\nPage errors:\n' + errors.slice(0, 5).join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
