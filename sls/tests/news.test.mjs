/* The push job's arithmetic — what counts as news, and the four rules that
   stop a notification lying. Pure: no AWS, no clock, no network.

   `landing/tests/alerts.test.mjs` pins the browser's twin of this. The two
   answer the same question (what arrived since we last looked) for two
   different audiences, and the note at the top of `lambdas/push/news.js` says
   why they must not be allowed to disagree. */

import { snapshotDays, risen, headline, WINDOW_DAYS, shiftDay } from '../lambdas/push/news.js';

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* A report in the shape `/ping/report` returns. Cohort keys are ISO days, so
   "born on the day it arrived" is a string compare. */
const open = (day, cohorts) => ({ day, cohorts });
const c = (cohort, platform, count) => ({ cohort, platform, count });

const D0 = '2026-08-21';
const D1 = '2026-08-20';
const D2 = '2026-08-19';

/* ------------------------------------------------------------- snapshot */

const report = {
  open: [
    // 3 born today (2 iOS, 1 Android) and 40 coming back — only the 3 are installs
    open(D0, [c(D0, 'I', 2), c(D0, 'A', 1), c(D1, 'I', 25), c(D2, 'A', 15)]),
    open(D1, [c(D1, 'I', 4), c(D2, 'A', 9)]),
  ],
  sub: [
    open(D0, [c(D1, 'I', 1)]),
    open(D1, [c(D2, 'A', 2)]),
  ],
};

const snap = snapshotDays(report);

eq('a download is a first run, not an open', snap[D0].d, 3);
eq('and the returning crowd is not counted', snap[D0].d + snap[D1].d, 7);
eq('first runs carry their store', JSON.stringify(snap[D0].dBy), JSON.stringify({ I: 2, A: 1 }));

/* A sale is a subscribe ping, whatever cohort bought — the buyer installed
   some other day and that is the normal case, not the exception. */
eq('a sale is a subscribe ping of any cohort', snap[D0].s, 1);
eq('sales carry the store that paid', JSON.stringify(snap[D1].sBy), JSON.stringify({ A: 2 }));

check('a day with neither is simply absent', snap['2026-01-01'] === undefined);

/* ---------------------------------------------------------------- risen */

check('no watermark seeds in silence', (() => {
  const g = risen(null, snap, D0);
  return g.seeded === true && g.downloads === 0 && g.sales === 0;
})(), JSON.stringify(risen(null, snap, D0)));

/* The everyday case: one more install and one more sale land on the newest
   day, and nothing else moves. */
const later = JSON.parse(JSON.stringify(snap));
later[D0].d = 5; later[D0].dBy = { I: 3, A: 2 };
later[D0].s = 2; later[D0].sBy = { I: 2 };

const g1 = risen(snap, later, D0);
eq('a rise on the newest day is the news', g1.downloads, 2);
eq('and so is the sale', g1.sales, 1);
eq('the split is the rise, not the total', JSON.stringify(g1.downloadsBy), JSON.stringify({ I: 1, A: 1 }));
check('a seeded flag is off once there is a watermark', g1.seeded === false);

/* A count can FALL without anything going wrong — the report is a sliding
   window and the oldest day drops off it as the calendar turns. */
const fallen = JSON.parse(JSON.stringify(snap));
fallen[D1].d = 1;
eq('a fall is not an event', risen(snap, fallen, D0).downloads, 0);
check('and the fall does not eat a rise elsewhere', (() => {
  const mixed = JSON.parse(JSON.stringify(snap));
  mixed[D1].d = 1;          // down 3
  mixed[D0].d = 6;          // up 3
  return risen(snap, mixed, D0).downloads === 3;
})());

/* Compared day by day, a day the watermark never saw counts WHOLE — that is
   what "since you last looked" means for a job that missed an hour. */
check('a brand new day counts in full', (() => {
  const before = { [D1]: { d: 4, s: 0, dBy: { I: 4 }, sBy: {} } };
  const after = {
    [D1]: { d: 4, s: 0, dBy: { I: 4 }, sBy: {} },
    [D0]: { d: 3, s: 1, dBy: { A: 3 }, sBy: { I: 1 } },
  };
  const g = risen(before, after, D0);
  return g.downloads === 3 && g.sales === 1;
})());

/* A correction to an old row is a correction, not an arrival. */
check('a rise outside the window is ignored', (() => {
  const old = shiftDay(D0, -(WINDOW_DAYS + 3));
  const before = { [old]: { d: 1, s: 0, dBy: { I: 1 }, sBy: {} } };
  const after = { [old]: { d: 99, s: 5, dBy: { I: 99 }, sBy: { I: 5 } } };
  const g = risen(before, after, D0);
  return g.downloads === 0 && g.sales === 0;
})(), JSON.stringify(risen(
  { [shiftDay(D0, -(WINDOW_DAYS + 3))]: { d: 1, s: 0, dBy: {}, sBy: {} } },
  { [shiftDay(D0, -(WINDOW_DAYS + 3))]: { d: 99, s: 5, dBy: {}, sBy: {} } },
  D0,
)));

check('the oldest day still inside the window counts', (() => {
  const edge = shiftDay(D0, -(WINDOW_DAYS - 1));
  const g = risen(
    { [edge]: { d: 1, s: 0, dBy: { I: 1 }, sBy: {} } },
    { [edge]: { d: 4, s: 0, dBy: { I: 4 }, sBy: {} } },
    D0,
  );
  return g.downloads === 3;
})());

/* ------------------------------------------------------------- headline */

check('nothing to say says nothing', headline({ downloads: 0, sales: 0 }) === null);

const both = headline({ downloads: 3, sales: 2, downloadsBy: { I: 2, A: 1 }, salesBy: { I: 2 } });
check('a sale leads whenever there is one', /^\u{1F4B0} 2 sales/u.test(both.title), both.title);
check('installs follow it in the same line', /3 new installs/.test(both.title), both.title);
check('the body carries both splits', /Paid: 2 iOS/.test(both.body) && /Installed: 2 iOS, 1 Android/.test(both.body), both.body);

const one = headline({ downloads: 1, sales: 0, downloadsBy: { A: 1 } });
check('one install is singular', /1 new install\b/.test(one.title) && !/installs/.test(one.title), one.title);
check('and an install-only run does not wear the money emoji', !/\u{1F4B0}/u.test(one.title), one.title);

const solo = headline({ downloads: 0, sales: 1, salesBy: { U: 1 } });
check('a sale from a pre-marker build is disclosed, not folded into a store',
  /unknown store/.test(solo.body), solo.body);

check('every run shares one tag, so an hour replaces the last one',
  both.tag === one.tag && one.tag === 'autonomic-arrivals', both.tag);

/* ----------------------------------------------------------------- out */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `   <- ${r.detail}`}`);
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
