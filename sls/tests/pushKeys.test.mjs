/* How the push lambda decides whether the feature is on.

   The rule under test is an ASYMMETRY, and it is the whole reason this is not
   a plain memo: a keypair once found is cached for the container's life, but
   "there are no keys" is re-checked once a minute. serverless.yml and the
   README both promise that creating the SSM parameter turns Web Push on with
   no redeploy, and that promise is false without the second half — the `api`
   container is warm exactly when somebody is setting the feature up, because
   the dashboard polls it every five minutes, so a lookup memoised once either
   way would keep answering `configured: false` long after the parameter
   existed. That reads as a parameter that did not take.

   The SSM client is stubbed rather than mocked at the network: what matters
   here is how many times the parameter is READ and what is done with each
   answer, which is exactly what a call count and a settable answer say. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

process.env.VAPID_PARAM = '/test/vapid';
process.env.DYNAMO_TABLE_NAME = 'test-table';

/* What the parameter store currently holds, and how often it was asked. */
let stored = null;
let reads = 0;

class GetParameterCommand {
  constructor(input) { this.input = input; }
}

class SSMClient {
  // eslint-disable-next-line class-methods-use-this
  async send() {
    reads += 1;
    if (stored == null) {
      const err = new Error('Parameter /test/vapid not found.');
      err.name = 'ParameterNotFound';
      throw err;
    }
    return { Parameter: { Value: stored } };
  }
}

/* The lambda requires the SSM SDK lazily, so seeding the cache under the same
   resolved path is enough — both files resolve to sls/node_modules. */
const ssmPath = require.resolve('@aws-sdk/client-ssm');
require.cache[ssmPath] = {
  id: ssmPath,
  filename: ssmPath,
  loaded: true,
  exports: { SSMClient, GetParameterCommand },
};

const push = require('../lambdas/push/main.js');

const KEYPAIR = JSON.stringify({
  publicKey: 'BPublicHalfOfTheKeypair',
  privateKey: 'thePrivateHalf',
  subject: 'mailto:austinspaeth@msn.com',
});

test('a parameter created under a warm container turns the feature on without a redeploy', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });

  /* A parameter that is not there is the DARK state and must not look like a
     fault — the hourly job would otherwise alarm about a feature nobody has
     turned on yet. */
  const errors = [];
  t.mock.method(console, 'error', (...args) => { errors.push(args); });

  assert.equal(await push.configured(), false, 'no parameter means unconfigured');
  assert.equal(await push.publicKey(), '', 'and there is no public half to hand a browser');
  assert.deepEqual(errors, [], 'ParameterNotFound is never logged as an error');

  /* Callers share one lookup rather than each buying their own. */
  const readsAfterFirst = reads;
  await push.configured();
  assert.equal(reads, readsAfterFirst, 'the dark answer is shared, not re-read per call');

  /* Austin writes the parameter. The container is still warm and still inside
     the minute, so it is entitled to keep answering from what it last saw —
     this pins that the re-check is a TTL and not a read on every single call,
     which at one GetParameter per dashboard poll would be the other failure. */
  stored = KEYPAIR;
  assert.equal(await push.configured(), false, 'still dark inside the recheck window');
  assert.equal(reads, readsAfterFirst, 'and still without another read');

  /* A minute later, with nothing redeployed and nothing cold-started. */
  t.mock.timers.tick(61_000);
  assert.equal(await push.configured(), true, 'the new parameter is picked up on its own');
  assert.equal(await push.publicKey(), 'BPublicHalfOfTheKeypair');
  assert.equal(reads, readsAfterFirst + 1, 'at the cost of exactly one more read');

  /* A hit is never re-read: a keypair only changes in a rotation, and a
     rotation invalidates every stored subscription anyway, so it is already a
     "turn it on again on each device" event rather than something a running
     container should try to follow. */
  const readsAfterHit = reads;
  stored = null;
  t.mock.timers.tick(60 * 60 * 1000);
  assert.equal(await push.configured(), true, 'a found keypair is held for the container’s life');
  assert.equal(reads, readsAfterHit, 'and costs no further reads');
});
