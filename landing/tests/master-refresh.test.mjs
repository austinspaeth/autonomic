/* The refresh button's wheel, and how long a sale's confetti runs — both
   driven in the BUILT page.

   The wheel has one job: to be still only when everything it stands for has
   landed. On first arrival that is the server pull AND the ping counter `init`
   starts beside it, which answer at different times; on a press it is the
   push-pull-render chain plus the counter. When all of it is in, the arrows turn
   into a checkmark and back — there is no "Refreshed." toast — and a load that
   FAILED ends on the arrows with no check.

   The confetti: a sale's gold runs until its alert card is dismissed, not for a
   fixed twenty seconds, while a download still stops on its own clock. */
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
/* A 2D context that draws nothing, so the confetti has a surface to run on —
   jsdom hands back null without the canvas package, which skips it entirely. */
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });

/* PINGS answers only when the test says so, and can be told to fail. */
let pingGate = null;
let pingFail = false;
const pending = [];
window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (obj, status = 200) => Promise.resolve({
    ok: status < 400, status, text: () => Promise.resolve(JSON.stringify(obj)),
  });
  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (body.action === 'LOAD') {
    return reply({
      entries: [{ date: T(2), platform: 'ios', downloads: 5, impressions: 100, pageViews: 20, sales: 0 }],
      events: [], settings: { trialDays: 14, currency: '$' }, ui: { view: 'overview' },
    });
  }
  if (body.action === 'PINGS') {
    const answer = () => (pingFail ? reply({ error: 'boom' }, 500) : reply({ since: body.payload.since, open: [], sub: [] }));
    if (!pingGate) return answer();
    return new Promise((resolve) => pending.push(() => resolve(answer())));
  }
  return reply({ ok: true });
};
const releasePings = () => { pingGate = null; pending.splice(0).forEach((f) => f()); };

const errors = [];
window.addEventListener('error', (e) => errors.push(String((e.error && e.error.stack) || e.message)));

pingGate = true;             // hold the counter from the very first load
await new Promise((r) => window.addEventListener('load', r));
await new Promise((r) => setTimeout(r, 200));
const $ = (id) => window.document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const busy = () => $('btnRefresh').dataset.busy;

$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await wait(150);
[...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await wait(900);

/* ---------------------------------------------------- 1. first arrival */

check('the view is up once the pull has landed', !$('view-overview').classList.contains('hidden'));
check('but the wheel keeps turning while the ping counter is still out', busy() === 'true', busy());
releasePings();
await wait(250);
check('it turns into a checkmark once the counter lands too', busy() === 'done', busy());
check('with no "Refreshed." toast', !/Refreshed/.test($('toast').textContent), $('toast').textContent);
await wait(1300);
check('and back into the refresh icon', busy() === 'false', busy());

/* ---------------------------------------------------- 2. a press */

pingGate = true;
$('btnRefresh').click();
await wait(700);
check('a press spins until everything it refetches has landed', busy() === 'true', busy());
releasePings();
await wait(300);
check('then shows the check', busy() === 'done', busy());
await wait(1300);

/* ---------------------------------------------------- 3. a failed load */

pingFail = true;
$('btnRefresh').click();
await wait(900);
check('a refresh whose counter failed ends on the arrows, never the check', busy() === 'false', busy());
pingFail = false;

/* ---------------------------------------------------- 4. confetti */

const realNow = window.Date.now;
const jump = (ms) => { const at = realNow.call(window.Date) + ms; window.Date.now = () => at; };

window.Alerts.announce({ sales: 1 });
await wait(50);
check('a sale starts the gold', window.Alerts.emitting('sale'), 'not emitting');
jump(60 * 1000);             // well past the old twenty seconds
await wait(750);             // at least one wave interval
check('and keeps it going past its old twenty seconds while the card is up',
  window.Alerts.emitting('sale'), 'stopped with the card still up');
$('alertStack').querySelector('.alert-card.sale').click();
await wait(750);
check('dismissing the sale card stops it', !window.Alerts.emitting('sale'), 'still emitting');
window.Date.now = realNow;

window.Alerts.announce({ downloads: 1 });
await wait(50);
check('a download starts the silver', window.Alerts.emitting('download'), 'not emitting');
jump(11 * 1000);
await wait(500);
check('and a download still stops on its own clock, card or no card',
  !window.Alerts.emitting('download'), 'still emitting');
window.Date.now = realNow;

check('no page errors', errors.length === 0, errors.join('\n'));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? '  ok  ' : '  FAIL'}  ${r.name}${r.ok ? '' : `   <- ${r.detail}`}`);
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
