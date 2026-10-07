/* The phone dashboard's half: the compact usage report it reads, and the
   instant pushes the ping handler sends it (new install, sale, hard crash).

   The pushes ride the ping handler, which counts the production app's usage,
   so the tests that matter most are the ones proving a push can never cost a
   count and never fires for anything but its three events. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const ping = require('../lambdas/ping/main.js');
const expo = require('../lambdas/push/expo.js');

const TOKEN = 'ExponentPushToken[abcdefghijklmnop]';
const p2 = (n) => String(n).padStart(2, '0');
const mmddyy = (d) => `${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${String(d.getUTCFullYear()).slice(2)}`;
/* The Eastern day the server buckets by, as the cohort code spells it. */
const todayCode = () => {
  const [y, m, d] = ping.easternDay(Date.now()).split('-');
  return `${m}${d}${y.slice(2)}`;
};
const daysAgo = (n) => mmddyy(new Date(Date.now() - n * 86_400_000));
const event = (kind, c, q) => ({
  requestContext: { http: { path: `/${kind === 'fault' ? 'fault' : `ping/${kind}`}/${c}` } },
  pathParameters: { cohort: c },
  queryStringParameters: q,
});

/** Mock the table (one registered phone) and the push service; returns what was sent. */
function harness(t, { fetchFails = false } = {}) {
  expo._resetCache();
  const writes = [];
  const pushes = [];
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => {
    if (cmd.input.ExpressionAttributeValues?.[':pk'] === 'EXPOPUSH') return { Items: [{ token: TOKEN }] };
    writes.push(cmd.input);
    return {};
  });
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    if (fetchFails) throw new Error('network down');
    pushes.push(JSON.parse(init.body));
    return { json: async () => ({ data: [{ status: 'ok' }] }) };
  });
  return { writes, pushes };
}

test('compact rows are the stored maps; the expanded form stays the default', async (t) => {
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => {
    if (cmd.input.ExpressionAttributeValues?.[':pk'] === 'PING#OPEN') {
      return { Items: [{ SK: '2026-10-01', total: 3, cohorts: { '100126IP-T': 2, '092426A-F': 1 }, builds: { 'I-T-1.32.0': 2 } }] };
    }
    return { Items: [] };
  });
  const compact = await ping.report('2026-09-01', { compact: true });
  assert.equal(compact.compact, true);
  assert.deepEqual(compact.open[0], { day: '2026-10-01', total: 3, c: { '100126IP-T': 2, '092426A-F': 1 }, b: { 'I-T-1.32.0': 2 } });
  const expanded = await ping.report('2026-09-01');
  assert.equal(expanded.compact, undefined);
  assert.equal(expanded.open[0].cohorts.length, 2, 'the web still gets expanded rows');
});

test('a first run (install day == today) pushes a new install; a returning open does not', async (t) => {
  const { pushes } = harness(t);
  await ping.handler(event('open', `D${todayCode()}I-TT-V1.32.0`));
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0][0].to, TOKEN);
  assert.equal(pushes[0][0].title, 'New install');
  assert.match(pushes[0][0].body, /iOS · Trial · v1\.32\.0/);

  await ping.handler(event('open', `D${daysAgo(5)}I-TT`));
  assert.equal(pushes.length, 1, 'a returning user is not a push');
});

test('a sale pushes, naming plan and store', async (t) => {
  const { pushes } = harness(t);
  await ping.handler(event('sub', `D${daysAgo(9)}AY-TP`));
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0][0].title, 'New sale');
  assert.match(pushes[0][0].body, /Yearly · Android · Pro/);
});

test('other routes never push', async (t) => {
  const { pushes } = harness(t);
  for (const k of ['hrv', 'act', 'pay', 'rst', 'lap']) await ping.handler(event(k, `D${todayCode()}IW-TT`));
  assert.equal(pushes.length, 0);
});

test('a push that fails never costs the count', async (t) => {
  const { writes } = harness(t, { fetchFails: true });
  const res = await ping.handler(event('sub', `D${daysAgo(2)}IM-TP`));
  assert.equal(res.statusCode, 204);
  assert.ok(writes.some((w) => /cohorts/.test(w.UpdateExpression || '')), 'the sale was still counted');
});

test('only a FATAL fault, on its install-day report, pushes a crash', async (t) => {
  const { pushes } = harness(t);
  const c = `D${daysAgo(3)}A-TF-V1.31.2`;
  await ping.handler(event('fault', c, { t: 'native.crash', m: 'BadParcelableException', f: '1', d: '1' }));
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0][0].title, 'Crash: native.crash');
  await ping.handler(event('fault', c, { t: 'native.crash', m: 'BadParcelableException', f: '1' }));
  assert.equal(pushes.length, 1, 'the rest of a crash loop that day is not another push');
  await ping.handler(event('fault', c, { t: 'health.read', m: 'timeout', d: '1' }));
  assert.equal(pushes.length, 1, 'a handled error never pushes');
});

test('only an Expo push token may be registered', async (t) => {
  harness(t);
  assert.equal((await expo.register('a@b.c', 'not-a-token')).ok, false);
  assert.equal((await expo.register('a@b.c', TOKEN, 'iPhone')).ok, true);
});
