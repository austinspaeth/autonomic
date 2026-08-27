/**
 * The watches that are not an Apple Watch.
 *
 * A registry, the way `lib/registry.ts` is for entry types: each brand declares
 * the companion app its readings travel through, the models known to log
 * beat-to-beat intervals, and the one caveat worth saying out loud. Adding a
 * brand is a row here — never a branch at a call site.
 *
 * Why they share ONE accuracy tier with the Apple Watch: every one of them
 * reads from the wrist with an optical sensor, and ranking Garmin against Pixel
 * would be false precision. The strap stays the recommendation, and that is the
 * only distinction the picker draws.
 *
 * EVERY brand is listed on every platform. The list is what a user scans to
 * find the watch on their own wrist, so a brand missing from it reads as "not
 * supported" — which is a harder wrong answer to recover from than a caveat on
 * the setup card saying what that pairing actually needs. How a reading travels
 * is per-brand and not uniform (some talk to the app directly, some go through
 * the platform health store), so it is stated on the brand's own card and never
 * as one claim over the whole list.
 *
 * Pure module — no store, no native, no `Platform` import. The caller passes the
 * platform in, which is what makes this testable and what keeps the copy for
 * "where the reading lands" (Apple Health vs Health Connect) in one place.
 */

export type WatchBrandId = 'garmin' | 'samsung' | 'pixel' | 'fitbit';
export type WatchPlatform = 'ios' | 'android';

export interface WatchBrand {
  id: WatchBrandId;
  name: string;
  /** One word for the collapsed "Other watches" row, where four have to fit. */
  short: string;
  /** The list row's second line. Model families, not a sentence. */
  models: string;
  /** The companion app the reading actually travels through. */
  app: string;
  /**
   * How a reading gets here. `'direct'` means the watch talks to Autonomic
   * itself (Garmin's Connect IQ link) and there is no health store in the path
   * at all; `'health'` means the companion app hands off to Apple Health /
   * Health Connect. This is the reason the list-level copy stays generic — the
   * two routes need different steps and a different action.
   */
  transport: 'direct' | 'health';
  /** Steps for the direct route, when there is one. `connectSteps` falls back
   *  to the health-store steps whenever the direct link isn't available (a
   *  platform without the native module, say). */
  directSteps?: { title: string; sub: string }[];
  /** Deep link into that app, and where to get it when it isn't installed. */
  scheme: string;
  store: Record<WatchPlatform, string>;
  /** Models known to log beat-to-beat intervals, as chips. */
  /**
   * Models we have actually taken a reading on. Kept separate from `likely`
   * because "we tested this" and "this ought to work" are different promises,
   * and a user choosing a watch on our say-so deserves to know which one they
   * are getting.
   */
  verified: string[];
  /** Right sensor, right companion app, but untested by us. */
  likely: string[];
  /** The one caveat under the chips. Older watches sync heart rate only. */
  caveat: string;
  /**
   * Shown in the brand list at all. Only Garmin is wired end to end today; the
   * others have their health-store copy written but no one has taken a reading
   * through them, and offering an untested route as though it were finished is
   * how you get a bug report that is really a broken promise.
   */
  listed?: boolean;
  /** Flagged in the list, so the user knows what they are opting into. */
  experimental?: boolean;
  /**
   * Platforms where Autonomic can talk to this brand's watch DIRECTLY, with no
   * health store in between — today that is the Connect IQ companion link on
   * iOS. A direct link is strictly better where it exists: it carries the raw
   * beat-to-beat series rather than a summary, and it can run a POTS test live
   * instead of importing one afterwards. The health-store route below stays as
   * the fallback for everyone who has not installed the watch app.
   */
  direct?: WatchPlatform[];
}

const BRANDS: WatchBrand[] = [
  {
    id: 'garmin',
    name: 'Garmin',
    short: 'Garmin',
    models: 'Forerunner, Venu, fēnix',
    app: 'Garmin Connect',
    transport: 'direct',
    directSteps: [
      {
        title: 'Install Autonomic on the watch',
        sub: 'From the Connect IQ store. It is the app that reads beat to beat and sends it over.',
      },
      {
        title: 'Pick your watch in Garmin Connect',
        sub: 'The button below hands you to Garmin Connect to choose it, then comes straight back here.',
      },
      {
        title: 'Start the reading on the watch',
        sub: 'The watch sends the whole reading over when it finishes. No health store in the middle, and nothing for you to sync.',
      },
    ],
    scheme: 'garminconnect://',
    store: {
      ios: 'https://apps.apple.com/app/garmin-connect/id583446403',
      android: 'https://play.google.com/store/apps/details?id=com.garmin.android.apps.connectmobile',
    },
    direct: ['ios', 'android'],
    listed: true,
    experimental: true,
    verified: ['Venu 4'],
    likely: ['Forerunner 255 / 265 / 955 / 965', 'fēnix 6 and newer', 'Venu 2 / 3', 'Vívoactive 4 / 5', 'Epix Pro'],
    caveat: 'Right sensor, not yet tested by us. Older models without beat to beat logging sync heart rate only.',
  },
  {
    id: 'samsung',
    name: 'Samsung Galaxy',
    short: 'Samsung',
    models: 'Watch 4 and newer',
    app: 'Samsung Health',
    transport: 'health',
    scheme: 'shealth://',
    store: {
      ios: '',
      android: 'https://play.google.com/store/apps/details?id=com.sec.android.app.shealth',
    },
    verified: [],
    likely: ['Galaxy Watch 4 / 5', 'Watch 6 / 7', 'Watch Ultra'],
    caveat: 'Samsung Health only shares with Health Connect on Android. A Galaxy Watch paired to an iPhone cannot reach Apple Health.',
  },
  {
    id: 'pixel',
    name: 'Google Pixel Watch',
    short: 'Pixel',
    models: 'Pixel Watch 1, 2 and 3',
    app: 'Fitbit',
    transport: 'health',
    scheme: 'fitbit://',
    store: {
      ios: '',
      android: 'https://play.google.com/store/apps/details?id=com.fitbit.FitbitMobile',
    },
    verified: [],
    likely: ['Pixel Watch', 'Pixel Watch 2', 'Pixel Watch 3'],
    caveat: 'The Pixel Watch logs through the Fitbit app, so the permission you are looking for is under Fitbit, not Google.',
  },
  {
    id: 'fitbit',
    name: 'Fitbit',
    short: 'Fitbit',
    models: 'Sense, Versa, Charge 5+',
    app: 'Fitbit',
    transport: 'health',
    scheme: 'fitbit://',
    store: {
      ios: 'https://apps.apple.com/app/fitbit/id462638897',
      android: 'https://play.google.com/store/apps/details?id=com.fitbit.FitbitMobile',
    },
    verified: [],
    likely: ['Sense / Sense 2', 'Versa 3 / 4', 'Charge 5 / 6', 'Inspire 3'],
    caveat: 'Fitbit records heart-rate variability overnight rather than on demand, so a daytime reading may not appear until the next sync.',
  },
];

/** Every brand, in the order the list shows them. */
/**
 * Does this BLE advertisement look like a WATCH broadcasting its heart rate,
 * rather than a chest strap?
 *
 * A Garmin watch in "Broadcast Heart Rate" mode advertises the standard
 * heart-rate service and looks exactly like a strap to a scan — but it sends
 * only a pulse rate, with NO beat-to-beat intervals. Pairing one as a strap
 * produces a reading that cannot be scored: the capture runs, the number moves,
 * and no RR series ever arrives.
 *
 * Deliberately matches watch FAMILIES rather than the word "Garmin": Garmin's
 * own HRM-Pro and HRM-Dual are real straps and do send RR, so they must keep
 * working here.
 */
const WATCH_FAMILIES = [
  'venu', 'forerunner', 'fenix', 'fēnix', 'vivoactive', 'vívoactive',
  'epix', 'instinct', 'marq', 'enduro', 'descent', 'galaxy watch',
  'pixel watch', 'apple watch',
];

export function looksLikeWatchBroadcast(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return WATCH_FAMILIES.some((f) => n.includes(f));
}

/** Split a scan into the straps a reading can use and the watches that must
 *  not be paired as one. BOTH scan lists go through this (the HRV source
 *  picker and Settings -> Devices), so neither can forget the rule: a watch
 *  broadcasting heart rate advertises exactly like a strap, connects happily,
 *  and then delivers a reading with no beat-to-beat intervals to score. The
 *  watches are returned rather than dropped so the caller can point the user
 *  at the route that does work. */
export function partitionStraps<T extends { name?: string | null }>(list: T[]): { straps: T[]; watches: T[] } {
  const straps: T[] = [];
  const watches: T[] = [];
  for (const d of list) (looksLikeWatchBroadcast(d.name) ? watches : straps).push(d);
  return { straps, watches };
}

export function watchBrands(): WatchBrand[] {
  // Only brands wired end to end. See `listed` on WatchBrand.
  return BRANDS.filter((b) => b.listed);
}

/** Whether this brand can be reached directly on that platform. */
export function hasDirectLink(brand: WatchBrand, platform: WatchPlatform): boolean {
  return (brand.direct || []).includes(platform);
}

export function watchBrand(id: WatchBrandId): WatchBrand | undefined {
  return BRANDS.find((b) => b.id === id);
}

/** The list row's second line for the collapsed "Other watches" row. */
export function brandNames(): string {
  return BRANDS.map((b) => b.short).join(', ');
}

/**
 * The three steps to connect one brand. `direct` says the brand's own link is
 * actually available here (the native module is built in), which is a runtime
 * fact the caller owns — a brand declaring `transport: 'direct'` on a platform
 * that cannot do it still has to fall back to the health store.
 *
 * `hub` is the platform health store's
 * own name (`healthAppName()`), passed in so this module stays pure — the whole
 * path is "watch → companion app → health store → here", and naming the wrong
 * store is the one thing that makes these steps useless.
 */
export function connectSteps(brand: WatchBrand, hub: string, direct = false): { title: string; sub: string }[] {
  if (direct && brand.directSteps) return brand.directSteps;
  return [
    {
      title: `Wear the watch and open ${brand.app}`,
      sub: `Your watch has to be syncing with ${brand.app} on this phone before anything else will work.`,
    },
    {
      title: `Let ${brand.app} share with ${hub}`,
      sub: `In ${brand.app}, turn on heart rate and heart rate variability. Anything you leave off will not reach Autonomic.`,
    },
    {
      title: 'Come back here and take a reading',
      sub: 'Sit still, the same as you would with a chest strap. The watch does the measuring.',
    },
  ];
}
