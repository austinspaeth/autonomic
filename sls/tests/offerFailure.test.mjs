/* The offer fall-through route's pure half: what a POST body may put in the
   table, and which row it lands on. Like the fault route, the body is free
   text from a client we may not have shipped, so the clamps are tested here
   rather than trusted from the app's own tests. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readOfferFailure, offerFailKey, ALPHABET, KINDS } = require('../lambdas/ping/main.js');

const post = (body, extra) => ({
  body: typeof body === 'string' ? body : JSON.stringify(body),
  ...extra,
});

test('reads the body the app sends', () => {
  assert.deepEqual(
    readOfferFailure(post({
      outcome: 'failed',
      code: 'network-error',
      response: 12,
      sub: 'payment-declined-due-to-insufficient-funds',
      message: 'Network unavailable',
      d: 1,
    })),
    {
      outcome: 'failed',
      code: 'network-error',
      response: 12,
      sub: 'payment-declined-due-to-insufficient-funds',
      msg: 'Network unavailable',
      installDay: true,
    },
  );
});

test('API Gateway may hand the body over base64-encoded', () => {
  const body = Buffer.from(JSON.stringify({ outcome: 'cancelled' })).toString('base64');
  assert.equal(readOfferFailure({ body, isBase64Encoded: true }).outcome, 'cancelled');
});

test('a timeout carries nothing but its outcome, and that is a whole report', () => {
  assert.deepEqual(readOfferFailure(post({ outcome: 'timeout' })), {
    outcome: 'timeout', code: null, response: null, sub: null, msg: '', installDay: false,
  });
});

test('clamps what it does not recognise rather than storing it as written', () => {
  const f = readOfferFailure(post({
    outcome: 'exploded', code: 'Not A Code!', response: '12', sub: 5, d: true,
  }));
  // An outcome from a newer client is kept as unknown, never refused.
  assert.equal(f.outcome, 'unknown');
  assert.equal(f.code, null);
  assert.equal(f.response, null);
  assert.equal(f.sub, null);
  assert.equal(f.installDay, false);
  assert.equal(readOfferFailure(post({ outcome: 'failed', response: 5000 })).response, null);
  assert.equal(readOfferFailure(post({ outcome: 'failed', response: -2 })).response, -2);
});

test('refuses what is not a report', () => {
  assert.equal(readOfferFailure({}), null);
  assert.equal(readOfferFailure(post('nope')), null);
  assert.equal(readOfferFailure(post('[1]')), null);
  assert.equal(readOfferFailure(post({ outcome: 'failed', message: 'x'.repeat(5000) })), null);
});

test('the message is redacted here whatever the client did', () => {
  assert.equal(
    readOfferFailure(post({ outcome: 'failed', message: 'receipt for ada@example.com at /var/mobile/Containers/x/y.json' })).msg,
    'receipt for <email> at …/y.json',
  );
});

test('identical fall-throughs share a row and different ones do not', () => {
  const a = readOfferFailure(post({ outcome: 'failed', code: 'network-error', message: 'timeout after 3012ms' }));
  const b = readOfferFailure(post({ outcome: 'failed', code: 'network-error', message: 'timeout after 4188ms' }));
  const c = readOfferFailure(post({ outcome: 'failed', code: 'service-error', message: 'timeout after 3012ms' }));
  const d = readOfferFailure(post({ outcome: 'pending', code: 'network-error', message: 'timeout after 3012ms' }));
  assert.equal(offerFailKey('2026-09-10', 'A', a), offerFailKey('2026-09-10', 'A', b));
  assert.notEqual(offerFailKey('2026-09-10', 'A', a), offerFailKey('2026-09-10', 'A', c));
  assert.notEqual(offerFailKey('2026-09-10', 'A', a), offerFailKey('2026-09-10', 'A', d));
  assert.notEqual(offerFailKey('2026-09-10', 'A', a), offerFailKey('2026-09-10', 'F', a));
  assert.match(offerFailKey('2026-09-10', 'F', a), /^2026-09-10#F#failed#[0-9a-f]{8}$/);
});

test('the day counter speaks the same alphabet as the accept it is read against', () => {
  assert.equal(KINDS.ofl, 'OFL');
  assert.deepEqual(ALPHABET.OFL, ALPHABET.OAC);
});
