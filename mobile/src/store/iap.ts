/**
 * StoreKit 2 bridge — a tiny external store (mirrors src/store/store.ts) that
 * tracks whether the user holds a Pro subscription. React reads it through
 * `useIap()`; the rest of the app never touches react-native-iap directly.
 *
 * Model: two auto-renewable plans (yearly / monthly) in one subscription group.
 * Holding *either* is Pro. There is no per-feature gating — `SubscriptionGate`
 * covers the whole app whenever `!isPro`, so "not Pro" simply means "no active
 * plan (trial not started / lapsed)".
 *
 * Fails open: any StoreKit error leaves `isPro` at its last known value and
 * never throws into the UI, so a store hiccup can't brick the app. It also
 * never *grants* Pro on error — entitlement only flips true on a real
 * StoreKit 2 currentEntitlements hit (or a fresh purchase).
 *
 * Native module — requires a dev/EAS build, not Expo Go, and a rebuild after
 * install (the runtime fingerprint changes; this can't ship as an OTA update).
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import {
  setup, initConnection, endConnection, getSubscriptions, requestSubscription,
  getAvailablePurchases, finishTransaction, purchaseUpdatedListener,
  purchaseErrorListener, deepLinkToSubscriptions, type Subscription,
} from 'react-native-iap';
import { isTestFlightBuild } from '../../modules/app-env';

/** App Store Connect product IDs. Create both in ASC under one subscription
 *  group (with a 7-day free-trial intro offer on whichever plans should have
 *  one). The two must be listed together in getSubscriptions. */
export const YEARLY_SKU = 'com.autonomic.journal.yearly';
export const MONTHLY_SKU = 'com.autonomic.journal.monthly';
export const PRO_SKUS = [YEARLY_SKU, MONTHLY_SKU];
const isProSku = (id?: string) => !!id && PRO_SKUS.includes(id);

/** Fallback prices shown before StoreKit returns the localized ones. */
export const FALLBACK_PRICE: Record<string, string> = { [YEARLY_SKU]: '$49.99', [MONTHLY_SKU]: '$7.99' };

/** Let a local dev build through the paywall so you're never locked out of your
 *  own app before the products exist in App Store Connect. */
const BYPASS_IN_DEV = true;

/** Let TestFlight builds through the paywall too, so beta testers can use the
 *  app before the App Store Connect subscription products exist. TestFlight and
 *  the App Store ship the *same* production binary, so we can't key this off a
 *  build flag — we detect the sandbox receipt at runtime (see modules/app-env).
 *  The real App Store build has a production receipt and stays gated. */
const BYPASS_IN_TESTFLIGHT = true;

/** Whether this build should skip the paywall entirely (treated as Pro). */
const shouldBypassPaywall = () =>
  (BYPASS_IN_DEV && __DEV__) || (BYPASS_IN_TESTFLIGHT && isTestFlightBuild());

/** TEMP (dev only): force the paywall to show with fallback prices and no
 *  StoreKit calls, so it can be previewed in a simulator without a native
 *  rebuild. Leave false in committed code. */
const PREVIEW_PAYWALL = false;

type IapState = {
  ready: boolean;
  isPro: boolean;
  products: Subscription[];   // yearly + monthly, in the order returned
  activeSku?: string;         // which plan is currently entitled (if any)
  purchasing: boolean;
};
let state: IapState = { ready: false, isPro: false, products: [], purchasing: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<IapState>) => { state = { ...state, ...p }; emit(); };

let purchaseSub: { remove: () => void } | undefined;
let errorSub: { remove: () => void } | undefined;
let started = false;

/** Call once at app start. Non-iOS and dev builds resolve straight to Pro. */
export async function initIap() {
  if (started) return;
  started = true;
  if (__DEV__ && PREVIEW_PAYWALL) { set({ ready: true, isPro: false, products: [] }); return; }
  if (Platform.OS !== 'ios' || shouldBypassPaywall()) {
    set({ ready: true, isPro: true });
    return;
  }
  try {
    setup({ storekitMode: 'STOREKIT2_MODE' });   // force StoreKit 2 semantics
    await initConnection();
    purchaseSub = purchaseUpdatedListener(async (purchase) => {
      // Fires on a new purchase, a trial start, and each renewal.
      try { await finishTransaction({ purchase, isConsumable: false }); } catch { /* already finished */ }
      set({ isPro: true, activeSku: purchase.productId, purchasing: false });
    });
    errorSub = purchaseErrorListener(() => set({ purchasing: false }));
    const subs = await getSubscriptions({ skus: PRO_SKUS });
    // Keep a stable order: yearly first, then monthly.
    subs.sort((a, b) => PRO_SKUS.indexOf(a.productId) - PRO_SKUS.indexOf(b.productId));
    set({ products: subs });
    await refreshEntitlement();
  } catch {
    // swallow; treated as not-Pro (paywall shows, app is not bricked)
  } finally {
    set({ ready: true });
  }
}

/** StoreKit 2 currentEntitlements only returns *active* items, so presence of
 *  either SKU == an active entitlement (paid or in the free-trial window). */
export async function refreshEntitlement(): Promise<boolean> {
  if (__DEV__ && PREVIEW_PAYWALL) return false;   // preview: never call StoreKit
  if (Platform.OS !== 'ios' || shouldBypassPaywall()) return state.isPro;
  try {
    const active = await getAvailablePurchases({ onlyIncludeActiveItems: true });
    const hit = active.find((p) => isProSku(p.productId));
    set({ isPro: !!hit, activeSku: hit?.productId });
  } catch { /* keep last known entitlement */ }
  return state.isPro;
}

/** Start the subscribe/free-trial flow for a specific plan. Success arrives via
 *  the listener. Defaults to yearly. */
export async function subscribe(sku: string = YEARLY_SKU) {
  if (state.purchasing) return;
  set({ purchasing: true });
  try {
    await requestSubscription({ sku });
  } catch {
    set({ purchasing: false });   // user cancelled or a store error
  }
}

/** Apple requires a visible "Restore purchases" control. */
export async function restore(): Promise<boolean> {
  return refreshEntitlement();
}

/** Deep-link to the system Manage-Subscriptions sheet (cancel / change plan). */
export async function manageSubscription() {
  try { await deepLinkToSubscriptions({ sku: state.activeSku ?? YEARLY_SKU }); } catch { /* best effort */ }
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
