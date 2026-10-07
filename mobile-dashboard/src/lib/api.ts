/* The one endpoint: POST { action, payload } with a Cognito id token. The
   Lambda re-checks the email against its allowlist before touching anything. */
import { idToken } from './auth';
import { CONFIG } from './config';
import { expandReport } from './compact';
import type { CampaignLink, Churn, Entry, LoadResponse, PingReport, Platform, Sale, StoreVersions } from './types';

export class ApiError extends Error {
  status = 0;
}

/* A request that never answers must not hold a spinner up for ever. */
const TIMEOUT_MS = 30000;

/* XMLHttpRequest with a TEXT response, not fetch. React Native's fetch reads a
   body as a blob and converts it to text in JS, which for the usage report
   (a few MB) took the better part of a minute and held every spinner up; a
   text XHR hands the string over from the native side directly. */
function post(url: string, token: string, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'text';
    xhr.timeout = TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText || '' });
    xhr.onerror = () => reject(new ApiError('Network request failed'));
    xhr.ontimeout = () => reject(new ApiError('The request timed out'));
    xhr.send(body);
  });
}

async function call<T>(action: string, payload: object = {}): Promise<T> {
  const token = await idToken();
  const { status, text } = await post(CONFIG.apiEndpoint, token, JSON.stringify({ action, payload }));
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* gateway HTML */
  }
  if (status < 200 || status >= 300) {
    const err = new ApiError(data.error || data.message || `Request failed (${status})`);
    err.status = status;
    throw err;
  }
  return data as T;
}

export const api = {
  load: () => call<LoadResponse>('LOAD'),
  /** The usage report, asked for COMPACT (just the stored maps, gzipped) and expanded here. */
  pings: async (since: string) => expandReport(await call<any>('PINGS', { since, compact: true })),
  /** Register this phone for instant pushes (new install, sale, hard crash). */
  registerPush: (token: string, device: string) => call<{ ok: boolean; error?: string }>('PUSH_EXPO_REGISTER', { token, device }),
  testPush: () => call<{ ok: boolean }>('PUSH_EXPO_TEST'),
  storeVersions: (force = false) => call<StoreVersions>('STORE_VERSIONS', force ? { force } : {}),
  /** Applies a diff, exactly as the web dashboard's sync does. Upserts replace the whole record. */
  sync: (payload: SyncPayload) => call<{ ok?: boolean }>('SYNC', payload),
  /** Rewrites every campaign page from what is stored. */
  republishLinks: () => call<{ ok?: boolean; published?: number }>('LINKS_REPUBLISH'),
};

export type SyncPayload = {
  upserts?: Entry[];
  deletes?: { date: string; platform: Platform }[];
  saleUpserts?: Sale[];
  saleDeletes?: string[];
  churnUpserts?: Churn[];
  churnDeletes?: string[];
  linkUpserts?: CampaignLink[];
  linkDeletes?: string[];
};
