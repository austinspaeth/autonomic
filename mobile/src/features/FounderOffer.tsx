/**
 * The founding-member card — Claude Design "Founding Member Card".
 *
 * Raised in the Journal under the Autonomic Outlook on the ONE day after a user
 * has logged five days of their own content, while the install trial is still
 * running. It sells the first year of Pro at the introductory price
 * (`annual_founder_first_year` on iOS, the promo year on Play — see
 * FOUNDER_SKU in src/store/iap.ts).
 *
 * Two departures from the design: the ✕ is drawn at full size rather than as a
 * 12px glyph in a 44pt target, and the secondary "Maybe later" is gone. Both
 * because there is no "later" here — the card lives for one calendar day and
 * never returns, so a control that implies a rain check would be a lie. The ✕
 * is the whole dismissal, and it is permanent; a second grey button saying the
 * same thing only gave the card two ways to say no and pushed the price line
 * off the fold.
 *
 * All the decisions live in src/lib/upsell/founder.ts (pure, tested); this file
 * asks once per mount, stamps the day it claimed, and renders it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { useSheets } from '../components/Sheet';
import { radius, usePalette } from '../theme';
import { useAppState } from '../store/store';
import { useTier } from '../store/tier';
import { FOUNDER_SKU, YEARLY_SKU, introPriceOf, priceOf, subscribe, useIap } from '../store/iap';
import { todayKey } from '../lib/dates';
import { resolveProtocol } from '../lib/scoring/day';
import { detectDownturn } from '../lib/scoring/downturn';
import { detectStrain } from '../lib/scoring/strain';
import { discountPct, founderVerdict } from '../lib/upsell/founder';
import { FORCE_FOUNDER_OFFER, founderMemory, noteFounderDismissed, noteFounderShown } from '../lib/upsell/founderMemory';

export function FounderOfferCard() {
  const p = usePalette();
  const { products, purchasing, error } = useIap();
  const { depth } = useSheets();
  const state = useAppState();
  const tier = useTier();
  const dk = todayKey();

  // Resolve an already-claimed day during the first render (a pure read), the
  // same reason AnnualOfferCard does: settling it a frame later pops the card
  // in under the Outlook on launch and shoves the rest of the Journal down.
  const [live, setLive] = useState(() => founderMemory().shownDk === dk && !founderMemory().dismissed);
  const [dismissed, setDismissed] = useState(false);

  // Ask once per mount, then hold. Re-entering would re-evaluate a decision
  // this very card just persisted.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || dismissed) return;
    const mem = founderMemory();
    // The dev force skips the earning conditions (trial + three logged days),
    // never the memory: a card that reappeared after being dismissed would be
    // testing something the shipping app can't do.
    const forced = __DEV__ && FORCE_FOUNDER_OFFER && !mem.dismissed && mem.shownDk == null;
    const ask = (downturn: boolean) => founderVerdict({
      days: state.days,
      dk,
      tier,
      memory: mem,
      sheetOpen: depth > 0,
      crashAlertFiredToday: state.settings.crashAlert?.lastFired === dk,
      downturn,
    });
    // Asked twice, deliberately: this effect re-runs on every journal change,
    // and detectDownturn is an O(week) sweep. The cheap gates (memory, tier,
    // three logged days) reject the overwhelming majority of runs, so the sweep
    // only happens once they've all passed.
    let v = forced ? { ok: true as const, claim: true } : ask(false);
    if (v.ok && !forced) {
      const ctx = { sex: state.profile.sex, height: state.profile.height };
      // Either detector behind the Journal's warning card defers this offer.
      // It only lives for one day, so a bad day must not spend it.
      const downturn = !!detectDownturn(state.days, dk, ctx, resolveProtocol(state.settings.protocol), state.customTypes)
        || !!detectStrain(state.days, dk, ctx);
      if (downturn) v = ask(true);
    }
    if (!v.ok) return;
    settled.current = true;
    if (v.claim) noteFounderShown(dk);
    setLive(true);
  }, [tier, depth, state, dk, dismissed]);

  const end = () => {
    noteFounderDismissed();
    setDismissed(true);
    setLive(false);
  };

  const full = priceOf(products.find((s) => s.productId === YEARLY_SKU), YEARLY_SKU);
  const founder = products.find((s) => s.productId === FOUNDER_SKU);
  // iOS: the introductory price StoreKit says THIS user is eligible for.
  // Android: FOUNDER_SKU is its own discounted product, so its recurring price
  // is the offer price. Null on iOS means not eligible, and the card then
  // simply sells the year at its ordinary price rather than inventing a saving.
  const offerPrice = useMemo(
    () => introPriceOf(founder) ?? (FOUNDER_SKU !== YEARLY_SKU ? priceOf(founder, FOUNDER_SKU) : null),
    [founder],
  );
  const pct = offerPrice ? discountPct(offerPrice, full) : null;

  if (!live || dismissed || tier === 'pro') return null;

  return (
    <View style={{
      borderWidth: 1, borderColor: p.border, borderRadius: radius.card,
      backgroundColor: p.surface, marginBottom: 12, padding: 16, paddingTop: 15,
    }}>
      {/* Full-size ✕ in its own 44pt target, sitting in the card's corner. */}
      <Pressable
        onPress={end}
        hitSlop={6}
        style={({ pressed }) => [
          { position: 'absolute', top: 4, right: 4, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Icon name="x" size={20} color={p.textDim} strokeWidth={2.4} />
      </Pressable>

      <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: p.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 12, marginRight: 44 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.3, color: p.textDim }}>JOIN US EARLY</Text>
      </View>

      <Text style={{ fontSize: 19, fontWeight: '700', letterSpacing: -0.3, color: p.text, marginBottom: 8 }}>
        Five days down. The trend starts here.
      </Text>

      <Text style={{ fontSize: 13.5, lineHeight: 21, color: p.textDim, marginBottom: 16 }}>
        {/* The percentage is DERIVED from the two prices the store returned, so
            it stays true in every currency and disappears entirely when this
            user isn't eligible for the introductory price. */}
        {/* The offer's one-day life is stated here, in the sentence that makes
            the price claim, rather than as its own coloured line under the
            button: an offer that quietly expires reads as a bug the next
            morning, but a red banner saying so turned the card into a
            countdown ad. */}
        Pro shows you your full history and every trend, so you can see what days like today are made of.
        {pct ? ' Sign up now and your first year is ' : ' '}
        {pct ? <Text style={{ color: p.text, fontWeight: '600' }}>{`${pct}% off`}</Text> : null}
        {pct ? '. Offer is only available today.' : 'Sign up now at the founding member price. Offer is only available today.'}
      </Text>

      <Pressable
        onPress={() => subscribe(FOUNDER_SKU)}
        disabled={purchasing}
        style={({ pressed }) => [
          { height: 50, borderRadius: 14, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' },
          (pressed || purchasing) && { opacity: 0.8 },
        ]}
      >
        <Text style={{ color: '#fff', fontSize: 15.5, fontWeight: '700' }}>
          {purchasing ? 'Starting…' : 'Join at the early price'}
        </Text>
      </Pressable>

      {/* A store failure has to be said out loud here, or the button just
          flashes "Starting…" and reverts (see src/store/iap.ts). */}
      {error ? (
        <Text style={{ color: '#d63b3b', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 9 }}>{error}</Text>
      ) : null}

      <Text style={{ fontSize: 12, color: p.textDim, textAlign: 'center', marginTop: 11 }}>
        {offerPrice && offerPrice !== full
          ? `${offerPrice} first year, then ${full}/yr, cancel anytime`
          : `${full}/yr, cancel anytime`}
      </Text>
    </View>
  );
}
