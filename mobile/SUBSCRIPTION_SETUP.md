# Subscription setup (StoreKit 2, 7-day trial then all-paid)

Step-by-step to turn on the **$49.99/year** subscription with a **7-day free
trial**, using **StoreKit 2 on-device** (via `react-native-iap`) so nothing
leaves the device except the transaction to Apple. No backend, no shared secret,
no App Store Server Notifications.

**Model:** the whole app is behind the paywall. A new user taps "Start free
trial," StoreKit gives 7 free days (Apple's introductory offer), then it
auto-renews to paid. The gate is just: `isPro = has an active entitlement` (the
trial period counts as active). If not entitled, the paywall covers the app.

> ⚠️ Payments code must be tested on a **real device in the sandbox** before you
> ship. The code below compiles and follows `react-native-iap` conventions, but
> API argument shapes vary slightly by version, so verify against the version you
> install. This has NOT been device-tested.

---

## Part A — App Store Connect (config, no code)

**A0. Sign the Paid Apps Agreement (the #1 blocker).** Business → Agreements →
accept **Paid Applications Agreement** and complete **banking + tax**. In-app
purchases do not load at all until this is Active. Most first-launch subscription
problems are just this.

**A1. Subscription group.** App → Autonomic → Subscriptions → create group
`Autonomic Pro`.

**A2. Auto-renewable subscription.** Inside the group, add:
- Reference Name: `Autonomic Pro Yearly`
- **Product ID: `com.autonomic.journal.pro.yearly`** (must match `PRO_SKU` in code)
- Duration: 1 Year
- Price: **$49.99** (USD tier; Apple auto-fills other currencies)

**A3. Free trial.** On the subscription → Introductory Offer → **Free → 7 days**
→ new subscribers.

**A4. Subscription metadata.** Localized display name ("Autonomic Pro"),
description, and a **review screenshot of the paywall** (required — capture it
once the paywall UI below runs).

**A5.** Leave it in "Ready to Submit"; it gets reviewed **with** your first app
build that contains it.

---

## Part B — Install

```bash
cd mobile
npx expo install react-native-iap
npx expo prebuild --clean      # regenerates ios/ with the StoreKit linkage
npx expo run:ios               # rebuild the dev client
```

`react-native-iap` autolinks; no config-plugin entry is required. iOS gets the
In-App Purchase capability automatically once your Paid Apps Agreement is active.

---

## Part C — Code

### 1. `src/store/iap.ts` — the StoreKit 2 module

```ts
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import {
  initConnection, endConnection, getSubscriptions, requestSubscription,
  getAvailablePurchases, finishTransaction, purchaseUpdatedListener,
  purchaseErrorListener, type Subscription,
} from 'react-native-iap';

export const PRO_SKU = 'com.autonomic.journal.pro.yearly';

type IapState = { ready: boolean; isPro: boolean; product?: Subscription; purchasing: boolean };
let state: IapState = { ready: false, isPro: false, purchasing: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<IapState>) => { state = { ...state, ...p }; emit(); };

let purchaseSub: { remove: () => void } | undefined;
let errorSub: { remove: () => void } | undefined;

/** Call once at app start (see _layout.tsx). Fails open: on any error the app
 *  still runs, just treated as not-Pro, so a StoreKit hiccup never bricks it. */
export async function initIap() {
  if (Platform.OS !== 'ios') { set({ ready: true }); return; }   // iOS-only for now
  try {
    await initConnection();
    purchaseSub = purchaseUpdatedListener(async (purchase) => {
      // Fires on a new purchase, a trial start, and each renewal.
      try { await finishTransaction({ purchase, isConsumable: false }); } catch {}
      set({ isPro: true, purchasing: false });
    });
    errorSub = purchaseErrorListener(() => set({ purchasing: false }));
    const subs = await getSubscriptions({ skus: [PRO_SKU] });
    set({ product: subs[0] });
    await refreshEntitlement();
  } catch {
    // swallow — treated as not-Pro
  } finally {
    set({ ready: true });
  }
}

/** StoreKit 2 currentEntitlements only returns *active* (non-expired) items,
 *  so presence of our SKU == active subscription (incl. the free-trial period). */
export async function refreshEntitlement() {
  try {
    const active = await getAvailablePurchases();
    set({ isPro: active.some((p) => p.productId === PRO_SKU) });
  } catch { /* keep last known */ }
  return state.isPro;
}

export async function subscribe() {
  set({ purchasing: true });
  try {
    await requestSubscription({ sku: PRO_SKU });   // success arrives via the listener
  } catch {
    set({ purchasing: false });
  }
}

/** Apple requires a visible Restore control. This re-reads entitlements. */
export async function restore() { return refreshEntitlement(); }

export function teardownIap() {
  purchaseSub?.remove(); errorSub?.remove(); endConnection().catch(() => {});
}

export function useIap() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state, () => state,
  );
}
```

### 2. `src/features/SubscriptionGate.tsx` — the paywall overlay

Matches the `OnboardingGate` pattern (absolute-fill, `usePalette`, `Button`).
Give it a lower `zIndex` (90) than onboarding (100) so a first-run user sees the
welcome wizard first, then the paywall underneath it.

```tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Linking, ActivityIndicator, ScrollView } from 'react-native';
import { usePalette } from '../theme';
import { Button } from '../components/ui';
import { useIap, subscribe, restore, refreshEntitlement } from '../store/iap';

const TERMS_URL = 'https://autonomic.care/terms-of-service';
const PRIVACY_URL = 'https://autonomic.care/privacy-policy';

export function SubscriptionGate() {
  const p = usePalette();
  const { ready, isPro, product, purchasing } = useIap();

  // Re-check when returning from the App Store sheet / on focus.
  useEffect(() => { if (ready && !isPro) refreshEntitlement(); }, [ready, isPro]);

  if (!ready || isPro) return null;                 // paid or still loading → no wall
  const price = product?.localizedPrice ?? '$49.99';

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: p.bg, zIndex: 90, elevation: 90 }]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 26, gap: 18 }}>
        <Text style={{ color: p.text, fontSize: 30, fontWeight: '800', textAlign: 'center' }}>
          See your nervous system recover
        </Text>
        <Text style={{ color: p.textDim, fontSize: 16, textAlign: 'center', lineHeight: 23 }}>
          Clinical-grade HRV, your own recovery protocol, and every number graded
          against medical thresholds. Start free for 7 days.
        </Text>

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button
            title={purchasing ? 'Starting…' : `Start 7-day free trial`}
            variant="primary"
            disabled={purchasing}
            onPress={subscribe}
          />
          {purchasing ? <ActivityIndicator color={p.accent} /> : null}
          <Text style={{ color: p.textDim, fontSize: 13, textAlign: 'center' }}>
            7 days free, then {price}/year. Cancel anytime in Settings.
          </Text>
          <Button title="Restore purchases" variant="default" onPress={restore} />
        </View>

        <Text style={{ color: p.textDim, fontSize: 11, textAlign: 'center', lineHeight: 17 }}>
          Payment is charged to your Apple ID at confirmation. The subscription
          auto-renews unless canceled at least 24 hours before the period ends.
          {'  '}
          <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(TERMS_URL)}>Terms</Text>
          {'  ·  '}
          <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy</Text>
        </Text>
      </ScrollView>
    </View>
  );
}
```

### 3. Wire it into `app/_layout.tsx`

```tsx
// add imports
import { initIap } from '../src/store/iap';
import { SubscriptionGate } from '../src/features/SubscriptionGate';

// inside RootLayout's useEffect(() => { ... }, [])
initIap();

// in the returned tree, alongside OnboardingGate (paywall sits below onboarding):
<Slot />
<SubscriptionGate />
<OnboardingGate />
```

Nothing else needs gating: because the paywall is a full-screen overlay shown
whenever `!isPro`, the entire app is covered until the trial/subscription is
active. That is exactly the "trial then all-paid" model.

### 4. Add a "Manage subscription" row in Settings (nice-to-have)

```ts
import { Linking } from 'react-native';
// row onPress:
Linking.openURL('https://apps.apple.com/account/subscriptions');
```

---

## Part D — Test (real device, free sandbox)

1. App Store Connect → Users and Access → **Sandbox** → add a sandbox tester
   (a fresh email, not your real Apple ID).
2. Build to a real device (`expo run:ios` or a TestFlight build) and sign into
   the sandbox account when the purchase sheet asks.
3. Verify: paywall shows the price and "7 days free"; "Start free trial" opens
   the sheet; after confirming, the paywall disappears; kill and relaunch — still
   Pro (entitlement persists); "Restore purchases" works on a fresh install.
4. Sandbox subscriptions renew on an accelerated clock (a year = minutes), so you
   can watch it renew and expire.

---

## Part E — Submit

- Attach the subscription to the app version (Pricing/In-App Purchases section of
  the version) so it is reviewed **with** the build.
- The paywall screen must show, and Apple checks for: the **price**, the
  **trial + renewal terms**, a **Restore** control, and **Terms + Privacy**
  links. The code above has all four.
- Privacy label stays **"Data Not Collected"** — StoreKit purchases are between
  the app and Apple; no third party is involved, so nothing changes there.
- App Store Server Notifications URL and app-specific shared secret: **leave both
  blank.** On-device StoreKit 2 does not use them.

---

## Gotchas checklist

- [ ] Paid Apps Agreement active (A0) — else products return empty and the
      paywall shows no price.
- [ ] Product ID in App Store Connect **exactly** equals `PRO_SKU`.
- [ ] Tested with a **sandbox** account on a **real device** (simulator can't buy).
- [ ] Restore button present and working (Apple rejects without it).
- [ ] Trial + auto-renew disclosure text present on the paywall (above).
- [ ] Terms + Privacy URLs live and reachable.
