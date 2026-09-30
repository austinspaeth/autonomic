/* How a sale was known: the `-E` token on `sub`, counted in its own map.

   `V` is a buy tap the store then confirmed, `S` the store's word alone. It is
   kept OUT of the cohort key on purpose, so every reader of `cohorts` — the
   dashboard's sales cards, the Pings tab, the ping-to-purchase tie — keeps
   decoding exactly what it always did. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const ping = require('../lambdas/ping/main.js');

const code = (tail) => {
  const d = new Date(Date.now() - 3 * 86_400_000);
  const p = (n) => String(n).padStart(2, '0');
  return `D${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${String(d.getUTCFullYear()).slice(2)}AY${tail}`;
};
const event = (kind, c) => ({ requestContext: { http: { path: `/ping/${kind}/${c}` } }, pathParameters: { cohort: c } });

test('the evidence token decodes, and anything else in its place is dropped', () => {
  assert.equal(ping.decodeCohort('D092426AY-TP-V1.31.2-EV').evidence, 'V');
  assert.equal(ping.decodeCohort('D092426AY-TP-V1.31.2-ES').evidence, 'S');
  assert.equal(ping.decodeCohort('D092426AY-TP-V1.31.2-EX').evidence, null);
  assert.equal(ping.decodeCohort('D092426AY-TP-V1.31.2').evidence, null);
  // It says nothing about the fields beside it.
  assert.equal(ping.decodeCohort('D092426AY-EV').tier, null);
  assert.equal(ping.decodeCohort('D092426AY-EV').slot, 'Y');
});

test('a sale is counted in the cohort map as before, and its evidence beside it', async (t) => {
  const sent = [];
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => { sent.push(cmd.input); return {}; });

  await ping.handler(event('sub', code('-TP-V1.31.2-EV')));
  const add = sent.find((c) => /cohorts/.test(c.UpdateExpression));
  assert.ok(add, 'the day row was bumped');
  const names = add.ExpressionAttributeNames;
  assert.match(names['#c'], /^\d{6}AY-P$/, 'the cohort key is exactly what it was');
  assert.equal(names['#evidence'], 'evidence');
  assert.equal(names['#e'], `${names['#c']}~V`);
  assert.match(add.UpdateExpression, /#evidence\.#e = if_not_exists/);
});

test('no token, or a route that is not a sale, touches no evidence map', async (t) => {
  const sent = [];
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => { sent.push(cmd.input); return {}; });
  await ping.handler(event('sub', code('-TP-V1.30.0')));
  await ping.handler(event('rst', code('-TP-V1.31.2-EV')));
  assert.equal(sent.length, 2);
  sent.forEach((c) => {
    assert.doesNotMatch(c.UpdateExpression, /evidence/);
    assert.equal(c.ExpressionAttributeNames['#evidence'], undefined);
  });
});

test('the first sale of the day creates the evidence map along with the others', async (t) => {
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
  await ping.handler(event('sub', code('-TP-V1.31.2-ES')));
  const create = sent.find((c) => /if_not_exists\(#cohorts, :empty\)/.test(c.UpdateExpression));
  assert.ok(create);
  assert.match(create.UpdateExpression, /#evidence = if_not_exists\(#evidence, :empty\)/);
  assert.equal(sent.length, 3, 'bump, create, bump again');
});

test('the report hands evidence back on sub rows only, joinable on the cohort key', async (t) => {
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => {
    const pk = cmd.input.ExpressionAttributeValues?.[':pk'];
    if (pk === 'PING#SUB') {
      return { Items: [{
        SK: '2026-10-01', total: 3,
        cohorts: { '092426AY-P': 2, '090126IM-P': 1 },
        builds: { 'A-P-1.31.2': 2, 'I-P-1.31.2': 1 },
        evidence: { '092426AY-P~V': 1, '092426AY-P~S': 1, '090126IM-P~Q': 4 },
      }] };
    }
    if (pk === 'PING#RST') {
      return { Items: [{ SK: '2026-10-01', total: 1, cohorts: { '092426AY-P': 1 }, builds: {}, evidence: { '092426AY-P~V': 1 } }] };
    }
    return { Items: [] };
  });
  const out = await ping.report('2026-09-01');
  assert.deepEqual(out.sub[0].evidence, [
    { key: '092426AY-P', evidence: 'S', count: 1 },
    { key: '092426AY-P', evidence: 'V', count: 1 },
  ], 'an unknown letter is dropped rather than reported');
  assert.equal(out.rst[0].evidence, undefined, 'a restore carries no evidence');
});
