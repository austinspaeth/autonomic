/* cleanSale: the one server-side gate a purchase passes on its way into the
   table. Pinned here for the field the Pings tab added — `ping`, the subscribe
   ping a purchase was recorded from — because the cleaner keeps a fixed list of
   fields, and a field it does not know is dropped on sync without a word. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { cleanSale } = require('../lambdas/api/main.js');

const base = { id: 'sale_1', date: '2026-09-26', platform: 'ios', plan: 'annual', price: 14.99, cohort: '2026-09-23' };

test('a purchase keeps the ping it was recorded from', () => {
  assert.equal(cleanSale({ ...base, ping: '2026-09-26|092326IP-T' }).ping, '2026-09-26|092326IP-T');
  // Keys written before the tier existed are shorter, and still valid.
  assert.equal(cleanSale({ ...base, ping: '2026-09-26|092326I' }).ping, '2026-09-26|092326I');
});

test('anything that is not a ping reference is dropped, not stored', () => {
  ['', 'nonsense', '2026-09-26', '2026-09-26|<script>', '2026-09-26|092326IP-T|extra', 42, null]
    .forEach((ping) => assert.equal(cleanSale({ ...base, ping }).ping, undefined, String(ping)));
});

test('a purchase with no ping is unchanged', () => {
  const out = cleanSale(base);
  assert.equal(out.ping, undefined);
  assert.equal(out.cohort, '2026-09-23');
});
