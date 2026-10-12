/* The door a sale came through: the `-W` token on `sub`, counted in its own map.

   A wall letter (the PAY route's) or an offer letter (the OSH route's). Kept
   OUT of the cohort key for the reason `evidence` is: every reader of
   `cohorts` keeps decoding exactly what it always did. */
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

test('the door token decodes, and anything else in its place is dropped', () => {
  assert.equal(ping.decodeCohort('D092426AY-TT-V1.32.0-EV-WI').door, 'I');
  assert.equal(ping.decodeCohort('D092426AY-TT-V1.32.0-EV-WF').door, 'F');
  assert.equal(ping.decodeCohort('D092426AY-TT-V1.32.0-EV-WZ').door, null);
  assert.equal(ping.decodeCohort('D092426AY-TT-V1.32.0-EV').door, null);
  // It says nothing about the fields beside it.
  assert.equal(ping.decodeCohort('D092426AY-WI').evidence, null);
  assert.equal(ping.decodeCohort('D092426AY-TT-V1.32.0-EV-WI').evidence, 'V');
});

test('every wall and both offer cards are doors, and no letter means two things', () => {
  Object.keys(ping.ALPHABET.PAY).forEach((L) => assert.ok(ping.DOORS[L], `wall ${L} is not a door`));
  Object.keys(ping.ALPHABET.OSH).forEach((L) => assert.ok(ping.DOORS[L], `offer ${L} is not a door`));
  Object.keys(ping.ALPHABET.OSH).forEach((L) => assert.equal(ping.ALPHABET.PAY[L], undefined, `${L} is both a wall and an offer`));
});

test('a sale is counted in the cohort map as before, and its door beside it', async (t) => {
  const sent = [];
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => { sent.push(cmd.input); return {}; });

  await ping.handler(event('sub', code('-TT-V1.32.0-EV-WI')));
  const add = sent.find((c) => /cohorts/.test(c.UpdateExpression));
  assert.ok(add, 'the day row was bumped');
  const names = add.ExpressionAttributeNames;
  assert.match(names['#c'], /^\d{6}AY-T$/, 'the cohort key is exactly what it was');
  assert.equal(names['#doors'], 'doors');
  assert.equal(names['#w'], `${names['#c']}~I`);
  assert.match(add.UpdateExpression, /#doors\.#w = if_not_exists/);
});

test('no token, or a route that is not a sale, touches no door map', async (t) => {
  const sent = [];
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => { sent.push(cmd.input); return {}; });
  await ping.handler(event('sub', code('-TT-V1.31.0-EV')));
  await ping.handler(event('rst', code('-TT-V1.32.0-WI')));
  await ping.handler(event('pay', code('-TT-V1.32.0-WI').replace('AY', 'AI')));
  assert.equal(sent.length, 3);
  sent.forEach((c) => {
    assert.doesNotMatch(c.UpdateExpression, /doors/);
    assert.equal(c.ExpressionAttributeNames['#doors'], undefined);
  });
});

test('the first sale of the day creates the door map along with the others', async (t) => {
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
  await ping.handler(event('sub', code('-TT-V1.32.0-EV-WF')));
  const create = sent.find((c) => /if_not_exists\(#cohorts, :empty\)/.test(c.UpdateExpression));
  assert.ok(create);
  assert.match(create.UpdateExpression, /#doors = if_not_exists\(#doors, :empty\)/);
  assert.equal(sent.length, 3, 'bump, create, bump again');
});

test('the report hands doors back on sub rows only, expanded and compact', async (t) => {
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (cmd) => {
    const pk = cmd.input.ExpressionAttributeValues?.[':pk'];
    if (pk === 'PING#SUB' || pk === 'PING#PAY') {
      return { Items: [{
        SK: '2026-10-10', total: 2, cohorts: { '100126AY-T': 2 }, builds: {},
        doors: { '100126AY-T~I': 1, '100126AY-T~F': 1, '100126AY-T~Z': 4 },
      }] };
    }
    return { Items: [] };
  });
  const r = await ping.report('2026-10-01');
  assert.deepEqual(r.sub[0].doors, [
    { key: '100126AY-T', door: 'F', count: 1 },
    { key: '100126AY-T', door: 'I', count: 1 },
  ]);
  assert.equal(r.pay[0].doors, undefined, 'only a sale has a door');
  const c = await ping.report('2026-10-01', { compact: true });
  assert.equal(c.sub[0].w['100126AY-T~I'], 1);
});

test('a saved reading is a reading route: it has a storage kind and speaks sensors', () => {
  assert.equal(ping.KINDS.sav, 'SAV');
  assert.deepEqual(Object.keys(ping.ALPHABET.SAV).sort(), Object.keys(ping.ALPHABET.HRV).sort());
});
