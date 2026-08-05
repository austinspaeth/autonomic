/**
 * Store billing bridge (StoreKit 2 on iOS, Google Play Billing on Android) —
 * a tiny external store (mirrors src/store/store.ts) that tracks whether the
 * user holds a Pro subscription. React reads it through `useIap()`; the rest
 * of the app never touches expo-iap directly.
 *
 * Model: two auto-renewable plans (yearly / monthly) — one subscription group
 * on the App Store, two subscription products with matching IDs on Google
 * Play. Holding *either* is Pro. Freemium gating happens a layer up:
 * src/store/tier.ts folds `isPro` together with the local 7-day trial window
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
import { Platform } from 'react-native';
import {
  initConnection, endConnection, fetchProducts, getAvailablePurchases,
  requestPurchase, finishTransaction, deepLinkToSubscriptions,
  purchaseUpdatedListener, purchaseErrorListener,
  type ProductSubscription, type ProductSubscriptionAndroidOfferDetails,
} from 'expo-iap';
import { isSideloadedAndroidBuild, isTestFlightBuild } from '../../modules/app-env';
import { logError } from '../lib/diagnostics/errorLog';

/** Product IDs — identical in App Store Connect and the Play Console. On the
 *  App Store: one subscription group holding both plans (with a 7-day
 *  free-trial intro offer where wanted). On Google Play: two subscription
 *  products, each with one base plan (and a 7-day free-trial offer where
 *  wanted). The two must be listed together in fetchProducts. */
export const YEARLY_SKU = 'com.autonomic.journal.yearly';
export const MONTHLY_SKU = 'com.autonomic.journal.monthly';
export const PRO_SKUS = [YEARLY_SKU, MONTHLY_SKU];
const isProSku = (id?: string) => !!id && PRO_SKUS.includes(id);

/** Fallback prices shown before the store returns the localized ones. */
export const FALLBACK_PRICE: Record<string, string> = { [YEARLY_SKU]: '$49.99', [MONTHLY_SKU]: '$7.99' };

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
};
let state: IapState = { ready: false, isPro: false, products: [], purchasing: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<IapState>) => { state = { ...state, ...p }; emit(); };

let purchaseSub: { remove: () => void } | undefined;
let errorSub: { remove: () => void } | undefined;
let started = false;

/** Call once at app start. Dev/TestFlight builds resolve straight to Pro. */
export async function initIap() {
  if (started) return;
  started = true;
  if (__DEV__ && PREVIEW_PAYWALL) { set({ ready: true, isPro: false, products: [] }); return; }
  if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || shouldBypassPaywall()) {
    set({ ready: true, isPro: true });
    return;
  }
  try {
    await initConnection();   // expo-iap is StoreKit 2 on iOS by default
    purchaseSub = purchaseUpdatedListener(async (purchase) => {
      // Fires on a new purchase, a trial start, and each renewal.
      // Android can deliver PENDING purchases (e.g. cash top-up pending);
      // don't grant Pro or acknowledge until it completes.
      if (purchase.purchaseState === 'pending') return;
      try { await finishTransaction({ purchase, isConsumable: false }); } catch { /* already finished */ }
      set({ isPro: true, activeSku: purchase.productId, purchasing: false });
    });
    errorSub = purchaseErrorListener(() => set({ purchasing: false }));
    const fetched = (await fetchProducts({ skus: PRO_SKUS, type: 'subs' })) as ProductSubscription[] | null;
    const products = (fetched || [])
      .map(normalize)
      // Keep a stable order: yearly first, then monthly.
      .sort((a, b) => PRO_SKUS.indexOf(a.productId) - PRO_SKUS.indexOf(b.productId));
    set({ products });
    await refreshEntitlement();
  } catch (e) {
    // swallow; treated as not-Pro (paywall shows, app is not bricked). Logged
    // because "it says I'm not subscribed" arrives with no other evidence.
    logError('iap.init', e);
  } finally {
    set({ ready: true });
  }
}

/** Active entitlements only — StoreKit 2 currentEntitlements on iOS, the
 *  owned-purchase query on Android — so presence of either SKU (not pending)
 *  == an active entitlement (paid or in the free-trial window). */
export async function refreshEntitlement(): Promise<boolean> {
  if (__DEV__ && PREVIEW_PAYWALL) return false;   // preview: never call the store
  if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || shouldBypassPaywall()) return state.isPro;
  try {
    const active = await getAvailablePurchases(
      Platform.OS === 'ios' ? { onlyIncludeActiveItemsIOS: true } : undefined,
    );
    const hit = (active || []).find((p) => isProSku(p.productId) && p.purchaseState !== 'pending');
    set({ isPro: !!hit, activeSku: hit?.productId });
  } catch (e) { logError('iap.entitlement', e); /* keep last known entitlement */ }
  return state.isPro;
}

/** Start the subscribe/free-trial flow for a specific plan. Success arrives via
 *  the listener. Defaults to yearly. */
export async function subscribe(sku: string = YEARLY_SKU) {
  if (state.purchasing) return;
  set({ purchasing: true });
  try {
    if (Platform.OS === 'android') {
      // Play Billing needs the chosen offer's token alongside the sku.
      const product = state.products.find((s) => s.productId === sku)?.raw;
      const offer = bestAndroidOffer(product);
      if (!offer) throw new Error('No subscription offer available');
      await requestPurchase({
        type: 'subs',
        request: { google: { skus: [sku], subscriptionOffers: [{ sku, offerToken: offer.offerToken }] } },
      });
    } else {
      await requestPurchase({ type: 'subs', request: { apple: { sku } } });
    }
  } catch {
    set({ purchasing: false });   // user cancelled or a store error
  }
}

/** Apple requires a visible "Restore purchases" control (harmless on Play). */
export async function restore(): Promise<boolean> {
  return refreshEntitlement();
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
  endConnection().catch(() => {});
  started = false;
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
