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
check('and the card names the store it came from', /1 on Android/.test(text()), text());
check('a subscribe ping raises a sale card of its own', /1 new sale/.test(text()), text());
check('and that card names the store that paid', /1 on iOS/.test(text()), text());
check('the two are told apart by class, not only by copy',
  cards().some((c) => c.classList.contains('sale')) && cards().some((c) => c.classList.contains('download')),
  cards().map((c) => c.className).join(' | '));

/* Cards do not expire. The whole point of the stack is to still be there when
   you come back to the laptop, so the only thing that removes one is a press. */
await new Promise((r) => setTimeout(r, 1200));
check('cards do not clear themselves', cards().length === 2, text());

cards()[0].click();
await new Promise((r) => setTimeout(r, 400));
check('a card can be dismissed', cards().length === 1, text());

// The same report again is not news.
AL.sync(R2);
await new Promise((r) => setTimeout(r, 30));
check('an unchanged report raises nothing', cards().length === 1, text());

/* "Clear all" appears once there is more than one thing to clear, and empties
   the stack in one press. */
check('one card needs no clear-all', $('alertClear').classList.contains('hidden'));
AL.announce({ visitors: 0, downloads: 1, sales: 0, downloadsBy: { A: 1 }, salesBy: {} });
await new Promise((r) => setTimeout(r, 30));
check('a second card brings out clear-all', !$('alertClear').classList.contains('hidden'));
$('alertClear').click();
await new Promise((r) => setTimeout(r, 400));
check('clear-all empties the stack', cards().length === 0, text());
check('and takes itself away with the cards', $('alertClear').classList.contains('hidden'));

/* The Alerts button is NOT a mute. Cards are dismissed by pressing them, so
   pressing Alerts is how the day comes back: every card raised today, re-raised
   in order, however many of them have since been cleared. */
check('sound is on by default', AL.isMuted() === false && $('btnAlerts').dataset.muted === 'false');
$('btnAlerts').click();
check('pressing Alerts does not silence the dashboard', AL.isMuted() === false);
await new Promise((r) => setTimeout(r, 40));
check('it replays the day instead — including cards already dismissed',
  /1 new download/.test(text()) && /1 new sale/.test(text()), text());
check('and a replayed card is stamped with the time it happened',
  cards().length > 0 && cards().every((c) => /\d:\d\d/.test(c.textContent)), text());
const replayed = cards().length;
$('btnAlerts').click();
await new Promise((r) => setTimeout(r, 40));
check('pressing it twice does not show the day twice', cards().length === replayed, text());
$('alertClear').click();
await new Promise((r) => setTimeout(r, 400));

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

AL.announce({
  visitors: 0, downloads: 0, sales: 0, activations: 3,
  downloadsBy: {}, salesBy: {}, activationsBy: { B: 2, F: 1 },
});
await new Promise((r) => setTimeout(r, 30));
check('an activation raises a card of its own', /3 first readings/.test(text()), text());
check('and the card names the sensors those readings used',
  /2 chest strap/.test(text()) && /1 phone camera/.test(text()), text());
check('it is told apart from the other two by class',
  cards().some((c) => c.classList.contains('activation')),
  cards().map((c) => c.className).join(' | '));
check('and it never sets off the confetti', canvasEl.width === 0, String(canvasEl.width));

/* The same fake surface, so the negative above is a real one: an arrival still
   celebrates on exactly this page. */
AL.announce({
  visitors: 0, downloads: 1, sales: 0, activations: 0,
  downloadsBy: { I: 1 }, salesBy: {}, activationsBy: {},
});
await new Promise((r) => setTimeout(r, 30));
check('a new install still does', canvasEl.width > 0, String(canvasEl.width));
AL.setMuted(false);

check('no page errors', errors.length === 0, errors.join(' | '));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
