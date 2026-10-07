/* Passwordless sign-in, ported from landing/master/auth.js: Cognito
 * CUSTOM_AUTH (email -> 4-digit code) spoken straight to the IDP REST API.
 *
 * The sign-in email is DiscoveryMark-branded (the pool's challenge trigger
 * belongs to that stack). Its magic link will not sign you in here; the code
 * is the only way in.
 *
 * Tokens live in SecureStore, one key each, since a keychain entry holding all
 * three JWTs would brush Android's 2KB-per-value warning. */
import * as SecureStore from 'expo-secure-store';
import { CONFIG } from './config';

const K = {
  id: 'master.idToken',
  access: 'master.accessToken',
  refresh: 'master.refreshToken',
} as const;

/* Refresh a little before expiry so a request never races the clock. */
const REFRESH_MARGIN_SEC = 300;

export type Tokens = {
  idToken: string;
  accessToken: string;
  refreshToken: string | null;
  email: string;
  exp: number;
};

type AuthResult = { IdToken: string; AccessToken: string; RefreshToken?: string };

let tokens: Tokens | null = null;
let session: string | null = null;
let challengeUser: string | null = null;
let refreshing: Promise<Tokens> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function current() {
  return tokens;
}

class CognitoError extends Error {
  code = '';
  retryable = false;
}

async function cognito<T>(target: string, body: object): Promise<T> {
  const res = await fetch(CONFIG.cognitoEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const err = new CognitoError(data.message || data.__type || 'Cognito request failed.');
    err.code = String(data.__type || '').split('#').pop() || '';
    throw err;
  }
  return data as T;
}

/* Hermes has atob on current RN, but a JWT is base64url and short enough that
   a local decoder removes the question entirely. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64decode(input: string): string {
  const s = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of s) {
    const idx = B64.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return String.fromCharCode(...bytes);
  }
}

/* Not verification (the API verifies): only so the client knows who it
   thinks it is and when to refresh. */
function claimsOf(token: string): { email?: string; exp?: number } {
  try {
    return JSON.parse(b64decode(token.split('.')[1]));
  } catch {
    return {};
  }
}

async function persist(result: AuthResult): Promise<Tokens> {
  const claims = claimsOf(result.IdToken);
  tokens = {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    // A refresh response omits RefreshToken: keep the one we already hold.
    refreshToken: result.RefreshToken || tokens?.refreshToken || null,
    email: claims.email || '',
    exp: claims.exp || 0,
  };
  await Promise.all([
    SecureStore.setItemAsync(K.id, tokens.idToken),
    SecureStore.setItemAsync(K.access, tokens.accessToken),
    tokens.refreshToken ? SecureStore.setItemAsync(K.refresh, tokens.refreshToken) : null,
  ]);
  emit();
  return tokens;
}

function expired(margin = 0) {
  if (!tokens || !tokens.exp) return true;
  return tokens.exp - margin <= Math.floor(Date.now() / 1000);
}

function refresh(): Promise<Tokens> {
  if (!tokens?.refreshToken) return Promise.reject(new Error('No refresh token.'));
  if (refreshing) return refreshing;
  refreshing = cognito<{ AuthenticationResult?: AuthResult }>('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: CONFIG.clientId,
    AuthParameters: { REFRESH_TOKEN: tokens.refreshToken },
  })
    .then((data) => {
      if (!data.AuthenticationResult) throw new Error('Refresh returned no tokens.');
      return persist(data.AuthenticationResult);
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** A currently valid id token, refreshing first when it is close to expiry. */
export async function idToken(): Promise<string> {
  if (!tokens) throw new Error('Not signed in.');
  if (!expired(REFRESH_MARGIN_SEC)) return tokens.idToken;
  return (await refresh()).idToken;
}

/** Restore a stored session. Resolves true when signed in. */
export async function restore(): Promise<boolean> {
  const [id, access, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(K.id),
    SecureStore.getItemAsync(K.access),
    SecureStore.getItemAsync(K.refresh),
  ]);
  if (!id || !refreshToken) return false;
  const claims = claimsOf(id);
  tokens = {
    idToken: id,
    accessToken: access || '',
    refreshToken,
    email: claims.email || '',
    exp: claims.exp || 0,
  };
  if (!expired(REFRESH_MARGIN_SEC)) return true;
  try {
    await refresh();
    return true;
  } catch (err: any) {
    // Offline is not signed out: keep the stale token, let the API call fail.
    if (err instanceof CognitoError && err.code === 'NotAuthorizedException') {
      await signOut();
      return false;
    }
    return true;
  }
}

export async function startChallenge(email: string) {
  const data = await cognito<{ Session: string; ChallengeParameters?: { USERNAME?: string } }>(
    'InitiateAuth',
    { AuthFlow: 'CUSTOM_AUTH', ClientId: CONFIG.clientId, AuthParameters: { USERNAME: email } },
  );
  session = data.Session;
  // With PreventUserExistenceErrors on, Cognito echoes the username it accepts.
  challengeUser = data.ChallengeParameters?.USERNAME || email;
}

/** Throws with `code === 'NotAuthorizedException'` when the session is burned. */
export async function answerChallenge(code: string) {
  const data = await cognito<{ AuthenticationResult?: AuthResult; Session?: string }>(
    'RespondToAuthChallenge',
    {
      ChallengeName: 'CUSTOM_CHALLENGE',
      ClientId: CONFIG.clientId,
      Session: session,
      ChallengeResponses: { USERNAME: challengeUser, ANSWER: code },
    },
  );
  if (data.AuthenticationResult) return persist(data.AuthenticationResult);
  // Wrong code with attempts left: Cognito re-issues the challenge with a fresh
  // session. Carry it forward or the retry fails as "invalid session".
  session = data.Session || session;
  const err = new CognitoError('That code is not right. Check the email and try again.');
  err.retryable = true;
  throw err;
}

export async function signOut() {
  tokens = null;
  await Promise.all(Object.values(K).map((k) => SecureStore.deleteItemAsync(k)));
  emit();
}
