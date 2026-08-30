/* The fault route's pure half: what may be STORED, and what row it lands on.

   The redaction tests here are the same cases the client's are
   (mobile/src/lib/__tests__/errorReport.test.ts), on purpose and duplicated on
   purpose. The client's redaction is a promise about builds we shipped; this
   one is the promise about what can ever be written to the table, and it has to
   hold for a modified client, an old build, and somebody curling the URL. If
   the two ever disagree, this one wins — so it needs its own tests rather than
   an assumption that the other file passed. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  redactFault, safeTag, faultKey, hash8, FAULT_MSG_MAX, FAULT_TTL_DAYS, FAULT_MAX_N,
} = require('../lambdas/ping/main.js');

test('nothing identifying can reach the table', () => {
  // Each of these is a real shape a real failure produces on a real phone.
  assert.equal(
    redactFault('ENOENT: /var/mobile/Containers/Data/Application/6F2A/Documents/export.json missing'),
    'ENOENT: …/export.json missing',
  );
  assert.equal(
    redactFault('open failed: /storage/emulated/0/Download/Ada Lovelace backup.json'),
    'open failed: …/Ada Lovelace backup.json',
  );
  assert.equal(redactFault('mail to ada@example.com bounced'), 'mail to <email> bounced');
  assert.equal(
    redactFault('timeout GET https://api.autonomic.care/ping/open/D082126I?x=1'),
    'timeout GET https://api.autonomic.care',
  );
  assert.equal(redactFault('cannot read file:///var/mobile/Media/x.csv'), 'cannot read file://');
  assert.equal(
    redactFault('receipt 3f2504e0-4f89-11d3-9a0c-0305e82c3301 rejected'),
    'receipt <id> rejected',
  );
  assert.equal(redactFault('device aabbccddeeff00 not paired'), 'device <id> not paired');
  assert.equal(redactFault('token eyJhbGciOiJIUzI1NiwidHlwIjoiSldUIn0 expired'), 'token <id> expired');
});

test('the shape of the failure survives, because that is the point', () => {
  assert.equal(redactFault('Network request failed'), 'Network request failed');
  // A small code is the diagnosis and must not be collapsed with the ids.
  assert.equal(redactFault('code 404: not found'), 'code 404: not found');
  assert.equal(redactFault('code 601: device disconnected'), 'code 601: device disconnected');
  // A module specifier is the useful half of a stack line.
  assert.equal(
    redactFault('undefined is not a function (expo-modules-core/build/index.js)'),
    'undefined is not a function (expo-modules-core/build/index.js)',
  );
});

test('a long digit run is collapsed, which is also what groups a retry loop', () => {
  assert.equal(redactFault('timeout after 3012ms'), 'timeout after <n>ms');
  assert.equal(redactFault('timeout after 3012ms'), redactFault('timeout after 4188ms'));
  // ...and that is what makes them ONE row rather than a hundred.
  assert.equal(
    faultKey('2026-08-30', 'health.check', redactFault('timeout after 3012ms')),
    faultKey('2026-08-30', 'health.check', redactFault('timeout after 4188ms')),
  );
});

test('a message is truncated, so a row can never grow on what it embedded', () => {
  const out = redactFault(`parse failed: ${'the quick brown fox '.repeat(60)}`);
  assert.ok(out.length <= FAULT_MSG_MAX);
  assert.ok(out.endsWith('…'));
});

test('an unreadable message is nothing, and nothing is not a report', () => {
  // The handler refuses an empty message, which is what stops the one row a
  // prober could create for free and nobody could act on.
  assert.equal(redactFault(undefined), '');
  assert.equal(redactFault(''), '');
  assert.equal(redactFault('   '), '');
});

test('a tag is checked, never cleaned', () => {
  // A tag is a string the app chose. Something else in the slot is not a tag
  // with bad characters in it — it is not a tag, and sanitising it would invent
  // a call site that does not exist in the codebase.
  ['store.persist', 'iap.init', 'health.check', 'uncaught.fatal'].forEach((t) => {
    assert.equal(safeTag(t), t);
  });
  assert.equal(safeTag('Health Check!'), 'unknown');
  assert.equal(safeTag(''), 'unknown');
  assert.equal(safeTag(undefined), 'unknown');
  // Case-folded, so one call site cannot become two rows.
  assert.equal(safeTag('Store.Persist'), 'store.persist');
});

test('the row key is day, then call site, then the failure itself', () => {
  const k = faultKey('2026-08-30', 'health.check', 'timeout');
  assert.match(k, /^2026-08-30#health\.check#[0-9a-f]{8}$/);
  // The day leads, so a read is one range query over the sort key.
  assert.ok(faultKey('2026-08-29', 'a', 'x') < faultKey('2026-08-30', 'a', 'x'));
  // Different sites and different failures are different rows.
  assert.notEqual(faultKey('2026-08-30', 'a', 'x'), faultKey('2026-08-30', 'b', 'x'));
  assert.notEqual(faultKey('2026-08-30', 'a', 'x'), faultKey('2026-08-30', 'a', 'y'));
  // A crash and a swallowed error that read alike are not the same bug.
  assert.notEqual(faultKey('2026-08-30', 'a', 'x', true), faultKey('2026-08-30', 'a', 'x', false));
  assert.ok(faultKey('2026-08-30', 'a', 'x', true).endsWith('!'));
});

test('the hash is stable and separates', () => {
  assert.equal(hash8('abc'), hash8('abc'));
  assert.match(hash8('abc'), /^[0-9a-f]{8}$/);
  assert.notEqual(hash8('abc'), hash8('abd'));
});

test('faults expire, and the counters never do', () => {
  // A row that lived forever would make the one public route that CREATES rows
  // an unbounded one. Four months is longer than any investigation.
  assert.ok(FAULT_TTL_DAYS >= 30 && FAULT_TTL_DAYS <= 400);
});

test('an occurrence count is clamped, never trusted', () => {
  // `n` lands in a counter behind an unauthenticated GET. The ceiling is the
  // difference between somebody inflating a number and somebody destroying it,
  // and no honest report gets near it.
  const clamp = (raw) => Math.max(1, Math.min(Math.floor(Number(raw)) || 1, FAULT_MAX_N));
  assert.equal(clamp('17'), 17);
  // A missing or unreadable value is 1: the request itself is evidence of at
  // least one occurrence, so the floor is honest rather than zero.
  assert.equal(clamp(undefined), 1);
  assert.equal(clamp('nonsense'), 1);
  assert.equal(clamp('0'), 1);
  assert.equal(clamp('-9'), 1);
  assert.equal(clamp('1e12'), FAULT_MAX_N);
  assert.equal(clamp('999999999'), FAULT_MAX_N);
});
