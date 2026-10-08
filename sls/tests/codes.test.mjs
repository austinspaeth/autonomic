/* Access codes: what the public redeem route accepts, and the three rules the
   dashboard relies on — a code is never overwritten, it is honoured exactly
   once, and a dev build can check one without spending it. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  readRedeem, redeemCode, createCode, listCodes, normCode, normDays, generateCode,
  GEN_ALPHABET, GEN_LENGTH, DAYS_MAX,
} = require('../lambdas/ping/codes.js');

const post = (body) => ({ body: typeof body === 'string' ? body : JSON.stringify(body) });

/** The four commands codes.js sends, over a Map. */
const fakeDdb = () => {
  const rows = new Map();
  const missing = () => Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
  return {
    rows,
    send: async (cmd) => {
      const name = cmd.constructor.name;
      const i = cmd.input;
      if (name === 'PutCommand') {
        if (rows.has(i.Item.SK)) throw missing();
        rows.set(i.Item.SK, { ...i.Item });
        return {};
      }
      if (name === 'GetCommand') return { Item: rows.get(i.Key.SK) };
      if (name === 'UpdateCommand') {
        const row = rows.get(i.Key.SK);
        if (!row || row.redeemed > 0) throw missing();
        row.redeemed = 1;
        row.redeemedAt = i.ExpressionAttributeValues[':now'];
        row.redeemedPlatform = i.ExpressionAttributeValues[':platform'];
        return { Attributes: { ...row } };
      }
      if (name === 'QueryCommand') return { Items: [...rows.values()] };
      throw new Error(`unexpected ${name}`);
    },
  };
};

test('one code however it is typed', () => {
  assert.equal(normCode('k7wq-m2xd'), 'K7WQM2XD');
  assert.equal(normCode(' K7WQ M2XD '), 'K7WQM2XD');
  assert.equal(normCode('abc'), null);
  assert.equal(normCode('x'.repeat(25)), null);
  assert.equal(normCode(123456), null);
});

test('days are whole and bounded', () => {
  assert.equal(normDays(30), 30);
  assert.equal(normDays('999'), DAYS_MAX);
  assert.equal(normDays(0), null);
  assert.equal(normDays(1000), null);
  assert.equal(normDays('soon'), null);
});

test('a generated code is typeable', () => {
  const c = generateCode();
  assert.equal(c.length, GEN_LENGTH);
  assert.ok([...c].every((ch) => GEN_ALPHABET.includes(ch)));
  assert.equal(normCode(c), c);
});

test('reads a redemption body and refuses anything else', () => {
  assert.deepEqual(readRedeem(post({ code: 'k7wq-m2xd' })), { code: 'K7WQM2XD', dev: false });
  assert.deepEqual(readRedeem(post({ code: 'K7WQM2XD', dev: true })), { code: 'K7WQM2XD', dev: true });
  assert.equal(readRedeem(post({ code: 'no' })), null);
  assert.equal(readRedeem(post('not json')), null);
  assert.equal(readRedeem(post({ code: 'K7WQM2XD', pad: 'x'.repeat(600) })), null);
  assert.equal(readRedeem({}), null);
});

test('create, redeem, list', async () => {
  const ddb = fakeDdb();
  const made = await createCode(ddb, 't', { days: 30, note: ' for Sam ' }, 1000);
  assert.equal(made.ok, true);
  assert.equal(made.code.days, 30);
  assert.equal(made.code.note, 'for Sam');

  const install = { platform: 'I', version: '1.31.0' };
  const r = { code: made.code.code, dev: false };
  assert.deepEqual(await redeemCode(ddb, 't', r, install, 2000), { status: 'ok', days: 30 });
  const { rows } = await listCodes(ddb, 't');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].used, true);
  assert.equal(rows[0].redeemedPlatform, 'I');
});

test('a code is honoured once; after that it is used, on any phone', async () => {
  const ddb = fakeDdb();
  await createCode(ddb, 't', { days: 999, code: 'FRIEND2026' });
  const r = { code: 'FRIEND2026', dev: false };
  assert.equal((await redeemCode(ddb, 't', r, { platform: 'I' }, 1)).status, 'ok');
  assert.deepEqual(await redeemCode(ddb, 't', r, { platform: 'I' }, 2), { status: 'used' });
  assert.deepEqual(await redeemCode(ddb, 't', r, { platform: 'A' }, 3), { status: 'used' });
  // The first redemption's stamp is not overwritten by the refused ones.
  assert.equal(ddb.rows.get('FRIEND2026').redeemedPlatform, 'I');
});

test('a code that does not exist is missing, not a throw', async () => {
  const ddb = fakeDdb();
  assert.deepEqual(await redeemCode(ddb, 't', { code: 'NOSUCHCODE', dev: false }, {}, 1), { status: 'missing' });
  assert.deepEqual(await redeemCode(ddb, 't', { code: 'NOSUCHCODE', dev: true }, {}, 1), { status: 'missing' });
});

test('a dev build is told what a code is worth without spending it', async () => {
  const ddb = fakeDdb();
  await createCode(ddb, 't', { days: 60, code: 'friend-2026' });
  const dev = { code: 'FRIEND2026', dev: true };
  assert.deepEqual(await redeemCode(ddb, 't', dev, {}, 1), { status: 'ok', days: 60 });
  assert.equal(ddb.rows.get('FRIEND2026').redeemed, 0);
  await redeemCode(ddb, 't', { code: 'FRIEND2026', dev: false }, {}, 2);
  assert.deepEqual(await redeemCode(ddb, 't', dev, {}, 3), { status: 'used' });
});

test('a code is never overwritten, and bad input is refused', async () => {
  const ddb = fakeDdb();
  assert.equal((await createCode(ddb, 't', { days: 30, code: 'FRIEND2026' })).ok, true);
  const again = await createCode(ddb, 't', { days: 999, code: 'friend 2026' });
  assert.equal(again.ok, false);
  assert.equal(ddb.rows.get('FRIEND2026').days, 30);
  assert.equal((await createCode(ddb, 't', { days: 0 })).ok, false);
  assert.equal((await createCode(ddb, 't', { days: 30, code: 'abc' })).ok, false);
});
