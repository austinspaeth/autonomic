/* The ping endpoint's pure half: how a code decodes, and what key a count
   lands under.

   These two functions are where every backward-compatibility promise this
   endpoint makes actually lives. The table holds rows written by every version
   of the lambda that ever ran — 6-character keys with no platform, 7 with one,
   8 with a sensor, and now a tagged tail — and a decode that got any of them
   wrong would not fail, it would quietly move counts into the wrong bucket.
   So the cases below are deliberately the OLD shapes as much as the new. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodeCohort, cohortKey, buildKey, ALPHABET, KINDS } = require('../lambdas/ping/main.js');

test('decodes the shapes every build that ever shipped can send', () => {
  // The original: cohort only.
  assert.deepEqual(decodeCohort('D082126'),
    { iso: '2026-08-21', platform: 'U', slot: null, tier: null, version: null });
  // With the platform letter.
  assert.deepEqual(decodeCohort('D082126I'),
    { iso: '2026-08-21', platform: 'I', slot: null, tier: null, version: null });
  // With the sensor letter.
  assert.deepEqual(decodeCohort('D082126IG'),
    { iso: '2026-08-21', platform: 'I', slot: 'G', tier: null, version: null });
  // And today's, with the tagged tail.
  assert.deepEqual(decodeCohort('D082126IG-TP-V1.26.0'),
    { iso: '2026-08-21', platform: 'I', slot: 'G', tier: 'P', version: '1.26.0' });
});

test('a tagged token is independent of every other one', () => {
  // The case a positional field could never have handled: a tier with no
  // sensor. `D082126IP` would be indistinguishable from a sensor letter P.
  assert.equal(decodeCohort('D082126I-TF').tier, 'F');
  assert.equal(decodeCohort('D082126I-TF').slot, null);
  assert.equal(decodeCohort('D082126I-V1.26.0').version, '1.26.0');
  assert.equal(decodeCohort('D082126I-V1.26.0').tier, null);
});

test('an unreadable field is dropped, never guessed and never fatal', () => {
  // A client can ship a new letter before this file learns it. The ping must
  // still count — as unknown, not as nothing.
  assert.equal(decodeCohort('D082126I-TZ').tier, null);
  assert.equal(decodeCohort('D082126I-TZ').iso, '2026-08-21');
  // A version that is not a dotted number would become an unreadable map key.
  assert.equal(decodeCohort('D082126I-Vnightly').version, null);
  assert.equal(decodeCohort('D082126I-Vbeta.3').version, null);
  // A token this file has no tag for is ignored rather than poisoning the rest
  // — which is the same promise in the other direction: a future field can be
  // added to the client before this file is deployed.
  assert.equal(decodeCohort('D082126I-TP-X9').tier, 'P');
  // A platform we do not know reads as U, the same as none at all.
  assert.equal(decodeCohort('D082126Q').platform, 'U');
});

test('refuses a code that is not a real date', () => {
  assert.equal(decodeCohort('D023126I'), null);   // 31 February
  assert.equal(decodeCohort('nope'), null);
  assert.equal(decodeCohort(''), null);
  assert.equal(decodeCohort(undefined), null);
});

test('the cohort key keeps its old shape when there is nothing new to say', () => {
  // The property that matters: a build sending no tier writes the same key it
  // has always written, so its counts keep landing in the same bucket.
  assert.equal(cohortKey('2026-08-21', 'I', null, null), '082126I');
  assert.equal(cohortKey('2026-08-21', 'I', 'G', null), '082126IG');
  assert.equal(cohortKey('2026-08-21', 'I', 'G', 'P'), '082126IG-P');
  assert.equal(cohortKey('2026-08-21', 'I', null, 'F'), '082126I-F');
  assert.equal(cohortKey('2026-08-21', null, null, null), '082126U');
});

test('each route validates the slot against ITS OWN alphabet', () => {
  // A letter legal on one route must not be legal on a route that does not
  // speak it, and the routes that take no letter must accept none. Otherwise a
  // prober can append a character to an open ping and fragment one cohort's
  // opens across keys nobody knows to re-add — a silent undercount rather than
  // a visible bad row.
  const speaks = (kind, letter) => !!(ALPHABET[kind] && ALPHABET[kind][letter]);

  assert.ok(speaks('HRV', 'G'));      // a sensor on a capture route
  assert.ok(!speaks('HRV', 'R'));     // ...but not a paywall surface
  assert.ok(speaks('PAY', 'R'));
  assert.ok(!speaks('PAY', 'G'));
  assert.ok(speaks('NOT', 'M') && speaks('POT', 'T') && speaks('SEE', 'I'));
  assert.ok(!speaks('NOT', 'T'));     // a POTS letter is not a notification

  // The three offer routes share one alphabet on purpose: accepts over shows is
  // only a conversion rate if both are counted per the same offer.
  assert.deepEqual(ALPHABET.OSH, ALPHABET.ODM);
  assert.deepEqual(ALPHABET.OSH, ALPHABET.OAC);

  // And the routes that carry nothing accept nothing.
  ['OPEN', 'SUB', 'ERR'].forEach((k) => assert.equal(ALPHABET[k], undefined));
});

test('every route name the client can send has a storage kind', () => {
  // The handler resolves a route by name, so a route added to serverless.yml
  // but not here answers 204 and counts nothing — silently.
  ['open', 'sub', 'act', 'cap', 'hrv', 'pay', 'not', 'pot', 'see', 'err', 'osh', 'odm', 'oac']
    .forEach((k) => assert.ok(KINDS[k], `no storage kind for /ping/${k}`));
});

test('the build key is a complete partition, so unknowns are named', () => {
  assert.equal(buildKey('I', 'P', '1.26.0'), 'I-P-1.26.0');
  // Absent parts are '?' rather than omitted: every ping has to land in exactly
  // one build key, or the map stops summing to the day's total and "adoption"
  // becomes a share of the builds new enough to answer.
  assert.equal(buildKey('I', null, null), 'I-?-?');
  assert.equal(buildKey(null, null, null), 'U-?-?');
});
