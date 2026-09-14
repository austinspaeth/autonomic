/**
 * The half-off annual offer card — Claude Design "Longtime Free Offer".
 *
 * Raised in the Journal under the Autonomic Outlook when a free user reaches
 * 30, 90, 180 or 365 days since install, and it STANDS there until they answer
 * it. The ✕ is the only thing that takes it down; the next milestone is what
 * brings it back.
 *
 * It is a NOTE, not a pitch. Everything a feature grid would say is already in
 * the paywall and the Free-vs-Pro sheet, and a user who has been here a month
 * has met those; what they have not been told is who is on the other end. So
 * the card says that in the first person and then shows two prices, and the
 * only thing it claims about the product is the one line naming what the money
 * unlocks.
 *
 * Two things it deliberately no longer does. It does not grant 24 hours of Pro:
 * an unlock that has to be spent before the card expires is a countdown wearing
 * a gift's clothes, and it made the card an errand. And it does not expire —
 * see ../lib/upsell/annual for why.
 *
 * Every number on it comes from the store: the two localized prices, the
 * discount claim derived from them, and the per-month figure divided out of the
 * yearly one. Nothing here is hardcoded from the App Store Connect setup.
 *
 * All the decisions live in src/lib/upsell/annual.ts (pure, tested); this file
 * adopts a standing card or raises a due one, then renders it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { useSheets } from '../components/Sheet';
import { usePalette } from '../theme';
import { hexA, mixHex } from '../lib/color';
import { useAppState } from '../store/store';
import { getInstalledAtMs, useTier } from '../store/tier';
import { MONTHLY_SKU, PROMO_YEARLY_SKU, YEARLY_SKU, priceOf, subscribe, useIap } from '../store/iap';
import { StoreBlockedNotice } from './Paywall';
import { todayKey } from '../lib/dates';
import { resolveProtocol } from '../lib/scoring/day';
import { detectDownturn } from '../lib/scoring/downturn';
import { detectStrain } from '../lib/scoring/strain';
import { dueMilestone, liveOffer } from '../lib/upsell/annual';
import { discountPct } from '../lib/upsell/founder';
import { FORCE_ANNUAL_OFFER, annualMemory, noteAnnualOfferDismissed, noteAnnualOfferStarted } from '../lib/upsell/annualMemory';
import { noteOfferShown, offerPacingClear } from '../lib/upsell/pacingMemory';
import { pingOfferAccepted, pingOfferDismissed, pingOfferShown } from '../store/ping';

/**
 * Monthly equivalent of a localized yearly price, keeping whatever currency
 * shape the store handed us. Null when the price doesn't parse, in which case
 * the caller leaves the clause off rather than guessing at it.
 *
 * Two precisions, because the card needs both and they are not interchangeable.
 * The plan row prints the EXACT division ("$2.08/mo") beside the real yearly
 * price, where a rounded figure would not multiply back up. The sentence prints
 * the rounded one, which is why it has to say "about".
 */
function perMonth(price: string, precise: boolean): string | null {
  const m = price.match(/\d[\d.,]*/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const each = n / 12;
  const rounded = Math.round(each);
  if (precise) return price.replace(m[0], each.toFixed(2));
  return price.replace(m[0], rounded >= 1 ? String(rounded) : each.toFixed(2));
}

/**
 * "half off" only when the store's two prices really do come to about half.
 * PROMO_YEARLY_SKU is priced at half of YEARLY_SKU in every territory we set,
 * but the rounding is the store's, so the sentence asks rather than assumes —
 * and says the true percentage, or nothing at all, when it isn't.
 */
function discountPhrase(pct: number | null): string {
  if (pct == null) return 'the app at the founding price';
  if (pct >= 48 && pct <= 52) return 'the app half off';
  return `the app ${pct}% off`;
}

type Plan = 'yearly' | 'monthly';

export function AnnualOfferCard() {
  const p = usePalette();
  const { products, purchasing, error, blocked } = useIap();
  const { depth } = useSheets();
  const state = useAppState();
  const tier = useTier();
  const [plan, setPlan] = useState<Plan>('yearly');
  // A card that is ALREADY standing is a pure read, so adopt it during the first
  // render rather than in the effect below: resolving it a frame later made the
  // card pop in under the Outlook on launch and shove the rest of the Journal
  // down. Raising a NEW one still happens in the effect, since it writes MMKV.
  const [offer, setOffer] = useState<{ milestone: number } | null>(() => liveOffer(annualMemory()));

  const dismiss = () => {
    noteAnnualOfferDismissed();
    pingOfferDismissed('annual');
    setOffer(null);
  };

  // Adopt a standing card, or raise a due one. Ask once and then hold.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current) return;
    const now = Date.now();
    const mem = annualMemory();
    const live = liveOffer(mem);
    // Functional update so re-adopting the card seeded above is a no-op rather
    // than a fresh object identity and another render.
    if (live) { settled.current = true; setOffer((o) => o ?? live); return; }
    // 'trial' here means the 14-day install window is still running and 'pro'
    // means there is nothing to sell. Either way, don't spend a milestone — or
    // the shared clock — on them.
    if (tier !== 'free') return;
    if (depth > 0) return;                       // a sheet is open; not now
    const due = (__DEV__ && FORCE_ANNUAL_OFFER) || dueMilestone(getInstalledAtMs(), now, mem);
    if (!due) return;
    // The app raises ONE offer at a time and then goes quiet for a week
    // (../lib/upsell/pacing). Blocked defers rather than spends: the milestone
    // stays due and is raised on a later launch, exactly like the bad-day gates
    // below. Asked only here, on the raise path — a card already standing was
    // adopted above and must not be retired by the clock it set itself.
    if (!offerPacingClear(now)) return;
    // Never raise it on a day the user is already having a bad time. The
    // milestone is not spent, so it lands on a calmer open instead.
    if (state.settings.crashAlert?.lastFired === todayKey()) return;
    if (detectDownturn(state.days, todayKey(), { sex: state.profile.sex, height: state.profile.height },
      resolveProtocol(state.settings.protocol), state.customTypes)) return;
    // Same for the warning card's other detector: a caution on the Journal and
    // an ask for money under it is exactly the pairing to avoid.
    if (detectStrain(state.days, todayKey(), { sex: state.profile.sex, height: state.profile.height })) return;

    settled.current = true;
    noteAnnualOfferStarted(due, now);
    noteOfferShown('annual', now);
    setOffer({ milestone: due });
  }, [tier, depth, state]);

  // Shown: the moment there is a standing card and this component is rendering
  // it — whether it was raised just now or adopted from an earlier launch, since
  // from the reader's side those are the same event. Capped per Eastern day in
  // the store, so re-entering the Journal all day counts once. Not for a
  // subscriber: the card returns null for 'pro' below, and a counter that says
  // an offer was shown to somebody who never saw it is worse than no counter.
  useEffect(() => { if (offer && tier !== 'pro') pingOfferShown('annual'); }, [offer, tier]);

  // The offer converted (or an entitlement arrived from a restore on another
  // device): there is nothing left to sell, so the card goes rather than sitting
  // in front of a paying subscriber. It is not dismissed — nothing was answered
  // — so the milestone memory is left exactly as it is.
  if (!offer || tier === 'pro') return null;

  const promo = priceOf(products.find((s) => s.productId === PROMO_YEARLY_SKU), PROMO_YEARLY_SKU);
  const full = priceOf(products.find((s) => s.productId === YEARLY_SKU), YEARLY_SKU);
  const month = priceOf(products.find((s) => s.productId === MONTHLY_SKU), MONTHLY_SKU);
  const pct = discountPct(promo, full);
  const each = perMonth(promo, true);
  const about = perMonth(promo, false);
  const body = mixHex(p.text, p.textDim, 0.55);

  const planRow = (
    which: Plan,
    title: string,
    price: string,
    per: string,
    note: string,
    tail: string | null,
    badge?: string,
  ) => {
    const on = plan === which;
    return (
      <Pressable
        onPress={() => setPlan(which)}
        style={({ pressed }) => [{
          borderWidth: on ? 1.5 : 1,
          borderColor: on ? p.accent : hexA(p.text, 0.08),
          borderRadius: 18, backgroundColor: p.bg, padding: 15,
          marginBottom: 10, marginTop: badge ? 9 : 0,
        }, pressed && { opacity: 0.85 }]}
      >
        {/* The badge rides ON the border, which is why the row above it carries
            the margin rather than this view carrying a negative one. */}
        {badge ? (
          <View style={{ position: 'absolute', top: -9, left: 15, backgroundColor: p.accent, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>{badge}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: p.text }}>{title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: p.text, fontVariant: ['tabular-nums'] }}>{price}</Text>
            <Text style={{ fontSize: 12.5, color: p.textDim }}>{per}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <Text style={{ flexShrink: 1, fontSize: 12.5, fontWeight: on ? '600' : '400', color: on ? mixHex('#ffffff', p.accent, 0.42) : p.textDim }}>{note}</Text>
          {tail ? <Text style={{ fontSize: 12.5, color: p.textDim }}>{tail}</Text> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{
      borderWidth: 1, borderColor: hexA(p.text, 0.08), borderRadius: 22,
      backgroundColor: p.sunk, marginBottom: 12, paddingHorizontal: 17, paddingTop: 18, paddingBottom: 17,
    }}>
      {/* Full-size ✕ in its own 44pt target, as on the founding-member card —
          the two cards share a slot and must not wear two different dismissals. */}
      <Pressable
        onPress={dismiss}
        hitSlop={6}
        style={({ pressed }) => [
          { position: 'absolute', top: 4, right: 4, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Icon name="x" size={20} color={p.textDim} strokeWidth={2.4} />
      </Pressable>

      <Text style={{ fontSize: 15, fontWeight: '800', letterSpacing: 1.2, color: p.textDim, marginBottom: 15, marginRight: 44 }}>
        FROM THE DEVELOPER
      </Text>

      <Text style={{ fontSize: 15, lineHeight: 24, color: body, marginBottom: 14 }}>
        {"There is no company behind this app. It is one person, six kids, and a condition I've been fighting for 4 years. No team, no investors. Pro is the only thing keeping it alive, and I would love your support."}
      </Text>

      <Text style={{ fontSize: 15, lineHeight: 24, color: body, marginBottom: 18 }}>
        {`I'm offering ${discountPhrase(pct)}${about ? `, about ${about} a month,` : ','} so you can finally see your full history, trends and pacing budget.`}
      </Text>

      {planRow('yearly', 'Yearly', promo, '/yr',
        pct ? `${pct}% off for as long as you stay` : 'The founding price, for as long as you stay',
        each ? `${each}/mo` : null, 'BEST VALUE')}
      {planRow('monthly', 'Monthly', month, '/mo', 'Full price, leave whenever', null)}

      {/* No button when the store has told us this device can never complete a
          purchase: the tap would fire `oac` and then die in loadProducts before
          requestPurchase, recording an offer as accepted that could not convert. */}
      {blocked ? (
        <View style={{ marginTop: 7 }}><StoreBlockedNotice text={blocked} /></View>
      ) : (
        <Pressable
          onPress={() => {
            pingOfferAccepted('annual');
            subscribe(plan === 'yearly' ? PROMO_YEARLY_SKU : MONTHLY_SKU, 'annual');
          }}
          disabled={purchasing}
          style={({ pressed }) => [
            { height: 52, borderRadius: 15, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
            (pressed || purchasing) && { opacity: 0.8 },
          ]}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
            {purchasing ? 'Starting…' : `Continue with ${plan}`}
          </Text>
        </Pressable>
      )}

      {/* A store failure has to be said out loud here, or the button just
          flashes "Starting…" and reverts (see src/store/iap.ts). */}
      {error && !blocked ? (
        <Text style={{ color: '#d63b3b', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 9 }}>{error}</Text>
      ) : null}

      {/* The second half of this line is the promise the card is standing on: the
          free tier is not being taken away, and saying so is what keeps the note
          above from reading as a threat. */}
      <Text style={{ fontSize: 12.5, color: p.textDim, textAlign: 'center', marginTop: 10 }}>
        Cancel anytime · free plan stays free
      </Text>
    </View>
  );
}
