/**
 * Store billing bridge (StoreKit 2 on iOS, Google Play Billing on Android) —
 * a tiny external store (mirrors src/store/store.ts) that tracks whether the
 * user holds a Pro subscription. React reads it through `useIap()`; the rest
 * of the app never touches expo-iap directly.
 *
 * Model: two auto-renewable plans (yearly / monthly) — one subscription group
 * on the App Store, two subscription products with matching IDs on Google
 * Play. Holding *either* is Pro. Freemium gating happens a layer up:
 * src/store/tier.ts folds `isPro` together with the local 14-day trial window
 * into a Tier, and locked surfaces raise the PaywallCard sheet on demand.
 *
 * Fails open: any store error leaves `isPro` at its last known value and
 * never throws into the UI, so a store hiccup can't brick the app. It also
 * never *grants* Pro on error — entitlement only flips true on a real
 * active-entitlement hit (or a fresh purchase).
 *
 * Billing lib: **expo-iap** (Play Billing 8 on Android, StoreKit 2 on iOS).
 * Native module — requires a dev/EAS build, not Expo Go, and a rebuild after
 * install (the runtime fingerprint changes; this can't ship as an OTA update).
 */
import { useSyncExternalStore } from 'react';
import { AppState as RNAppState, Platform } from 'react-native';
import {
  initConnection, endConnection, fetchProducts, getAvailablePurchases,
  requestPurchase, finishTransaction, deepLinkToSubscriptions,
  purchaseUpdatedListener, purchaseErrorListener,
  type ProductSubscription, type ProductSubscriptionAndroidOfferDetails,
  type ExpoPurchaseError,
} from 'expo-iap';
import { isSideloadedAndroidBuild, isTestFlightBuild } from '../../modules/app-env';
import { logError } from '../lib/diagnostics/errorLog';

/** Product IDs — identical in App Store Connect and the Play Console. On the
 *  App Store: one subscription group holding both plans. On Google Play: two
 *  subscription products, each with one base plan. The two must be listed
 *  together in fetchProducts.
 *
 *  NEITHER STORE CARRIES A FREE-TRIAL INTRO OFFER TODAY. The only free access
 *  is the app's own local window (`TRIAL_DAYS`, src/lib/tier.ts), which needs
 *  no store involvement. `hasTrial()` is therefore false in production and the
 *  paywall says "Upgrade to Pro" — that is the expected state, not a fetch
 *  that came back thin. Nothing hardcodes a trial length: if an offer is ever
 *  configured, `trialDaysOf` reads its real length off the product and the
 *  copy follows on builds already shipped. */
export const YEARLY_SKU = 'com.autonomic.journal.yearly';
export const MONTHLY_SKU = 'com.autonomic.journal.monthly';
/**
 * The half-off year behind the annual offer card (src/lib/upsell/annual). A
 * SEPARATE product rather than a discount on YEARLY_SKU: Apple can only target
 * a price cut on an existing product through server-signed promotional offers,
 * and the app has no signing endpoint. The consequence to remember is that this
 * plan RENEWS at its own price — it is "half off, locked in", not "half off the
 * first year". Same Apple subscription group as the other two, so a user can
 * only ever hold one; its own Play subscription with a `yearly-promo` base plan.
 * Never listed on the paywall — the offer card is its only door.
 */
export const PROMO_YEARLY_SKU = 'com.autonomic.journal.yearly.promo';
export const PRO_SKUS = [YEARLY_SKU, MONTHLY_SKU, PROMO_YEARLY_SKU];

/**
 * The founding-member card's product.
 *
 * It is the SAME discounted year the annual offer card sells
 * (`PROMO_YEARLY_SKU`), on both platforms, and that is a deliberate retreat
 * from an iOS introductory offer on the standard yearly plan. An introductory
 * offer belongs to the PRODUCT, not to the card: every StoreKit-eligible user
 * would have been given the same first year from the ordinary paywall, so the
 * card could prompt but never hold something back. Apple has no mechanism that
 * targets a never-subscribed user — promotional and win-back offers are for
 * current or lapsed subscribers, and both need a server-signed key this app
 * has no endpoint for. A separate SKU is the only exclusive discount there is.
 *
 * The trade is that a separate SKU RENEWS at its own price rather than
 * reverting to $49.99, so this is a permanently discounted year rather than a
 * discounted first one. The card's copy says so, and `FounderOffer` derives
 * every number from the two prices the store actually returned.
 */
export const FOUNDER_SKU = PROMO_YEARLY_SKU;
const isProSku = (id?: string) => !!id && PRO_SKUS.includes(id);

/** Fallback prices shown before the store returns the localized ones. */
export const FALLBACK_PRICE: Record<string, string> = {
  [YEARLY_SKU]: '$49.99', [MONTHLY_SKU]: '$7.99', [PROMO_YEARLY_SKU]: '$24.99',
};

/** User-facing store name for UI copy. */
export const storeName = () => (Platform.OS === 'android' ? 'Google Play' : 'App Store');

/** Our own app id — Play's manage-subscriptions deep link needs it. */
const ANDROID_PACKAGE = 'com.autonomic.journal';

/* ---------- product display helpers (both platforms) ---------- */

/** Our normalized view of a store subscription. The app only needs the SKU, the
 *  recurring price to show, and whether it carries a free trial — so we keep
 *  consumers decoupled from expo-iap's product shape (which keys the SKU as
 *  `id`, not `productId`). */
export type IapProduct = {
  productId: string;
  displayPrice: string;   // localized recurring price
  trial: boolean;         // carries a free-trial intro offer for this user
  raw: ProductSubscription;
};

const androidOffers = (p: ProductSubscription): ProductSubscriptionAndroidOfferDetails[] =>
  (p.platform === 'android' ? p.subscriptionOfferDetailsAndroid : []) || [];

/** Play Billing marks a free-trial pricing phase with a zero price. */
const offerHasTrial = (o: ProductSubscriptionAndroidOfferDetails) =>
  o.pricingPhases.pricingPhaseList.some((ph) => Number(ph.priceAmountMicros) === 0);

/** The offer to buy on Android: the free-trial offer when Play says this user
 *  is eligible (ineligible offers are filtered out of the product details),
 *  otherwise the base plan. */
const bestAndroidOffer = (p: ProductSubscription | undefined): ProductSubscriptionAndroidOfferDetails | undefined => {
  if (!p) return undefined;
  const offers = androidOffers(p);
  return offers.find(offerHasTrial) ?? offers[0];
};

/** Localized recurring price of a plan, from whichever store returned it. */
const recurringPrice = (p: ProductSubscription, sku: string): string => {
  if (p.platform === 'ios') return p.displayPrice || FALLBACK_PRICE[sku];
  const phases = bestAndroidOffer(p)?.pricingPhases.pricingPhaseList || [];
  const paid = phases.find((ph) => Number(ph.priceAmountMicros) > 0);
  return paid?.formattedPrice || p.displayPrice || FALLBACK_PRICE[sku];
};

/** Does this plan carry an introductory free trial for this user? */
const productHasTrial = (p: ProductSubscription): boolean => {
  if (p.platform === 'ios') return p.introductoryPricePaymentModeIOS === 'free-trial';
  return androidOffers(p).some(offerHasTrial);
};

const normalize = (p: ProductSubscription): IapProduct => ({
  productId: p.id,
  displayPrice: recurringPrice(p, p.id),
  trial: productHasTrial(p),
  raw: p,
});

/** Localized recurring price of a plan (used by the paywall). */
export const priceOf = (product: IapProduct | undefined, sku: string): string =>
  product?.displayPrice || FALLBACK_PRICE[sku];

/** Does this plan carry an introductory free trial for this user? */
export const hasTrial = (product: IapProduct | undefined): boolean => !!product?.trial;

/**
 * Length in days of the STORE's free-trial intro offer on a plan, or null.
 *
 * Read from the product rather than hardcoded, because it is not ours to state:
 * the app's own full-access window is TRIAL_DAYS (src/lib/tier.ts, local, no
 * store involved), while this one is whatever App Store Connect / the Play
 * Console says, and the two have been different numbers. The paywall used to
 * print "7-day free trial" beside a `hasTrial()` boolean, which quietly became
 * a false claim the moment either side moved. Null when the store didn't say,
 * and the caller then drops the number rather than inventing one.
 */
const PERIOD_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
export const trialDaysOf = (product: IapProduct | undefined): number | null => {
  const raw = product?.raw;
  if (!raw || !product?.trial) return null;
  if (raw.platform === 'ios') {
    const unit = PERIOD_DAYS[raw.introductoryPriceSubscriptionPeriodIOS || ''];
    const n = Number(raw.introductoryPriceNumberOfPeriodsIOS);
    return unit && Number.isFinite(n) && n > 0 ? unit * n : null;
  }
  // Play states the free phase as an ISO-8601 duration ("P1W", "P14D").
  const free = bestAndroidOffer(raw)?.pricingPhases.pricingPhaseList
    .find((ph) => Number(ph.priceAmountMicros) === 0);
  const m = free?.billingPeriod?.match(/^P(?:(\d+)W)?(?:(\d+)D)?$/);
  if (!m) return null;
  const days = (Number(m[1] || 0) * 7) + Number(m[2] || 0);
  return days > 0 ? days : null;
};

/** Let a local dev build through the paywall so you're never locked out of your
 *  own app before the products exist in App Store Connect. */
const BYPASS_IN_DEV = true;

/** Let TestFlight builds through the paywall too, so beta testers can use the
 *  app before the App Store Connect subscription products exist. TestFlight and
 *  the App Store ship the *same* production binary, so we can't key this off a
 *  build flag — we detect the sandbox receipt at runtime (see modules/app-env).
 *  The real App Store build has a production receipt and stays gated. */
const BYPASS_IN_TESTFLIGHT = true;

/** Android twin of the TestFlight bypass: builds that Google Play did not
 *  install (adb / shared APKs — internal test builds) can't purchase through
 *  Play Billing at all, so gating them would hard-lock testers out. Play
 *  installs are unaffected — their installer is com.android.vending. */
const BYPASS_IN_SIDELOAD = true;

/** Whether this build should skip the paywall entirely (treated as Pro). */
const shouldBypassPaywall = () =>
  (BYPASS_IN_DEV && __DEV__) ||
  (BYPASS_IN_TESTFLIGHT && isTestFlightBuild()) ||
  (BYPASS_IN_SIDELOAD && isSideloadedAndroidBuild());

/** Is this build's Pro status granted by a bypass above rather than by the
 *  store? The cohort ping asks, because a dev/TestFlight/sideload build is
 *  `isPro` without anyone having paid, and counting those as conversions
 *  would make the number meaningless. */
export const paywallBypassed = () => shouldBypassPaywall();

/** TEMP (dev only): force the paywall to show with fallback prices and no
 *  store calls, so it can be previewed in a simulator without a native
 *  rebuild. Leave false in committed code. */
const PREVIEW_PAYWALL = false;

type IapState = {
  ready: boolean;
  isPro: boolean;
  products: IapProduct[];   // yearly + monthly, in that order
  activeSku?: string;       // which plan is currently entitled (if any)
  purchasing: boolean;
  /** Last purchase failure, in the user's words. Cleared when a purchase
   *  starts. Never set for a user cancellation — that isn't a failure. */
  error?: string;
};
let state: IapState = { ready: false, isPro: false, products: [], purchasing: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<IapState>) => { state = { ...state, ...p }; emit(); };

let purchaseSub: { remove: () => void } | undefined;
let errorSub: { remove: () => void } | undefined;
let started = false;
/** True only after a successful `initConnection()`. Kept separate from
 *  `started` so a connection that failed at launch (Play services not ready on
 *  a cold boot, no network) can be retried when the user actually taps buy —
 *  otherwise the app spends the whole session with no products, and every tap
 *  on Upgrade is a silent no-op. */
let connected = false;

const storeUnavailable = () =>
  (Platform.OS !== 'ios' && Platform.OS !== 'android') || shouldBypassPaywall() || (__DEV__ && PREVIEW_PAYWALL);

/** Play's billing service is a BOUND SERVICE, and the binding does not survive
 *  the Play Store updating itself, the process being backgrounded for a while,
 *  or a transient failure at cold start. Once it drops, every call fails with
 *  "Billing client not ready" (`service-error` / `service-disconnected`) until
 *  something calls initConnection again — which nothing did. That is how a
 *  reachable, correctly-configured store still produced a paywall whose button
 *  did nothing for a whole session. Anything below that talks to the store goes
 *  through `withBilling`, which reconnects once and retries. */
const NOT_READY = new Set(['service-error', 'service-disconnected', 'connection-closed', 'not-prepared', 'init-connection']);
const isDisconnected = (e: unknown) =>
  NOT_READY.has(codeOf(e)) || /not ready|disconnect/i.test(String((e as Error)?.message ?? ''));

/** Re-establish the billing connection for real.
 *
 *  Calling `initConnection()` again is NOT enough on Android: expo-iap's native
 *  module short-circuits it on a cached `connectionReady` flag (ExpoIapModule.kt)
 *  that a service disconnect never clears — only `endConnection()` (or the
 *  module being destroyed) does. So a plain retry resolves `true` against a dead
 *  binding and the next call fails "Billing client not ready" all over again,
 *  which is precisely why this never self-healed. Tear down, then connect. */
async function reconnect() {
  connected = false;
  try { await endConnection(); } catch { /* nothing to tear down */ }
  await connect();
}

/** Run a store call, re-establishing a dropped connection once and retrying. */
async function withBilling<T>(fn: () => Promise<T>): Promise<T> {
  await connect();
  try {
    return await fn();
  } catch (e) {
    if (!isDisconnected(e)) throw e;
    await reconnect();
    return fn();
  }
}

/** Connect once, register the purchase listeners once. Throws on failure so
 *  callers can report it; leaves `connected` false so the next call retries. */
async function connect() {
  if (connected) return;
  await initConnection();   // expo-iap is StoreKit 2 on iOS by default
  connected = true;
  if (!purchaseSub) {
    purchaseSub = purchaseUpdatedListener(async (purchase) => {
      // Fires on a new purchase, a trial start, and each renewal.
      // Android can deliver PENDING purchases (e.g. cash top-up pending);
      // don't grant Pro or acknowledge until it completes.
      if (purchase.purchaseState === 'pending') return;
      try { await finishTransaction({ purchase, isConsumable: false }); } catch { /* already finished */ }
      set({ isPro: true, activeSku: purchase.productId, purchasing: false, error: undefined });
    });
  }
  if (!errorSub) {
    errorSub = purchaseErrorListener((e) => {
      // The store's own failure path (Play's dialog closing on an error, a
      // declined card). A cancel is not a failure and says nothing.
      if (isCancel(e)) { set({ purchasing: false }); return; }
      logError('iap.purchaseError', e);
      set({ purchasing: false, error: purchaseMessage(e) });
    });
  }
}

/** Fetch the subscription products, if we don't already hold them. Throws. */
async function loadProducts(): Promise<IapProduct[]> {
  if (state.products.length) return state.products;
  const fetched = (await withBilling(
    () => fetchProducts({ skus: PRO_SKUS, type: 'subs' }),
  )) as ProductSubscription[] | null;
  const products = (fetched || [])
    .map(normalize)
    // Keep a stable order: yearly first, then monthly.
    .sort((a, b) => PRO_SKUS.indexOf(a.productId) - PRO_SKUS.indexOf(b.productId));
  set({ products });
  return products;
}

/** Call once at app start. Dev/TestFlight builds resolve straight to Pro. */
export async function initIap() {
  if (started) return;
  started = true;
  if (__DEV__ && PREVIEW_PAYWALL) { set({ ready: true, isPro: false, products: [] }); return; }
  if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || shouldBypassPaywall()) {
    set({ ready: true, isPro: true });
    return;
  }
  // Play Billing is frequently not up yet at cold start ("Billing client not
  // ready"), so a single attempt at launch is a coin flip — and losing it used
  // to cost the whole session. Back off and try again; the user isn't waiting
  // on this (`ready` is set after the first attempt so the UI never blocks).
  for (let attempt = 0; attempt < INIT_ATTEMPTS; attempt += 1) {
    try {
      await loadProducts();
      await refreshEntitlement();
      break;
    } catch (e) {
      // Not fatal: treated as not-Pro (the paywall shows, the app is not
      // bricked). Logged because "it says I'm not subscribed" arrives with no
      // other evidence. Only the last attempt is logged, so a cold-start
      // hiccup that heals on retry doesn't flush the 40-entry support log.
      if (attempt === INIT_ATTEMPTS - 1) logError('iap.init', e);
      else await delay(INIT_BACKOFF_MS[attempt]);
    } finally {
      set({ ready: true });
    }
  }
  // The billing connection also dies while the app is backgrounded. Re-heal on
  // the way back in, rather than at the moment the user taps buy.
  try {
    RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void ensureIapReady();
      void refreshEntitlement();
    });
  } catch { /* no AppState here (jest / bare node) */ }
}

const INIT_ATTEMPTS = 3;
const INIT_BACKOFF_MS = [1_500, 5_000];
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Re-attempt the store connection + product fetch. Called when the paywall
 *  opens, so a card raised after a failed launch still has real prices and a
 *  working button. Silent: the card shows fallback prices either way. */
export async function ensureIapReady() {
  if (storeUnavailable() || state.products.length) return;
  try { await loadProducts(); } catch (e) { logError('iap.retryProducts', e); }
}

/** Active entitlements only — StoreKit 2 currentEntitlements on iOS, the
 *  owned-purchase query on Android — so presence of either SKU (not pending)
 *  == an active entitlement (paid or in the free-trial window). */
export async function refreshEntitlement(): Promise<boolean> {
  if (__DEV__ && PREVIEW_PAYWALL) return false;   // preview: never call the store
  if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || shouldBypassPaywall()) return state.isPro;
  try {
    const active = await withBilling(() => getAvailablePurchases(
      Platform.OS === 'ios' ? { onlyIncludeActiveItemsIOS: true } : undefined,
    ));
    const hit = (active || []).find((p) => isProSku(p.productId) && p.purchaseState !== 'pending');
    set({ isPro: !!hit, activeSku: hit?.productId });
  } catch (e) { logError('iap.entitlement', e); /* keep last known entitlement */ }
  return state.isPro;
}

/* ---------- failure reporting ----------
 * A purchase that fails silently is indistinguishable from a dead button, and
 * that is exactly how this reached a user's phone: `subscribe()` swallowed
 * every error, so an empty product list (a store connection that never came
 * up, a plan not live in the console) made "Upgrade to Pro" do nothing at all,
 * with nothing in the support dump either. Every failure below now lands in
 * `state.error` AND in the error log. */

const codeOf = (e: unknown): string =>
  String((e as ExpoPurchaseError | undefined)?.code ?? '');

/** Backing out of the store's own sheet. Not a failure, and says nothing. */
const isCancel = (e: unknown) => {
  const c = codeOf(e).toLowerCase();
  return c.includes('cancel') || /cancell?ed/i.test(String((e as Error)?.message ?? ''));
};

/** What to tell the user. Deliberately plain, and always ending somewhere they
 *  can act — the store's name, or "try again". */
function purchaseMessage(e: unknown): string {
  const store = storeName();
  switch (codeOf(e)) {
    case 'network-error':
    case 'service-timeout':
      return `Couldn’t reach ${store}. Check your connection and try again.`;
    case 'billing-unavailable':
    case 'iap-not-available':
    case 'service-disconnected':
    case 'service-error':
      return `${store} isn’t available on this device right now. Make sure you’re signed in to ${store}, then try again.`;
    case 'item-unavailable':
    case 'sku-not-found':
    case 'query-product':
      return `This plan isn’t available on your ${store} account yet. Try again shortly.`;
    case 'already-owned':
    case 'duplicate-purchase':
      return 'You already have a subscription. Tap Restore purchase.';
    case 'deferred-payment':
    case 'pending':
      return `${store} is still processing this purchase. Pro unlocks as soon as it clears.`;
    case 'developer-error':
      return `${store} rejected the request for this plan. Please contact support.`;
    default: {
      const m = String((e as Error)?.message ?? '').trim();
      return m ? `Purchase couldn’t start: ${m}` : 'Purchase couldn’t start. Please try again.';
    }
  }
}

/** Clear a stale failure (e.g. when the paywall re-opens). */
export const clearIapError = () => { if (state.error) set({ error: undefined }); };

/** Start the subscribe/free-trial flow for a specific plan. Success arrives via
 *  the listener. Defaults to yearly. Resolves true when the store flow was
 *  handed off; false when it couldn't start (and `state.error` says why). */
export async function subscribe(sku: string = YEARLY_SKU): Promise<boolean> {
  if (state.purchasing) return false;
  set({ purchasing: true, error: undefined });
  try {
    if (storeUnavailable()) throw new Error(`${storeName()} purchases aren’t available in this build.`);
    // Retry the connection/fetch here rather than trusting launch: on Android
    // the Play Billing connection often isn't up yet at cold start. A plan the
    // launch fetch missed is also re-fetched here, so a session that started
    // with no products can still buy.
    let products = await loadProducts();
    // Play offer tokens belong to the ProductDetails they came from, and the
    // ones we cached are stale after a reconnect (or simply old, in a session
    // left open for days). If the plan is missing a usable offer, re-query
    // before deciding it can't be bought.
    if (Platform.OS === 'android' && !bestAndroidOffer(products.find((s) => s.productId === sku)?.raw)) {
      set({ products: [] });
      products = await loadProducts();
    }
    if (Platform.OS === 'android') {
      // Play Billing needs the chosen offer's token alongside the sku.
      const product = products.find((s) => s.productId === sku)?.raw;
      const offer = bestAndroidOffer(product);
      if (!offer) {
        throw Object.assign(
          new Error(product ? `No purchasable offer on ${sku}` : `${sku} not returned by Google Play`),
          { code: product ? 'sku-offer-mismatch' : 'sku-not-found' },
        );
      }
      await withBilling(() => requestPurchase({
        type: 'subs',
        request: { google: { skus: [sku], subscriptionOffers: [{ sku, offerToken: offer.offerToken }] } },
      }));
    } else {
      await withBilling(() => requestPurchase({ type: 'subs', request: { apple: { sku } } }));
    }
    // The store sheet is up. purchasing clears on the purchase or error
    // listener; the watchdog below covers a flow that ends with neither
    // (backing out of Play's sheet doesn't always emit an error), which would
    // otherwise leave the button stuck on "Starting…" for the whole session.
    armPurchaseWatchdog();
    return true;
  } catch (e) {
    if (isCancel(e)) { set({ purchasing: false }); return false; }
    logError('iap.purchase', e);
    set({ purchasing: false, error: purchaseMessage(e) });
    return false;
  }
}

let watchdog: ReturnType<typeof setTimeout> | undefined;
function armPurchaseWatchdog() {
  if (watchdog) clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    watchdog = undefined;
    if (state.purchasing) set({ purchasing: false });
  }, 120_000);
}

/** Apple requires a visible "Restore purchases" control (harmless on Play).
 *  Reports its own outcome: a restore that finds nothing has to SAY so, or it
 *  is another button that looks broken. */
export async function restore(): Promise<boolean> {
  set({ error: undefined });
  const pro = await refreshEntitlement();
  if (!pro) set({ error: `No active subscription found on this ${storeName()} account.` });
  return pro;
}

/** Deep-link to the store's Manage-Subscriptions screen (cancel / change plan). */
export async function manageSubscription() {
  try {
    await deepLinkToSubscriptions({ skuAndroid: state.activeSku ?? YEARLY_SKU, packageNameAndroid: ANDROID_PACKAGE });
  } catch { /* best effort */ }
}

export function teardownIap() {
  purchaseSub?.remove();
  errorSub?.remove();
  purchaseSub = errorSub = undefined;
  endConnection().catch(() => {});
  started = false;
  connected = false;
}

export function useIap(): IapState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}

/** Non-React access for the watch entitlement relay (src/lib/watch). */
export const getIapState = (): IapState => state;
export function subscribeIap(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
