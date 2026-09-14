/**
 * The founding-member card — Claude Design "Founding Member Card".
 *
 * Raised in the Journal under the Autonomic Outlook on the ONE day after a user
 * has logged five days of their own content, while the install trial is still
 * running. It sells the first year of Pro at the introductory price
 * (`annual_founder_first_year` on iOS, the promo year on Play — see
 * FOUNDER_SKU in src/store/iap.ts).
 *
 * The card LEADS WITH THE PRICE. The old version opened with a paragraph and
 * put the number in the last line of it, which asked the reader to work out
 * what was being offered before they could tell whether they wanted it. Here
 * the discounted year is the biggest thing on the card, struck through against
 * the full price, over three lines naming what Pro actually unlocks.
 *
 * Two departures from the design: the ✕ is drawn at full size rather than as a
 * 12px glyph in a 38pt target, and the secondary "Maybe later" is gone. Both
 * because there is no "later" here — the card lives for one calendar day and
 * never returns, so a control that implies a rain check would be a lie. The ✕
 * is the whole dismissal, and it is permanent; a second grey button saying the
 * same thing only gave the card two ways to say no and pushed the price line
 * off the fold.
 *
 * EVERY NUMBER ON IT COMES FROM THE STORE. The strike-through, the "half price"
 * claim and the button's own price are all derived from the two localized
 * prices StoreKit / Play returned (see `discountPct`), so a user who isn't
 * eligible meets a card that simply states the price rather than one claiming a
 * discount it can't give them.
 *
 * All the decisions live in src/lib/upsell/founder.ts (pure, tested); this file
 * asks once per mount, stamps the day it claimed, and renders it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Icon } from '../components/Icon';
import { useSheets } from '../components/Sheet';
import { ACCENT, fonts, usePalette } from '../theme';
import { hexA, mixHex } from '../lib/color';
import { useAppState } from '../store/store';
import { useTier } from '../store/tier';
import { FOUNDER_SKU, YEARLY_SKU, priceOf, subscribe, useIap } from '../store/iap';
import { StoreBlockedNotice } from './Paywall';
import { todayKey } from '../lib/dates';
import { resolveProtocol } from '../lib/scoring/day';
import { detectDownturn } from '../lib/scoring/downturn';
import { detectStrain } from '../lib/scoring/strain';
import { discountPct, founderVerdict } from '../lib/upsell/founder';
import { FORCE_FOUNDER_OFFER, founderMemory, noteFounderDismissed, noteFounderShown } from '../lib/upsell/founderMemory';
import { noteOfferShown, offerPacingClear } from '../lib/upsell/pacingMemory';
import { liveOffer } from '../lib/upsell/annual';
import { annualMemory } from '../lib/upsell/annualMemory';
import { pingOfferAccepted, pingOfferDismissed, pingOfferShown } from '../store/ping';

/**
 * What the money buys, in the reader's terms. Three lines, because the card has
 * to be legible in one glance under the Outlook — the full boundary is the
 * Free-vs-Pro sheet's job. Each line states the Pro side of a line that really
 * is drawn in src/lib/gating.ts: capture is never metered, so nothing here may
 * promise a measurement the free tier already takes (a POTS capture runs on
 * every tier — it's the RESULT that's locked, and that's what this says).
 */
/** The accent, lightened enough to read as small bold type over the dark
 *  surface. The raw accent at 11px is a red smudge; this is the same colour the
 *  eye still reads as the app's red. */
const ACCENT_LIGHT = mixHex('#ffffff', ACCENT, 0.42);

const UNLOCKS = [
  'Your full history, not just the last 14 days',
  'The pacing budget and your POTS results',
  'Correlations, insights and the AI reports',
];

export function FounderOfferCard() {
  const p = usePalette();
  const { products, purchasing, error, blocked } = useIap();
  const { depth } = useSheets();
  const state = useAppState();
  const tier = useTier();
  const dk = todayKey();

  /** The half-off annual window is running. It carries a Pro unlock and it is
   *  over within a day, so it wins the slot outright — see `annualOfferLive`
   *  in ../lib/upsell/founder. Read on every render rather than latched,
   *  because this card must come back when that window closes. */
  const annualOfferLive = liveOffer(annualMemory()) != null;

  // Resolve an already-claimed day during the first render (a pure read), the
  // same reason AnnualOfferCard does: settling it a frame later pops the card
  // in under the Outlook on launch and shoves the rest of the Journal down.
  const [live, setLive] = useState(() => founderMemory().shownDk === dk && !founderMemory().dismissed);
  const [dismissed, setDismissed] = useState(false);
  // The top glow is an SVG, so it needs the card's own width.
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Ask once per mount, then hold. Re-entering would re-evaluate a decision
  // this very card just persisted.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || dismissed) return;
    // Nothing to sell a subscriber. Returned before anything is claimed or
    // stamped, so an entitlement that lands late can't leave a spent offer and
    // a stopped clock behind it.
    if (tier === 'pro') return;
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
      // One offer at a time, then a week of quiet (../lib/upsell/pacing). Asked
      // only on the claim path — a day already claimed is handled above, by the
      // memory.
      offerCooldown: !offerPacingClear(),
      annualOfferLive,
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
    if (v.claim) { noteFounderShown(dk); noteOfferShown('founder'); }
    setLive(true);
  }, [tier, depth, state, dk, dismissed, annualOfferLive]);

  // Shown: this card lives for a single day, so the day it claims is the day
  // this fires. Capped per Eastern day in the store, which for this card means
  // once in its whole life.
  useEffect(() => { if (live && tier !== 'pro' && !annualOfferLive) pingOfferShown('founder'); }, [live, tier, annualOfferLive]);

  const end = () => {
    noteFounderDismissed();
    // The ✕ is the whole dismissal here and it is permanent, so this is the one
    // offer whose rejection is unambiguous — no accordion, no second button.
    pingOfferDismissed('founder');
    setDismissed(true);
    setLive(false);
  };

  const full = priceOf(products.find((s) => s.productId === YEARLY_SKU), YEARLY_SKU);
  const founder = products.find((s) => s.productId === FOUNDER_SKU);
  // FOUNDER_SKU is its own discounted product on both stores, so its RECURRING
  // price is the offer price: this is a permanently discounted year, not a
  // discounted first one, and the copy below says so. (It used to be an iOS
  // introductory offer, which Apple applies to every eligible user from the
  // ordinary paywall — a card that could prompt but never hold anything back.)
  const offerPrice = useMemo(() => priceOf(founder, FOUNDER_SKU), [founder]);
  const pct = offerPrice ? discountPct(offerPrice, full) : null;

  // Both gates again, because `live` can have been seeded from a day this card
  // claimed on an earlier launch without ever consulting the verdict. The tier
  // is re-read for the same reason: this offer exists only inside the install
  // trial, so a subscription bought (or a trial expiring) later the same day
  // retires the card rather than leaving it selling into a state it doesn't
  // apply to.
  if (!live || dismissed || tier !== 'trial' || annualOfferLive) return null;

  return (
    <View
      onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setSize({ w: width, h: height }); }}
      style={{
        borderWidth: 1, borderColor: hexA(p.accent, 0.27), borderRadius: 22,
        backgroundColor: p.sunk, marginBottom: 12, overflow: 'hidden',
      }}
    >
      {/* Light spilling in over the top edge. The same trick the Outlook's
          GradientBorderCard uses (an SVG radial under the content, never a tint
          over it), lit from the top CENTRE rather than a corner: this card sits
          directly under that one and a matching lit corner would read as the
          same object continued. */}
      {size.w > 0 && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 90 }} pointerEvents="none">
          <Svg width={size.w} height={90}>
            <Defs>
              <RadialGradient id="fo-glow" cx={size.w / 2} cy={-6} rx={size.w * 0.42} ry={78} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={p.accent} stopOpacity={0.4} />
                <Stop offset="0.45" stopColor={p.accent} stopOpacity={0.13} />
                <Stop offset="1" stopColor={p.accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={size.w} height={90} fill="url(#fo-glow)" />
          </Svg>
        </View>
      )}

      {/* Header: what this is, and the one way out of it. The ✕ keeps its full
          44pt target and 20px glyph; the row is padded to sit it in the corner
          without the absolute positioning the old card needed. */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 17, paddingRight: 6, paddingVertical: 8,
        borderBottomWidth: 1, borderBottomColor: hexA(p.text, 0.05),
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Icon name="star" size={14} color={p.accent} strokeWidth={2.4} />
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: ACCENT_LIGHT }}>
            TODAY ONLY · GET PRO EARLY
          </Text>
        </View>
        <Pressable
          onPress={end}
          hitSlop={6}
          style={({ pressed }) => [
            { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Icon name="x" size={20} color={p.textDim} strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 17, paddingTop: 16, paddingBottom: 17 }}>
        {/* The price, at the size of the thing it is. Manrope's tabular figures
            are what the Progress readouts use, so the number reads as one of
            this app's numbers rather than as an ad. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 11, marginBottom: 5 }}>
          <Text style={{ fontFamily: fonts.numBold, fontSize: 42, lineHeight: 44, letterSpacing: -1, color: p.text }}>
            {offerPrice || full}
          </Text>
          <View style={{ paddingBottom: 4 }}>
            {/* Only struck through when the store really did return two prices
                and the cheaper one is ours to offer. */}
            {pct ? (
              <Text style={{ fontFamily: fonts.numMed, fontSize: 15, color: p.textDim, textDecorationLine: 'line-through' }}>{full}</Text>
            ) : null}
            <Text style={{ fontSize: 13, color: p.textDim, marginTop: 1 }}>per year</Text>
          </View>
        </View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: ACCENT_LIGHT, marginBottom: 16 }}>
          {pct ? `Locked at ${pct}% off for as long as you're subscribed` : "The founding member price, for as long as you're subscribed"}
        </Text>

        <View style={{ borderTopWidth: 1, borderTopColor: hexA(p.text, 0.05), paddingTop: 12, marginBottom: 16 }}>
          {UNLOCKS.map((u) => (
            <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
              <Icon name="check" size={14} color={p.accent} strokeWidth={2.8} />
              <Text style={{ fontSize: 14, color: p.text, flexShrink: 1 }}>{u}</Text>
            </View>
          ))}
        </View>

        {/* No button when the store has told us this device can never complete a
            purchase: the tap would fire `oac` and then die in loadProducts before
            requestPurchase, recording an offer as accepted that could not
            convert. */}
        {blocked ? <StoreBlockedNotice text={blocked} /> : (
          <Pressable
            onPress={() => { pingOfferAccepted('founder'); subscribe(FOUNDER_SKU, 'founder'); }}
            disabled={purchasing}
            style={({ pressed }) => [
              { height: 52, borderRadius: 15, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' },
              (pressed || purchasing) && { opacity: 0.8 },
            ]}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
              {purchasing ? 'Starting…' : `Unlock Pro for ${offerPrice || full}/yr`}
            </Text>
          </Pressable>
        )}

        {/* A store failure has to be said out loud here, or the button just
            flashes "Starting…" and reverts (see src/store/iap.ts). */}
        {error && !blocked ? (
          <Text style={{ color: '#d63b3b', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 9 }}>{error}</Text>
        ) : null}

        {/* The card's one day, said in the quietest line on it. It used to be a
            clause inside the price paragraph; with the paragraph gone it sits
            beside the other thing the reader needs to know about a subscription. */}
        <Text style={{ fontSize: 12.5, color: p.textDim, textAlign: 'center', marginTop: 10 }}>
          Today only · cancel anytime
        </Text>
      </View>
    </View>
  );
}
