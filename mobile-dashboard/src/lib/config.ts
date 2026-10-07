/* Same constants as landing/master/config.js. None are secrets: a Cognito
   pool/client id is public by design, and the API's access control is the
   email allowlist enforced in the Lambda. */
export const CONFIG = {
  region: 'us-west-2',
  userPoolId: 'us-west-2_0YCieUoYt',
  clientId: '472fpu6vqbtu24e4m55a5dko98',
  cognitoEndpoint: 'https://cognito-idp.us-west-2.amazonaws.com/',
  apiEndpoint: 'https://api.autonomic.care/api/master',
} as const;
