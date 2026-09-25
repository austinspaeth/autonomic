/* The live alerts, on screen. Runs against the BUILT page, because the module
   only exists once the route has inlined it in order with the rest.

   alerts.test.mjs already pins the arithmetic. This file's job is the other
   half: that a new download and a new sale each put a card in the corner naming
   the store, that the first report of a session says nothing, that the bell
   turns the sound off and remembers, and that a page nobody is looking at does
   not refresh itself. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) {
  console.error(`No built page at ${PAGE} — run \`npm run build\` first.`);
  process.exit(1);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [
  b64u({ alg: 'RS256' }),
  b64u({ email: 'austinspaeth@msn.com', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'sig',
].join('.');

const pad = (n) => (n < 10 ? '0' + n : '' + n);
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const T = (back) => { const d = new Date(); d.setDate(d.getDate() - back); return iso(d); };

const row = (day, cohorts) => ({
  day, total: cohorts.reduce((a, c) => a + c[2], 0),
  cohorts: cohorts.map(([cohort, platform, count]) => ({ cohort, platform, count })),
});

/* Two consecutive reports of the counter. The second adds one fresh Android
   install, one returning open and one iOS purchase. */
const R1 = {
  open: [row(T(1), [[T(1), 'I', 3]]), row(T(0), [[T(0), 'I', 1], [T(1), 'I', 2]])],
  sub: [],
};
const R2 = {
  open: [row(T(1), [[T(1), 'I', 3]]), row(T(0), [[T(0), 'I', 1], [T(0), 'A', 1], [T(1), 'I', 3]])],
  sub: [row(T(0), [[T(1), 'I', 1]])],
};

const dom = new JSDOM(fs.readFileSync(PAGE, 'utf8'), {
  url: 'https://autonomic.care/master/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;

window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (obj) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(obj)) });
  if (target === 'InitiateAuth') {
    return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  }
  if (target === 'RespondToAuthChallenge') {
    return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  }
  if (body.action === 'LOAD') return reply({ entries: [], settings: {}, ui: null });
  if (body.action === 'PINGS') return reply(R1);
  return reply({ ok: true });
};

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.error || e.message)));

await new Promise((r) => window.addEventListener('load', r));
await new Promise((r) => setTimeout(r, 200));

const $ = (id) => window.document.getElementById(id);

// sign in
$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await new Promise((r) => setTimeout(r, 60));
[...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));
check('signed in', !window.document.body.classList.contains('gated'));

const AL = window.Alerts;
const cards = () => [...$('alertStack').querySelectorAll('.alert-card')];
const text = () => cards().map((c) => c.textContent.replace(/\s+/g, ' ')).join(' || ');
/* One kind of card, as text. A card is a header plus one sub-card per install
   now, so the useful assertion is "this card says X" rather than "something in
   the stack says X". */
const cardText = (kind) => cards().filter((c) => c.classList.contains(kind))
  .map((c) => c.textContent.replace(/\s+/g, ' ')).join(' || ');
const drawerCards = () => [...$('alertDrawerBody').querySelectorAll('.alert-card')];
const drawerText = () => $('alertDrawerBody').textContent.replace(/\s+/g, ' ');

check('the module is inlined and running', !!AL && typeof AL.sync === 'function');
check('the confetti surface and the card stack both exist', !!$('confetti') && !!$('alertStack'));

/* The App usage view fetches the counter on arrival, which is the report that
   seeds the baseline. Nothing may be announced for it. */
window.document.querySelector('.tab[data-view="ping"]').click();
await new Promise((r) => setTimeout(r, 200));
check('the first report of a session announces nothing', cards().length === 0, text());

AL.sync(R2);
await new Promise((r) => setTimeout(r, 30));
check('a new first run raises a download card', /1 new download/.test(text()), text());
/* The store is a CHIP on the install's own row now, not a clause in a shared
   line: two downloads from two stores are two rows rather than "1 on iOS · 1
   on Android", which is the same number and none of the news. */
check('and the card names the store it came from', /Android/.test(cardText('download')), cardText('download'));
check('a subscribe ping raises a sale card of its own', /1 new sale/.test(text()), text());
check('and that card names the store that paid', /iOS/.test(cardText('sale')), cardText('sale'));
/* A row is ONE line, so the install reads as "Sep 14 · day 1" rather than a
   spelled-out sentence — "day N" because a bare date on a reading row would
   read as the date of the reading. The full phrase is the row's hover title. */
check('and how old the install that paid is',
  /· day 1(?!\d)/.test(cardText('sale')), cardText('sale'));
check('with the spelled-out version on hover',
  /Installed .+, yesterday/.test(
    cards().find((c) => c.classList.contains('sale')).querySelector('.alert-row').getAttribute('title') || ''),
  cards().find((c) => c.classList.contains('sale')).querySelector('.alert-row').getAttribute('title'));
/* These fixtures predate the tier and version tokens, which is the case worth
   pinning: unknown is drawn as unknown and never folded into Free or into a
   version number. */
check('a ping with no tier or version says so rather than guessing',
  /Tier unknown/.test(cardText('sale')) && /build unknown/.test(cardText('sale')), cardText('sale'));
check('the sale toast says the install age too', /installed .+, yesterday/.test($('toast').textContent), $('toast').textContent);
check('the two are told apart by class, not only by copy',
  cards().some((c) => c.classList.contains('sale')) && cards().some((c) => c.classList.contains('download')),
  cards().map((c) => c.className).join(' | '));

/* R2 also carries one open from an older cohort, which is somebody coming back.
   It gets a card like the other two, because it is the event that fires most
   often and a toast it usually loses is not a record of anything. */
check('a returning open raises a card too', /1 returning visitor/.test(text()), text());
check('and that card names the store it came back on', /iOS/.test(cardText('visit')), cardText('visit'));
check('it is told apart by class as well',
  cards().some((c) => c.classList.contains('visit')), cards().map((c) => c.className).join(' | '));

/* Cards do not expire. The whole point of the stack is to still be there when
   you come back to the laptop, so the only thing that removes one is a press. */
await new Promise((r) => setTimeout(r, 1200));
check('cards do not clear themselves', cards().length === 3, text());

cards()[0].click();
await new Promise((r) => setTimeout(r, 400));
check('a card can be dismissed', cards().length === 2, text());

// The same report again is not news.
AL.sync(R2);
await new Promise((r) => setTimeout(r, 30));
check('an unchanged report raises nothing', cards().length === 2, text());

/* "Clear all" appears once there is more than one thing to clear, and empties
   the stack in one press. */
check('two cards bring out clear-all', !$('alertClear').classList.contains('hidden'));
$('alertClear').click();
await new Promise((r) => setTimeout(r, 400));
AL.announce({ visitors: 0, downloads: 1, sales: 0, downloadsBy: { A: 1 }, salesBy: {} });
await new Promise((r) => setTimeout(r, 30));
check('a lone card keeps clear-all away', $('alertClear').classList.contains('hidden'));
AL.announce({ visitors: 0, downloads: 1, sales: 0, downloadsBy: { A: 1 }, salesBy: {} });
await new Promise((r) => setTimeout(r, 30));
check('a second card brings it out', !$('alertClear').classList.contains('hidden'));
$('alertClear').click();
await new Promise((r) => setTimeout(r, 400));
check('clear-all empties the stack', cards().length === 0, text());
check('and takes itself away with the cards', $('alertClear').classList.contains('hidden'));

/* The Alerts button is NOT a mute. It opens the HISTORY: a drawer from the
   right holding every alert this browser has been told about, under a heading
   per day. Deliberately not the corner stack, which is where live news arrives
   and is dismissed — a record you are reading does not belong in the slot that
   news you have not read yet arrives in. */
check('sound is on by default', AL.isMuted() === false && $('btnAlerts').dataset.muted === 'false');
check('the drawer starts closed', $('alertDrawer').classList.contains('hidden'));
$('btnAlerts').click();
check('pressing Alerts does not silence the dashboard', AL.isMuted() === false);
await new Promise((r) => setTimeout(r, 40));
check('it opens the history drawer instead',
  $('alertDrawer').classList.contains('open') && !$('alertDrawer').classList.contains('hidden'),
  $('alertDrawer').className);
check('which holds every alert raised, including ones already dismissed',
  /1 new download/.test(drawerText()) && /1 new sale/.test(drawerText()), drawerText());
check('grouped under a heading naming the day they happened',
  /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test($('alertDrawerBody').querySelector('.drawer-date').textContent.trim()),
  $('alertDrawerBody').querySelector('.drawer-date').textContent);
check('and every entry in it is stamped with the time it happened',
  drawerCards().length > 0 && drawerCards().every((c) => /\d:\d\d/.test(c.textContent)), drawerText());
/* History is read, not dismissed: the × that clears a card in the corner has
   no meaning on a record of something that already happened. */
check('a card in the history carries no dismiss button',
  drawerCards().every((c) => !c.querySelector('.alert-x')), drawerText());
check('opening the history leaves the live stack alone',
  $('alertStack').querySelectorAll('.alert-card').length === 0, text());
const inDrawer = drawerCards().length;
$('btnAlerts').click();
await new Promise((r) => setTimeout(r, 340));
check('pressing it again closes the drawer rather than stacking a second one',
  !$('alertDrawer').classList.contains('open'), $('alertDrawer').className);
$('btnAlerts').click();
await new Promise((r) => setTimeout(r, 40));
check('and reopening shows the same day once, not twice',
  drawerCards().length === inDrawer, String(drawerCards().length) + ' vs ' + inDrawer);
$('alertDrawerClose').click();
await new Promise((r) => setTimeout(r, 340));
check('the close button closes it', !$('alertDrawer').classList.contains('open'));
check('and it is hidden once it has finished leaving', $('alertDrawer').classList.contains('hidden'));

/* The header and the tab row travel together and stay put on the way down the
   page, so changing tab from three screens into a chart does not mean
   scrolling back up to reach the nav. */
check('the header and the tabs are one sticky bar',
  !!$('appHead') && $('appHead').contains($('btnAlerts')) &&
  !!$('appHead').querySelector('.tabs'),
  $('appHead') ? $('appHead').className : 'no appHead');

/* Muted means silent, not blind: the cards are the record of what happened and
   they keep coming. */
AL.setMuted(true);
const before = cards().length;
AL.announce({ visitors: 0, downloads: 2, sales: 0, downloadsBy: { I: 2 }, salesBy: {} });
await new Promise((r) => setTimeout(r, 30));
check('a muted dashboard still shows the card', cards().length === before + 1, text());
check('and the copy pluralises what it counts', /2 new downloads/.test(text()), text());
AL.setMuted(false);

/* -------------------------------------------------------- activations */

/* CONFETTI IS FOR ARRIVALS, NEVER FOR USAGE. jsdom has no canvas, so the
   celebration is a silent no-op here either way — hand the surface a fake 2D
   context and the code runs far enough to resize the canvas, which is the
   observable difference between "it fired" and "it was skipped". */
const canvasEl = $('confetti');
const noop = () => {};
canvasEl.getContext = () => ({
  setTransform: noop, clearRect: noop, save: noop, restore: noop,
  translate: noop, rotate: noop, fillRect: noop,
  globalAlpha: 1, fillStyle: '',
});
canvasEl.width = 0;
AL.setMuted(true);   // the sound is not what is under test here

/* A first reading no longer has a card of its own. `act` fires once per
   install ever and `hrv` once per install per Eastern day, both the moment a
   reading completes, so a first reading raised BOTH — two cards and two
   notifications for one measurement. It is the reading card with a FIRST tag
   on the rows that were one. */
const firstRow = (cohort, platform, tier, slot, n, age) =>
  ({ cohort, platform, tier, slot, n, age, day: T(0), version: '1.26.0' });
AL.announce({
  visitors: 0, downloads: 0, sales: 0, activations: 3, readings: 3,
  downloadsBy: {}, salesBy: {}, activationsBy: { B: 2, F: 1 }, readingsBy: { B: 2, F: 1 },
  rows: {
    downloads: [], returns: [], sales: [],
    activations: [firstRow('2026-08-01', 'I', 'P', 'B', 2, 3), firstRow('2026-08-05', 'A', 'F', 'F', 1, 1)],
    readings: [firstRow('2026-08-01', 'I', 'P', 'B', 2, 3), firstRow('2026-08-05', 'A', 'F', 'F', 1, 1)],
  },
});
await new Promise((r) => setTimeout(r, 30));
check('a refresh whose readings are all firsts raises ONE card, not two',
  cards().filter((c) => c.classList.contains('reading')).length === 1 &&
  !cards().some((c) => c.classList.contains('activation')),
  cards().map((c) => c.className).join(' | '));
check('and it says so in the headline', /3 first readings!/.test(cardText('reading')), cardText('reading'));
check('the rows that were a first are tagged',
  (cardText('reading').match(/First/g) || []).length === 2, cardText('reading'));
check('and each row still names its store, tier and build',
  /iOS/.test(cardText('reading')) && /Pro/.test(cardText('reading')) &&
  /Android/.test(cardText('reading')) && /Free/.test(cardText('reading')) &&
  /1\.26\.0/.test(cardText('reading')),
  cardText('reading'));
check('and it never sets off the confetti', canvasEl.width === 0, String(canvasEl.width));

/* A mixed refresh: two readings from one install group, one of them a first.
   The group splits, because with `hrv` capped daily those are two installs. */
$('alertClear').click();
await new Promise((r) => setTimeout(r, 400));
AL.announce({
  visitors: 0, downloads: 0, sales: 0, activations: 1, readings: 2,
  downloadsBy: {}, salesBy: {}, activationsBy: { B: 1 }, readingsBy: { B: 2 },
  rows: {
    downloads: [], returns: [], sales: [],
    activations: [firstRow('2026-08-01', 'I', 'P', 'B', 1, 3)],
    readings: [firstRow('2026-08-01', 'I', 'P', 'B', 2, 3)],
  },
});
await new Promise((r) => setTimeout(r, 30));
check('a partly-first refresh counts them all and tags only the first',
  /2 readings today, 1 a first/.test(cardText('reading')) &&
  (cardText('reading').match(/First/g) || []).length === 1,
  cardText('reading'));

/* A restore and a lapse are TOLD, never celebrated: a card each, and nothing
   else a sale gets — no canvas, no notification. They are exactly the events
   the old `sub` route used to celebrate as sales by mistake. */
$('alertClear').click();
await new Promise((r) => setTimeout(r, 400));
const pushed = [];
const realNotify = window.Pwa && window.Pwa.notify;
if (window.Pwa) window.Pwa.notify = (o) => { pushed.push(o); };
const planRow = (cohort, platform, plan, n, age) =>
  ({ cohort, platform, tier: 'P', slot: '?', plan, n, age, day: T(0), version: '1.30.0' });
AL.announce({
  visitors: 0, downloads: 0, sales: 0, activations: 0, readings: 0, restores: 1, lapses: 1,
  downloadsBy: {}, salesBy: {}, activationsBy: {}, readingsBy: {},
  restoresBy: { I: 1 }, lapsesBy: { A: 1 },
  rows: {
    downloads: [], returns: [], sales: [], activations: [], readings: [],
    restores: [planRow('2026-08-01', 'I', 'Y', 1, 40)],
    lapses: [planRow('2026-07-01', 'A', 'M', 1, 70)],
  },
});
await new Promise((r) => setTimeout(r, 30));
check('a restore raises its own quiet card, naming store and plan',
  /returning subscriber on a new install/.test(cardText('restore')) &&
    /iOS/.test(cardText('restore')) && /Yearly/.test(cardText('restore')),
  cardText('restore'));
check('a lapse raises its own quiet card, naming the plan',
  /1 subscription lapsed/.test(cardText('lapse')) && /Monthly/.test(cardText('lapse')),
  cardText('lapse'));
check('neither is a sale card', !cards().some((c) => c.classList.contains('sale')), text());
check('neither sets off the confetti', canvasEl.width === 0, String(canvasEl.width));
check('neither sends a notification', pushed.length === 0, JSON.stringify(pushed));

/* And a sale row now wears its plan, so a ping can be matched to a store
   order; a legacy letterless one says it cannot. */
AL.announce({
  visitors: 0, downloads: 0, sales: 2, activations: 0, readings: 0,
  downloadsBy: {}, salesBy: { I: 2 }, activationsBy: {}, readingsBy: {},
  rows: {
    downloads: [], returns: [], activations: [], readings: [],
    sales: [planRow('2026-08-20', 'I', 'P', 1, 5), planRow('2026-08-21', 'I', '?', 1, 4)],
  },
});
await new Promise((r) => setTimeout(r, 30));
check('a sale row names its plan, and a legacy one admits it has none',
  /Promo year/.test(cardText('sale')) && /Plan unknown/.test(cardText('sale')),
  cardText('sale'));
if (window.Pwa) window.Pwa.notify = realNotify;
$('alertClear').click();
await new Promise((r) => setTimeout(r, 400));
canvasEl.width = 0;

/* The same fake surface, so the negative above is a real one: an arrival still
   celebrates on exactly this page. */
AL.announce({
  visitors: 0, downloads: 1, sales: 0, activations: 0,
  downloadsBy: { I: 1 }, salesBy: {}, activationsBy: {},
});
await new Promise((r) => setTimeout(r, 30));
check('a new install still does', canvasEl.width > 0, String(canvasEl.width));

/* A returning visit gets BOTH a card and a toast, and the line on each names
   the store and how old the installs are — the same two facts a download card
   carries, because a bare count has nobody behind it. */
const cardsBeforeVisit = cards().length;
AL.announce({
  visitors: 3, downloads: 0, returns: 3, sales: 0, activations: 0, readings: 0,
  downloadsBy: {}, returnsBy: { I: 2, A: 1 }, salesBy: {}, activationsBy: {}, readingsBy: {},
  who: { returns: { '2026-08-01': { n: 3, age: 12, day: '2026-08-13' } } },
});
await new Promise((r) => setTimeout(r, 30));
check('a returning visit toasts the store and how old the installs are',
  $('toast').textContent === '3 returning visitors · 2 on iOS · 1 on Android · installed Aug 1, 12 days ago',
  $('toast').textContent);
check('and raises a card saying the same thing', cards().length === cardsBeforeVisit + 1 &&
  /3 returning visitors×2 on iOS · 1 on Android · installed Aug 1, 12 days ago/.test(text()), text());

/* And it OUTRANKS a reading for the one toast slot, which is the reordering
   that makes it visible at all: a refresh carrying a single morning reading
   used to swallow every return in it. The reading still gets its card. */
AL.announce({
  visitors: 2, downloads: 0, returns: 2, sales: 0, activations: 0, readings: 2,
  downloadsBy: {}, returnsBy: { I: 2 }, salesBy: {}, activationsBy: {}, readingsBy: { W: 2 },
  who: {
    returns: { '2026-08-02': { n: 2, age: 11, day: '2026-08-13' } },
    readings: { '2026-08-10': { n: 2, age: 3, day: '2026-08-13' } },
  },
});
await new Promise((r) => setTimeout(r, 30));
check('a return takes the toast from a reading in the same refresh',
  $('toast').textContent === '2 returning visitors · 2 on iOS · installed Aug 2, 11 days ago',
  $('toast').textContent);
check('and the reading still keeps its card',
  /2 readings today×2 Apple Watch · installed Aug 10, 3 days ago/.test(text()), text());

AL.announce({
  visitors: 0, downloads: 0, returns: 0, sales: 0, activations: 0, readings: 2,
  downloadsBy: {}, returnsBy: {}, salesBy: {}, activationsBy: {}, readingsBy: { W: 2 },
  who: { readings: { '2026-08-10': { n: 2, age: 3, day: '2026-08-13' } } },
});
await new Promise((r) => setTimeout(r, 30));
check('a reading card and toast carry the install age',
  /2 Apple Watch · installed Aug 10, 3 days ago/.test(text()) &&
  $('toast').textContent === '2 readings today · 2 Apple Watch · installed Aug 10, 3 days ago',
  text() + ' | toast: ' + $('toast').textContent);
AL.setMuted(false);

/* ---------------------------------------------- a busy morning fits

   The corner stack is a bounded corner of the screen, so a card there caps its
   rows. The history drawer is a scroller whose whole job is to be read, so it
   draws every one — "+34 more" in a panel with room to scroll was throwing
   away the answer it was opened to give. */
$('alertClear').click();
await new Promise((r) => setTimeout(r, 400));
const many = [];
for (let i = 0; i < 14; i += 1) {
  many.push({ cohort: '2026-08-' + (i < 9 ? '0' : '') + (i + 1), platform: i % 2 ? 'A' : 'I',
              tier: 'F', slot: '?', n: i + 1, age: 40 - i, day: T(0), version: '1.26.0' });
}
AL.announce({
  visitors: 105, downloads: 0, returns: 105, sales: 0, activations: 0, readings: 0,
  downloadsBy: {}, returnsBy: { I: 60, A: 45 }, salesBy: {}, activationsBy: {}, readingsBy: {},
  rows: { downloads: [], sales: [], activations: [], readings: [], returns: many },
  notes: {},
});
await new Promise((r) => setTimeout(r, 30));
const stackRows = cards().find((c) => c.classList.contains('visit')).querySelectorAll('.alert-row');
check('a card in the corner caps its rows and counts the rest',
  stackRows.length === 8 && /\+\d+ more/.test(cardText('visit')),
  String(stackRows.length) + ' | ' + cardText('visit'));
$('btnAlerts').click();
await new Promise((r) => setTimeout(r, 60));
const histRows = drawerCards()[0].querySelectorAll('.alert-row');
check('the same card in the history draws every row instead',
  histRows.length === 14 && !/\+\d+ more/.test(drawerCards()[0].textContent),
  String(histRows.length));
$('alertDrawerClose').click();
await new Promise((r) => setTimeout(r, 340));

check('no page errors', errors.length === 0, errors.join(' | '));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
