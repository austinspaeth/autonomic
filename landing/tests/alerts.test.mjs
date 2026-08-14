/* Unit tests for landing/master/alerts.js — the arithmetic behind the live
   alerts. No DOM, no audio: the module is loaded with a `window` shim, which
   also pins the rule that nothing in it may touch `document` at load time.

   What is being protected here is the honesty of a celebration. A fanfare for a
   sale that did not happen is worse than a missed one, so every case below is a
   way the counter can move WITHOUT anything having been bought, downloaded or
   opened. */
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../master/alerts.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const AL = sandbox.window.Alerts;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

/* A report is `{ open: [{ day, total, cohorts: [{cohort, platform, count}] }], sub: [...] }`.
   `row` keeps the fixtures below readable. */
const row = (day, cohorts) => ({
  day,
  total: cohorts.reduce((a, c) => a + c[2], 0),
  cohorts: cohorts.map(([cohort, platform, count]) => ({ cohort, platform, count }))
});

const D1 = '2026-08-12', D2 = '2026-08-13', D3 = '2026-08-14';

/* Day 1: 3 fresh iOS installs, 2 fresh Android, plus 4 returning from an older
   cohort. Day 2: 1 fresh iOS, 6 returning. One sale on day 2, from iOS. */
const BASE = {
  open: [
    row(D1, [[D1, 'I', 3], [D1, 'A', 2], ['2026-08-01', 'I', 4]]),
    row(D2, [[D2, 'I', 1], ['2026-08-01', 'I', 4], [D1, 'A', 2]])
  ],
  sub: [row(D2, [[D1, 'I', 1]])]
};

/* --------------------------------------------------------------- snapshot */

const s0 = AL.snapshot(BASE);

check('opens count every ping, fresh and returning alike',
  s0.opens === 16, String(s0.opens));
check('a download is a first run: cohort key === the day it arrived',
  s0.downloads === 6, String(s0.downloads));
check('first runs carry their own store, not the whole day\'s split',
  JSON.stringify(s0.downloadsBy) === JSON.stringify({ I: 4, A: 2 }),
  JSON.stringify(s0.downloadsBy));
check('a sale is a subscribe ping, and its store comes off the same key',
  s0.sales === 1 && s0.salesBy.I === 1, JSON.stringify(s0.salesBy));
check('an empty report is a zeroed snapshot, not a crash',
  AL.snapshot(null).opens === 0 && AL.snapshot({}).downloads === 0);

/* Returning traffic is the case most likely to be mistaken for an install:
   day 2 above carries 4 + 2 returning pings and exactly one new one. */
check('returning installs are never counted as downloads',
  s0.downloads === 6 && s0.opens - s0.downloads === 10, String(s0.opens - s0.downloads));

/* A build that predates the platform marker sends no letter. It is an install
   whose STORE we failed to record, not an install on a third platform. */
const noMarker = AL.snapshot({ open: [row(D3, [[D3, undefined, 2]])], sub: [] });
check('a ping with no platform reads as the unknown store, not as iOS',
  noMarker.downloadsBy.U === 2 && !noMarker.downloadsBy.I,
  JSON.stringify(noMarker.downloadsBy));
check('the unknown store is named in copy rather than folded into a real one',
  AL.storeLine({ I: 2, U: 1 }) === '2 on iOS · 1 on unknown store',
  AL.storeLine({ I: 2, U: 1 }));
check('the store line keeps a fixed order however the map was built',
  AL.storeLine({ A: 1, I: 3 }) === '3 on iOS · 1 on Android',
  AL.storeLine({ A: 1, I: 3 }));

/* ------------------------------------------------------------------- diff */

/* A quiet ten minutes: the same report comes back. */
check('an unchanged report is not news',
  AL.diff(s0, AL.snapshot(BASE)).any === false);

/* Two more opens on day 2, one of them a brand new Android install, and a
   second sale — this time from Android. */
const NEXT = {
  open: [
    BASE.open[0],
    row(D2, [[D2, 'I', 1], [D2, 'A', 1], ['2026-08-01', 'I', 5], [D1, 'A', 2]])
  ],
  sub: [row(D2, [[D1, 'I', 1], [D2, 'A', 1]])]
};
const d = AL.diff(s0, AL.snapshot(NEXT));
check('a rise in opens is reported as visitors', d.visitors === 2, String(d.visitors));
check('only the NEW first run counts as a download', d.downloads === 1, String(d.downloads));
check('the download names the store it came from',
  JSON.stringify(d.downloadsBy) === JSON.stringify({ A: 1 }), JSON.stringify(d.downloadsBy));
check('the sale names the store that paid, not the one that already had',
  d.sales === 1 && JSON.stringify(d.salesBy) === JSON.stringify({ A: 1 }),
  JSON.stringify(d.salesBy));

/* The report is a sliding 400-day window, so the oldest day leaves it as the
   calendar turns and every total can fall without anything having happened. */
const SHRUNK = { open: [BASE.open[1]], sub: [] };
const drop = AL.diff(s0, AL.snapshot(SHRUNK));
check('a falling total is never announced as a negative event',
  drop.any === false && drop.visitors === 0 && drop.sales === 0,
  JSON.stringify(drop));

/* A day that gains returning pings only. */
const RETURNS = {
  open: [BASE.open[0], row(D2, [[D2, 'I', 1], ['2026-08-01', 'I', 9], [D1, 'A', 2]])],
  sub: BASE.sub
};
const back = AL.diff(s0, AL.snapshot(RETURNS));
check('returning traffic pings as visitors and nothing else',
  back.visitors === 5 && back.downloads === 0 && back.sales === 0, JSON.stringify(back));

/* -------------------------------------------------------------- baseline */

/* `sync` is the shell's entry point, but its first-call rule is arithmetic:
   with no previous snapshot there is no delta, so a sign-in cannot open with a
   fanfare for a month of history. It reaches no DOM on that path. */
check('the first report of a session seeds the baseline instead of alerting',
  AL.sync(BASE) === null);
check('the second report is compared against the first',
  (() => { const r = AL.sync(NEXT); return !!r && r.sales === 1 && r.downloads === 1; })());
AL.reset();
check('reset drops the baseline, so the next report seeds again',
  AL.sync(NEXT) === null);

/* -------------------------------------------------------------- report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
