/* config.js — deployment constants for the master dashboard.
   Plain globals rather than a build-time inject: this app has no build step,
   and none of these are secrets (a Cognito pool/client id is public by design;
   the API's access control is the email allowlist enforced in the Lambda). */
window.AUTONOMIC_CONFIG = {
  /* DiscoveryMark's user pool, shared across the account. */
  region: 'us-west-2',
  userPoolId: 'us-west-2_0YCieUoYt',
  clientId: '472fpu6vqbtu24e4m55a5dko98',
  cognitoEndpoint: 'https://cognito-idp.us-west-2.amazonaws.com/',
  apiEndpoint: 'https://api.autonomic.care/api/master'
};
