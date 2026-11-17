/**
 * App Store network failures — the pure half, so jest can pin it.
 *
 * StoreKit 2 reports a product query that never reached Apple as a bare
 * Foundation error, and openiap-apple flattens every product-query failure
 * into `query-product`, keeping only the text: "The operation couldn't be
 * completed. (NSURLErrorDomain error -1009.)". That code is the iPhone half of
 * `query-product`; `classifyPlayCode` (./billingCodes) is the Android half.
 *
 * Two things depend on reading it:
 *  - What the user is told. `query-product` alone reads "This plan isn't
 *    available on your App Store account yet", which is false for a phone
 *    that simply had no signal.
 *  - What Ping can tell us. The fault handler redacts digit runs, so
 *    "-1009" arrives as "-<n>" and offline, timed out and "cellular data off
 *    for this app" all look the same. A WORD survives redaction, so the name
 *    below rides along in the fault message.
 */

/** NSURLError codes worth naming. Values are Foundation's `NSURLError*`. */
const NSURL_NAMES: Record<number, string> = {
  [-1001]: 'timedOut',
  [-1003]: 'cannotFindHost',
  [-1004]: 'cannotConnectToHost',
  [-1005]: 'networkConnectionLost',
  [-1009]: 'notConnectedToInternet',
  [-1018]: 'internationalRoamingOff',
  [-1020]: 'dataNotAllowed',
  [-1200]: 'secureConnectionFailed',
  [-1202]: 'serverCertificateUntrusted',
};

/** The same failures when Foundation does supply its own sentence. */
const NETWORK_SENTENCES: [RegExp, string][] = [
  [/internet connection appears to be offline/i, 'notConnectedToInternet'],
  [/network connection was lost/i, 'networkConnectionLost'],
  [/request timed out/i, 'timedOut'],
  [/data connection is not currently allowed/i, 'dataNotAllowed'],
];

export type AppleNetworkFailure = {
  /** The NSURLError code, when the text carried one. */
  code?: number;
  /** A redaction-proof name for it: `nsurl-<name>`, or `nsurl-other`. */
  name: string;
};

/**
 * Read an App Store failure's text for a network failure. Returns null for
 * anything else, so a real "product not found" keeps its own message.
 */
export function appleNetworkFailure(text: string | undefined | null): AppleNetworkFailure | null {
  const t = String(text ?? '');
  const m = /NSURLErrorDomain(?:\s+error|\s+Code=)\s*(-?\d+)/i.exec(t);
  if (m) {
    const code = Number(m[1]);
    return { code, name: `nsurl-${NSURL_NAMES[code] ?? 'other'}` };
  }
  if (/NSURLErrorDomain/i.test(t)) return { name: 'nsurl-other' };
  for (const [re, name] of NETWORK_SENTENCES) {
    if (re.test(t)) return { name: `nsurl-${name}` };
  }
  return null;
}
