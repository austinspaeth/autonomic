/* Background alerts — the half of the notification story that reaches a closed
   phone.

   The mechanism is split across two places on purpose and neither can be
   tested from the other: the hour is kept by an EventBridge schedule
   (`sls/lambdas/push/`, whose arithmetic `sls/tests/news.test.mjs` pins) and
   this page only holds a subscription. So what is worth pinning HERE is the
   wiring and, more than the wiring, the honesty of the four states — because
   every one of them is a case where the button cannot work and the reader has
   to be told which one they are in.

     no push support        a desktop browser, or jsdom
     needs-install          iOS Safari in a tab: the API exists, the OS refuses
     server has no keys     deployed before the VAPID parameter was created
     on / off               the only two that are actually a choice

   Runs against the BUILT page, like every other master test. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) {
  console.error(`No built page at ${PAGE} — run \`npm run build\` first (or \`npm run test:master\`).`);
  process.exit(1);
}
const html = fs.readFileSync(PAGE, 'utf8');

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [
  b64u({ alg: 'RS256' }),
  b64u({ email: 'austinspaeth@msn.com', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'sig',
].join('.');

const SUBSCRIPTION = {
  endpoint: 'https://web.push.apple.com/QW5vdGhlcg',
  keys: { p256dh: 'BFakeP256dhKeyForTests', auth: 'ZmFrZS1hdXRo' },
};

/**
 * Boot the page with a chosen push environment.
 *
 * `push: null` leaves jsdom as it is — no `serviceWorker`, no `PushManager` —
 * which is the real "this browser cannot" case and needs no faking.
 */
function boot({ push = null, key = { configured: true, publicKey: 'BPublicKeyBase64Url' }, permission = 'granted' } = {}) {
  const calls = [];
  const dom = new JSDOM(html, {
    url: 'https://autonomic.care/master/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      /* Notification exists in every case worth testing — the interesting
         states are about PUSH, and a missing Notification API would short the
         whole card before the background half was reached. */
      window.Notification = function () {};
      window.Notification.permission = permission;
      window.Notification.requestPermission = () => Promise.resolve(permission);

      if (!push) return;

      const subscription = {
        ...SUBSCRIPTION,
        toJSON: () => SUBSCRIPTION,
        unsubscribe: () => Promise.resolve(true),
      };
      let held = push.alreadySubscribed ? subscription : null;

      const registration = {
        showNotification: () => Promise.resolve(),
        pushManager: {
          getSubscription: () => Promise.resolve(held),
          subscribe: (opts) => {
            calls.push({ action: 'browser-subscribe', opts });
            held = subscription;
            return Promise.resolve(subscription);
          },
        },
      };

      window.PushManager = function () {};
      window.navigator.serviceWorker = {
        register: () => Promise.resolve(registration),
        getRegistration: () => Promise.resolve(registration),
        addEventListener: () => {},
      };
    },
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
    calls.push({ action: body.action, payload: body.payload });
    if (body.action === 'LOAD') {
      return reply({ entries: [], events: [], sales: [], settings: { trialDays: 7, wallDays: 14, currency: '$' }, ui: null });
    }
    if (body.action === 'PINGS') return reply({ open: [], sub: [], act: [], hrv: [] });
    if (body.action === 'PUSH_KEY') return reply(key);
    if (body.action === 'PUSH_SUBSCRIBE') return reply({ ok: true, id: 'abc' });
    if (body.action === 'PUSH_TEST') return reply({ ok: true, sent: 1 });
    return reply({ ok: true });
  };

  const errors = [];
  window.addEventListener('error', (e) => errors.push(String((e.error && e.error.stack) || e.message)));
  return { window, calls, errors };
}

async function signIn(window) {
  const $ = (id) => window.document.getElementById(id);
  await new Promise((r) => window.addEventListener('load', r));
  await wait(120);
  $('gateEmail').value = 'austinspaeth@msn.com';
  $('gateSubmit').click();
  await wait(60);
  [...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
    el.value = '1234'[i];
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await wait(200);
}

/* ------------------------------------------------------------- the markup */

{
  const { window } = boot();
  await new Promise((r) => window.addEventListener('load', r));
  const $ = (id) => window.document.getElementById(id);

  check('the settings card has a background half', !!$('bgEnable') && !!$('bgStatus'));
  check('with its own heading, not merged into the in-page one',
    /Background alerts/.test(window.document.body.textContent));

  /* The two halves fail differently, and a reader who merges them believes a
     closed phone is covered when it is not. The copy has to draw the line. */
  const card = $('bgEnable').closest('details');
  check('the in-page half says "open" and the background half says "closed"',
    /while the dashboard is <b>open<\/b>/.test(card.innerHTML) &&
    /with the dashboard <b>closed<\/b>/.test(card.innerHTML));
  check('the hourly cadence is stated, and so is the one-banner-per-hour rule',
    /once an hour/.test(card.textContent) && /not six/.test(card.textContent), card.textContent.slice(0, 400));
  check('the iOS home-screen requirement is stated up front',
    /home screen/.test(card.textContent) && /16\.4/.test(card.textContent));
  /* Store CSV and the sales ledger are hand-typed; the job refuses to read
     them, and the card says so rather than leaving the reader to wonder why a
     CSV paste raised nothing. */
  check('and it says what it deliberately does not watch',
    /typed in by hand/.test(card.textContent), card.textContent.slice(0, 600));
}

/* ------------------------------------------------- 1. this browser cannot */

{
  const { window, calls } = boot({ push: null });
  await signIn(window);
  await wait(150);
  const $ = (id) => window.document.getElementById(id);

  check('with no PushManager the button is disabled', $('bgEnable').disabled === true);
  check('and says so plainly', /no push support/i.test($('bgStatus').textContent), $('bgStatus').textContent);
  check('the test and off buttons are hidden rather than dead',
    $('bgTest').classList.contains('hidden') && $('bgOff').classList.contains('hidden'));
  check('and a browser that cannot subscribe never asks the server for a key',
    !calls.some((c) => c.action === 'PUSH_KEY'), JSON.stringify(calls.map((c) => c.action)));
}

/* ------------------------------------------- 2. the server has no keys yet */

{
  const { window } = boot({ push: {}, key: { configured: false, publicKey: '' } });
  await signIn(window);
  await wait(200);
  const $ = (id) => window.document.getElementById(id);

  check('an unconfigured server disables the button', $('bgEnable').disabled === true);
  /* "Not configured" is a state of the DEPLOY, not a fault, and the line has
     to name the fix — otherwise it reads as the feature being broken. */
  check('and the status names the fix rather than reporting an error',
    /no push keys/i.test($('bgStatus').textContent) && /sls\/README/.test($('bgStatus').textContent),
    $('bgStatus').textContent);
}

/* ---------------------------------------------------- 3. subscribing works */

{
  const { window, calls, errors } = boot({ push: {} });
  await signIn(window);
  await wait(200);
  const $ = (id) => window.document.getElementById(id);

  check('a configured server with push support offers the button', $('bgEnable').disabled === false);
  check('and reports this device as off until it is turned on',
    /Off for this device/.test($('bgStatus').textContent), $('bgStatus').textContent);

  $('bgEnable').click();
  await wait(250);

  const browserSub = calls.find((c) => c.action === 'browser-subscribe');
  check('clicking subscribes through the push manager', !!browserSub);
  /* A push that shows no notification is a permission the browser takes back,
     which is why the worker's handler always ends in showNotification and why
     this flag is not optional. */
  check('and does it with userVisibleOnly, which is not optional',
    browserSub && browserSub.opts.userVisibleOnly === true, JSON.stringify(browserSub && browserSub.opts));
  check('the application server key is sent as bytes, not as a string',
    browserSub && browserSub.opts.applicationServerKey instanceof window.Uint8Array,
    browserSub && typeof browserSub.opts.applicationServerKey);

  const stored = calls.find((c) => c.action === 'PUSH_SUBSCRIBE');
  check('the subscription is handed to the server', !!stored);
  check('with the endpoint and both keys, or the row is unusable',
    stored && stored.payload.subscription.endpoint === SUBSCRIPTION.endpoint &&
    !!stored.payload.subscription.keys.p256dh && !!stored.payload.subscription.keys.auth,
    JSON.stringify(stored && stored.payload.subscription));

  check('and only then does the UI claim it is on',
    /On for this device/.test($('bgStatus').textContent), $('bgStatus').textContent);
  check('the off switch appears with it', !$('bgOff').classList.contains('hidden'));

  /* Through the SERVER. A local notification proves the permission and nothing
     else; the failure this button exists to catch is a keypair that does not
     match the stored subscription. */
  $('bgTest').click();
  await wait(150);
  check('the test goes through the real sender, not a local notification',
    calls.some((c) => c.action === 'PUSH_TEST'), JSON.stringify(calls.map((c) => c.action)));

  check('no page errors', errors.length === 0, errors[0]);
}

/* ------------------------------------ 4. a device that is already on says so */

{
  const { window } = boot({ push: { alreadySubscribed: true } });
  await signIn(window);
  await wait(200);
  const $ = (id) => window.document.getElementById(id);

  /* The BROWSER is the source of truth, never a remembered flag: a
     subscription dies when the PWA is deleted or the permission withdrawn, and
     neither tells the page anything. */
  check('a browser already holding a subscription reads as on',
    /On for this device/.test($('bgStatus').textContent), $('bgStatus').textContent);
  check('and its enable button is spent', $('bgEnable').disabled === true);
}

/* ----------------------------------------------------------------- out */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `   <- ${r.detail}`}`);
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
