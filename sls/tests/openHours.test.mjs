/* When each open arrived: the `hours` map on OPEN day rows.

   One key per open (Eastern hour + store + `N` for a first run), so the map
   sums to the day and a running sum is the day's headcount at any moment,
   which is what the phone dashboard paces today against. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const ping = require('../lambdas/ping/main.js');

const p2 = (n) => String(n).padStart(2, '0');
const codeFor = (iso, tail = 'I') => `D${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(2, 4)}${tail}`;
const event = (kind, c) => ({ requestContext: { http: { path: `/ping/${kind}/${c}` } }, pathParameters: { cohort: c } });

test('the hour is the Eastern one, on both sides of the clock change', () => {
  // 18:30 UTC in July is 14:30 EDT; in January it is 13:30 EST.
  assert.equal(ping.hourKey(Date.UTC(2026, 6, 15, 18, 30), 'I', false), '14I');
  assert.equal(ping.hourKey(Date.UTC(2026, 0, 15, 18, 30), 'A', true), '13AN');
  // Just after midnight UTC is still the evening before, Eastern.
  assert.equal(ping.hourKey(Date.UTC(2026, 6, 15, 1, 5), null, false), '21U');
});

test('an open is counted under its hour, and a first run says so', async (t) => {
  const sent = [];
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => { sent.push(cmd.input); return {}; });
  const today = ping.easternDay(Date.now());
  const old = ping.easternDay(Date.now() - 5 * 86_400_000);

  await ping.handler(event('open', codeFor(today)));
  await ping.handler(event('open', codeFor(old, 'A')));
  const [fresh, back] = sent.filter((c) => /cohorts\.#c/.test(c.UpdateExpression || ''));
  assert.match(fresh.UpdateExpression, /#hours\.#h = if_not_exists/);
  assert.equal(fresh.ExpressionAttributeNames['#hours'], 'hours');
  assert.match(fresh.ExpressionAttributeNames['#h'], /^\d{2}IN$/);
  assert.match(back.ExpressionAttributeNames['#h'], /^\d{2}A$/);
  assert.ok(Number(fresh.ExpressionAttributeNames['#h'].slice(0, 2)) < 24);
});

test('no other route keeps hours', async (t) => {
  const sent = [];
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => { sent.push(cmd.input); return {}; });
  const old = ping.easternDay(Date.now() - 5 * 86_400_000);
  await ping.handler(event('hrv', codeFor(old, 'IB')));
  sent.forEach((c) => {
    assert.doesNotMatch(c.UpdateExpression || '', /hours/);
    assert.equal(c.ExpressionAttributeNames?.['#hours'], undefined);
  });
});

test('a row that predates the map has it created, then the open is counted', async (t) => {
  const sent = [];
  let first = true;
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => {
    sent.push(cmd.input);
    if (first && /cohorts\.#c/.test(cmd.input.UpdateExpression || '')) {
      first = false;
      throw Object.assign(new Error('path invalid'), { name: 'ValidationException' });
    }
    return {};
  });
  await ping.handler(event('open', codeFor(ping.easternDay(Date.now() - 2 * 86_400_000))));
  const create = sent.find((c) => /if_not_exists\(#cohorts, :empty\)/.test(c.UpdateExpression));
  assert.ok(create);
  assert.match(create.UpdateExpression, /#hours = if_not_exists\(#hours, :empty\)/);
  assert.equal(sent.filter((c) => /cohorts\.#c/.test(c.UpdateExpression || '')).length, 2, 'bump, create, bump again');
});

test('the report hands hours back, compact and expanded, and omits them where there are none', async (t) => {
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => {
    const pk = cmd.input.ExpressionAttributeValues?.[':pk'];
    if (pk === 'PING#OPEN') {
      return { Items: [
        { SK: '2026-10-06', total: 3, cohorts: { '100626I': 3 } },
        { SK: '2026-10-07', total: 5, cohorts: { '100726I': 2, '100126A': 3 }, hours: { '09IN': 2, '14A': 3 } },
      ] };
    }
    return { Items: [] };
  });
  const compact = await ping.report('2026-10-01', { compact: true });
  assert.equal(compact.open[0].h, undefined);
  assert.deepEqual(compact.open[1].h, { '09IN': 2, '14A': 3 });
  const full = await ping.report('2026-10-01');
  assert.equal(full.open[0].hours, undefined);
  assert.deepEqual(full.open[1].hours, { '09IN': 2, '14A': 3 });
  assert.equal(full.open[1].total, 5);
});
