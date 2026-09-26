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
  // The pacing budget is on THREE routes under one letter, split by what the
  // tap got: SEE B is the pitch card a locked tap opens, USE B is the budget
  // itself, PAY B is the paywall raised from the pitch. One funnel, read down
  // the column; pooled into one letter on one route it would say nothing.
  assert.ok(speaks('SEE', 'B') && speaks('USE', 'B') && speaks('PAY', 'B'));
  assert.ok(speaks('NOT', 'P'));      // pacing alerts
  assert.ok(!speaks('NOT', 'T'));     // a POTS letter is not a notification

  // The three offer routes share one alphabet on purpose: accepts over shows is
  // only a conversion rate if both are counted per the same offer.
  assert.deepEqual(ALPHABET.OSH, ALPHABET.ODM);
  assert.deepEqual(ALPHABET.OSH, ALPHABET.OAC);

  // OFL does NOT share it, and that asymmetry is the point. A purchase can fall
  // through from the ordinary paywall, which is not an offer card: nothing
  // shows it and nothing accepts it, so `P` exists on the failure route and on
  // no other. A consumer dividing ofl by oac must therefore do it per letter —
  // P's denominator is the PAY route, which has its own cap and shape.
  assert.ok(speaks('OFL', 'A') && speaks('OFL', 'F') && speaks('OFL', 'P'));
  assert.ok(!speaks('OAC', 'P'));
  assert.ok(!speaks('OSH', 'P'));

  // The journal-and-feature routes: each its own alphabet, and a letter shared
  // by spelling (M, P, C, R) means something different on each.
  assert.ok(['S', 'A', 'M', 'Y', 'W', 'B', 'P', 'R'].every((l) => speaks('LOG', l)));
  assert.ok(!speaks('LOG', 'G'));
  assert.ok(speaks('USE', 'M') && speaks('USE', 'P') && !speaks('USE', 'S'));
  assert.ok(['E', 'U', 'C', 'R'].every((l) => speaks('FND', l)));
  assert.ok(['D', 'H', 'C'].every((l) => speaks('RPT', l)));
  assert.ok(!speaks('RPT', 'E'));

  // The three subscriber routes share ONE plan alphabet, so new, restored and
  // lapsed can be read against each other per plan.
  ['Y', 'M', 'P', 'F'].forEach((l) => assert.ok(speaks('SUB', l) && speaks('RST', l) && speaks('LAP', l)));
  assert.deepEqual(ALPHABET.SUB, ALPHABET.RST);
  assert.deepEqual(ALPHABET.SUB, ALPHABET.LAP);
  assert.ok(!speaks('SUB', 'G'));     // a sensor is not a plan
  assert.ok(!speaks('SUB', 'A'));     // ...and neither is an offer card

  // And the routes that carry nothing accept nothing.
  ['OPEN', 'ERR'].forEach((k) => assert.equal(ALPHABET[k], undefined));
});

test('every route name the client can send has a storage kind', () => {
  // The handler resolves a route by name, so a route added to serverless.yml
  // but not here answers 204 and counts nothing — silently.
  ['open', 'sub', 'rst', 'lap', 'act', 'cap', 'hrv', 'pay', 'not', 'pot', 'see', 'err', 'osh', 'odm', 'oac', 'ofl',
    'log', 'use', 'fnd', 'rpt']
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

test('an old letterless sub and a new planned one land under different keys', () => {
  // The plan letter is also the generation marker: a build that sends the new
  // meaning of `sub` (a purchase just made) always sends a plan, and no older
  // build ever did. So the old ambiguous rows keep their old key and can be
  // read the old way, and nothing is reclassified after the fact.
  const legacy = decodeCohort('D082126A-TP-V1.29.0');
  const fresh = decodeCohort('D082126AY-TP-V1.30.0');
  assert.equal(legacy.slot, null);
  assert.equal(fresh.slot, 'Y');
  assert.equal(cohortKey(legacy.iso, legacy.platform, null, legacy.tier), '082126A-P');
  assert.equal(cohortKey(fresh.iso, fresh.platform, 'Y', fresh.tier), '082126AY-P');
});

/* Subscription events: the one place a sale is kept as an EVENT, so the
   dashboard can say when it arrived and from which build. */
test('a subscription ping becomes one event row holding the whole ping', () => {
  const { subEventItem, subEventRow, SUB_EVENT_TTL_DAYS } = require('../lambdas/ping/main.js');
  const now = Date.parse('2026-09-25T13:47:12.345Z');
  const item = subEventItem('SUB', decodeCohort('D091626IF-TT-V1.29.0'), now, 'a1b2c3');
  assert.deepEqual(item, {
    PK: 'SUBEVENT',
    SK: '2026-09-25T13:47:12.345Z#a1b2c3',
    entityType: 'SUB_EVENT',
    route: 'sub',
    at: '2026-09-25T13:47:12.345Z',
    day: '2026-09-25',
    cohort: '2026-09-16',
    platform: 'I',
    plan: 'F',
    tier: 'T',
    version: '1.29.0',
    expiresAt: Math.floor(now / 1000) + SUB_EVENT_TTL_DAYS * 86400,
  });
  // A `since` DAY sorts before every instant on that day, so the range query
  // the report runs includes the whole of it.
  assert.ok(item.SK >= '2026-09-25');
  assert.deepEqual(subEventRow(item), {
    route: 'sub', at: item.at, day: '2026-09-25', cohort: '2026-09-16',
    platform: 'I', plan: 'F', planName: 'founder-yearly', tier: 'T', version: '1.29.0',
  });
});

test('only the three subscription routes are logged, and missing parts stay null', () => {
  const { subEventItem } = require('../lambdas/ping/main.js');
  const now = Date.parse('2026-09-25T13:47:12Z');
  assert.equal(subEventItem('OPEN', decodeCohort('D091626I'), now, 'x'), null);
  assert.equal(subEventItem('HRV', decodeCohort('D091626IB'), now, 'x'), null);
  assert.equal(subEventItem('RST', decodeCohort('D091626IY'), now, 'x').route, 'rst');
  assert.equal(subEventItem('LAP', decodeCohort('D091626IM'), now, 'x').route, 'lap');
  // An older build: no plan, tier or version. Recorded as unknown, not guessed.
  const old = subEventItem('SUB', decodeCohort('D091626I'), now, 'x');
  assert.equal(old.plan, null);
  assert.equal(old.tier, null);
  assert.equal(old.version, null);
});
