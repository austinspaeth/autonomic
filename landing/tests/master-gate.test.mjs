/* End-to-end smoke test of the /master client: sign-in challenge, token
   persistence, boot pull, hydrate, and the first sync push.

   It runs against the BUILT page (build/master/index.html), not the sources in
   landing/master/, because half of what can break now lives in the route that
   assembles them: the stylesheet and the seven scripts are inlined by
   src/routes/master/+page.svelte, and only the built document proves they
   landed, in order, with nothing left to fetch. `npm run test:master` builds
   first. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) {
  console.error(`No built page at ${PAGE} — run \`npm run build\` first (or \`npm run test:master\`).`);
  process.exit(1);
}

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [
  b64u({ alg: 'RS256' }),
  b64u({ email: 'austinspaeth@msn.com', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'sig',
].join('.');

const calls = [];
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); };

/* The real origin, not localhost: the site shell short-circuits analytics and
   the cookie banner on localhost anyway, and the point of the two checks below
   is the /master path rule that has to hold in production. No `resources`
   loader is configured, so anything the page still tried to fetch would simply
   not arrive — which is the assertion. */
const dom = new JSDOM(fs.readFileSync(PAGE, 'utf8'), {
  url: 'https://autonomic.care/master/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;

// Stub the network. Cognito issues a challenge then accepts "1234"; the API
// returns one stored entry so we can prove hydrate lands before render.
window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  calls.push({ url, target, action: body.action, body });
  const reply = (obj, status = 200) => Promise.resolve({
    ok: status < 400, status, text: () => Promise.resolve(JSON.stringify(obj)),
  });

  if (target === 'InitiateAuth') {
    return reply({ Session: 'sess-1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  }
  if (target === 'RespondToAuthChallenge') {
    if (body.ChallengeResponses.ANSWER !== '1234') return reply({ Session: 'sess-2' });
    return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  }
  if (body.action === 'LOAD') {
    return reply({
      entries: [{ date: '2026-08-01', platform: 'ios', downloads: 100 }],
      settings: { trialDays: 7, wallDays: 14, currency: '$' },
      ui: null,
    });
  }
  return reply({ ok: true });
};

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.error || e.message)));

await new Promise((r) => window.addEventListener('load', r));
await new Promise((r) => setTimeout(r, 300));

const $ = (id) => window.document.getElementById(id);

// --- the shipped document ---------------------------------------------------
// The bug this route replaced: relative asset URLs. A request for /master
// without the trailing slash resolved every one of them against /, so the page
// arrived with no stylesheet and no scripts — unstyled, gate inert, dashboard
// on display. Nothing the page references may be relative.
const html = fs.readFileSync(PAGE, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const relative = [...html.matchAll(/(?:src|href)="(?!https?:|\/\/|\/|#|data:|mailto:)([^"]*)"/g)].map((m) => m[1]);
check('no relative asset references', relative.length === 0, relative.join(', '));
check('stylesheet is inlined', html.includes('Autonomic Dashboard — dark theme tokens'));
check('every dashboard script is inlined and ran',
  ['AUTONOMIC_CONFIG', 'Auth', 'Api', 'Sync', 'Chart', 'Dashboard'].every((g) => window[g]),
  ['AUTONOMIC_CONFIG', 'Auth', 'Api', 'Sync', 'Chart', 'Dashboard'].filter((g) => !window[g]).join(', '));

// The dashboard is a private page on a public site's shell; neither of the
// shell's visitor-facing behaviours belongs on it.
check('the site shell loads no analytics here',
  !window.document.querySelector('script[src*="googletagmanager"]'));
check('the site shell shows no cookie banner here', $('aj-cookie-banner').hidden);

// --- the gate ---------------------------------------------------------------
check('gate is visible on arrival', !$('gate').classList.contains('hidden'));
check('body is gated (dashboard hidden)', window.document.body.classList.contains('gated'));
check('email step shown, code step hidden',
  !$('gateEmailStep').classList.contains('hidden') && $('gateCodeStep').classList.contains('hidden'));

// --- enter email -----------------------------------------------------------
$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await new Promise((r) => setTimeout(r, 200));

check('InitiateAuth used CUSTOM_AUTH flow',
  calls.some((c) => c.target === 'InitiateAuth' && c.body.AuthFlow === 'CUSTOM_AUTH'));
check('advanced to the code step', !$('gateCodeStep').classList.contains('hidden'));
check('code step names the address', $('gateSentTo').textContent === 'austinspaeth@msn.com');

// --- wrong code ------------------------------------------------------------
const digits = [...$('gateCodeRow').querySelectorAll('input')];
'9999'.split('').forEach((d, i) => {
  digits[i].value = d;
  digits[i].dispatchEvent(new window.Event('input', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));
check('wrong code surfaces an error', $('gateError').classList.contains('on'), $('gateError').textContent);
check('wrong code clears the boxes', digits.every((d) => d.value === ''));
check('wrong code carries the new session forward',
  calls.filter((c) => c.target === 'RespondToAuthChallenge').at(-1).body.Session === 'sess-1');

// --- right code ------------------------------------------------------------
'1234'.split('').forEach((d, i) => {
  digits[i].value = d;
  digits[i].dispatchEvent(new window.Event('input', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 400));

check('retry used the refreshed session',
  calls.filter((c) => c.target === 'RespondToAuthChallenge').at(-1).body.Session === 'sess-2');
check('gate dismissed after sign-in', $('gate').classList.contains('hidden'));
check('body no longer gated', !window.document.body.classList.contains('gated'));
check('tokens persisted', !!window.localStorage.getItem('autonomic.master.auth'));
check('signed-in address shown in header', $('whoami').textContent === 'austinspaeth@msn.com');
check('API called with a bearer token',
  calls.some((c) => c.action === 'LOAD'));
check('LOAD ran before any SYNC',
  calls.findIndex((c) => c.action === 'LOAD') < (calls.findIndex((c) => c.action === 'SYNC') + 1 || Infinity));

const store = window.Dashboard.store();
check('server entry hydrated into the store',
  store.db.entries.length === 1 && store.db.entries[0].downloads === 100,
  JSON.stringify(store.db.entries));
check('cache written from server data',
  JSON.parse(window.localStorage.getItem('autonomic.dashboard.v1')).entries.length === 1);
check('sync status reads Saved', $('syncStatus').textContent === 'Saved');

// --- a local edit pushes a diff, not the whole store ------------------------
const before = calls.length;
store.db.entries.push({ date: '2026-08-02', platform: 'android', downloads: 7 });
window.Sync.schedule();
await new Promise((r) => setTimeout(r, 1400));
const push = calls.slice(before).find((c) => c.action === 'SYNC');
check('edit produced a SYNC push', !!push);
check('push carried only the changed day',
  push && push.body.payload.upserts.length === 1 && push.body.payload.upserts[0].date === '2026-08-02',
  push && JSON.stringify(push.body.payload));
check('push sent no spurious deletes', push && !push.body.payload.deletes);

// --- deleting locally pushes a delete ---------------------------------------
const before2 = calls.length;
store.db.entries.splice(0, 1);
window.Sync.schedule();
await new Promise((r) => setTimeout(r, 1400));
const push2 = calls.slice(before2).find((c) => c.action === 'SYNC');
check('removal produced a delete', push2 && push2.body.payload.deletes
  && push2.body.payload.deletes[0].date === '2026-08-01',
  push2 && JSON.stringify(push2.body.payload));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
if (errors.length) console.log('\nPage errors:\n' + errors.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
