/* When a sale arrived: the `times` map on SUB day rows, cohort key -> the ISO
   instant of the latest ping under it. Only that route keeps one. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const ping = require('../lambdas/ping/main.js');

const codeFor = (iso, tail = 'I') => `D${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(2, 4)}${tail}`;
const event = (kind, c) => ({ requestContext: { http: { path: `/ping/${kind}/${c}` } }, pathParameters: { cohort: c } });
const old = () => ping.easternDay(Date.now() - 5 * 86_400_000);

test('a sale is stamped with when it arrived, under its own cohort key', async (t) => {
  const sent = [];
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => { sent.push(cmd.input); return {}; });
  const before = Date.now();
  await ping.handler(event('sub', `${codeFor(old(), 'IY')}-TT-EV`));
  const add = sent.find((c) => /cohorts\.#c/.test(c.UpdateExpression || ''));
  assert.match(add.UpdateExpression, /#times\.#c = :now/);
  assert.equal(add.ExpressionAttributeNames['#times'], 'times');
  const at = Date.parse(add.ExpressionAttributeValues[':now']);
  assert.ok(at >= before && at <= Date.now());
});

test('no other route keeps times', async (t) => {
  const sent = [];
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => { sent.push(cmd.input); return {}; });
  await ping.handler(event('open', codeFor(old())));
  await ping.handler(event('rst', codeFor(old(), 'IY')));
  sent.forEach((c) => {
    assert.doesNotMatch(c.UpdateExpression || '', /times/);
    assert.equal(c.ExpressionAttributeValues?.[':now'], undefined);
  });
});

test('a row that predates the map has it created, then the sale is counted', async (t) => {
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
  await ping.handler(event('sub', codeFor(old(), 'IM')));
  const create = sent.find((c) => /if_not_exists\(#cohorts, :empty\)/.test(c.UpdateExpression));
  assert.match(create.UpdateExpression, /#times = if_not_exists\(#times, :empty\)/);
  assert.equal(sent.filter((c) => /cohorts\.#c/.test(c.UpdateExpression || '')).length, 2);
});

test('the report hands times back, compact and expanded, and omits them where there are none', async (t) => {
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => {
    if (cmd.input.ExpressionAttributeValues?.[':pk'] === 'PING#SUB') {
      return { Items: [
        { SK: '2026-10-06', total: 1, cohorts: { '100126IY': 1 } },
        { SK: '2026-10-07', total: 1, cohorts: { '100226AM-T': 1 }, times: { '100226AM-T': '2026-10-07T18:14:03.000Z' } },
      ] };
    }
    return { Items: [] };
  });
  const full = await ping.report('2026-10-01');
  assert.equal(full.sub[0].times, undefined);
  assert.deepEqual(full.sub[1].times, { '100226AM-T': '2026-10-07T18:14:03.000Z' });
  const compact = await ping.report('2026-10-01', { compact: true });
  assert.equal(compact.sub[0].t, undefined);
  assert.deepEqual(compact.sub[1].t, { '100226AM-T': '2026-10-07T18:14:03.000Z' });
});
