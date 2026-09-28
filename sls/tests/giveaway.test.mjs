/* The giveaway sign-up's pure half: what a POST body may put in the table. The
   body comes from a client we may not have shipped, so the clamps are tested
   here rather than trusted from the app's own tests. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readGiveaway, GIVEAWAY_MAX_ENTRIES } = require('../lambdas/ping/giveaway.js');

const post = (body) => ({ body: typeof body === 'string' ? body : JSON.stringify(body) });

test('reads the body the app sends', () => {
  assert.deepEqual(
    readGiveaway(post({
      email: '  Someone@Example.com ',
      entries: [{ d: '2026-10-04', m: 'F' }, { d: '2026-10-03', m: 'B' }],
      dev: false,
    })),
    {
      email: 'someone@example.com',
      entries: [{ d: '2026-10-03', m: 'B' }, { d: '2026-10-04', m: 'F' }],
      dev: false,
    },
  );
});

test('refuses a body with no usable address', () => {
  assert.equal(readGiveaway(post({ email: 'nope', entries: [] })), null);
  assert.equal(readGiveaway(post({ entries: [] })), null);
  assert.equal(readGiveaway(post('not json')), null);
  assert.equal(readGiveaway(post([1, 2])), null);
  assert.equal(readGiveaway({}), null);
  assert.equal(readGiveaway(post({ email: 'a@b.co', pad: 'x'.repeat(5000) })), null);
});

test('an address with no entries yet is still a sign-up', () => {
  assert.deepEqual(readGiveaway(post({ email: 'a@b.co' })).entries, []);
});

test('keeps one entry per day inside the window, capped, with known sensors only', () => {
  const entries = [
    { d: '2026-09-30', m: 'B' },          // before the window
    { d: '2026-11-01', m: 'B' },          // after it
    { d: 'garbage', m: 'B' },
    { d: '2026-10-01', m: 'X' },          // unknown sensor: kept, sensor dropped
    { d: '2026-10-01', m: 'B' },          // duplicate day: first wins
  ];
  for (let i = 2; i <= 20; i++) entries.push({ d: `2026-10-${String(i).padStart(2, '0')}`, m: 'W' });
  const g = readGiveaway(post({ email: 'a@b.co', entries }));
  assert.equal(g.entries.length, GIVEAWAY_MAX_ENTRIES);
  assert.deepEqual(g.entries[0], { d: '2026-10-01', m: null });
  assert.equal(g.entries.at(-1).d, '2026-10-10');
});

test('dev is only ever an explicit true', () => {
  assert.equal(readGiveaway(post({ email: 'a@b.co', dev: 'yes' })).dev, false);
  assert.equal(readGiveaway(post({ email: 'a@b.co', dev: true })).dev, true);
});
