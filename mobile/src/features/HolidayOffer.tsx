/**
 * The Black Friday card — Claude Design "Black Friday Card" (variant 78c,
 * "Stacked type").
 *
 * Raised in the Journal under the Autonomic Outlook for four fixed days —
 * Friday 27 November through 11:59pm Cyber Monday, US Eastern — to every
 * install that is not already subscribed. It sells `FOUNDER_YEARLY_SKU`
 * (`com.autonomic.journal.yearly.founder`, Play base plan `yearly-founder`),
 * the same permanently discounted year the founding-member and annual cards
 * sell, so the promotion is the OCCASION and not a fourth price.
 *
 * It TAKES PRECEDENCE over both other offer cards and is never on screen beside
 * one: ../lib/upsell/holidayMemory's `holidayOwnsSlot` is read by AnnualOffer,
 * FounderOffer and ReviewRequestCard, and it answers from the WINDOW rather
 * than from whether this card has been raised, so nothing can paint a frame
 * beside it on the launch that opens the sale.
 *
 * The layout is the design's, and the three departures from it are all the same
 * departure — a design token in place of a literal, so the card follows the
 * theme rather than pinning itself to the dark palette it was drawn on. The
 * design's #e03127 IS `p.accent`, its #141416 IS `p.sunk`, its #f2f2f5 /
 * #c9c9d0 / #6a6a72 are the app's own three-step text ramp (`text` / `textDim`
 * / `textFaint`), and Space Grotesk's tabular figures are Manrope's
 * (`fonts.numBold`), which is what every other readout in the app is set in.
 *
 * EVERY NUMBER ON IT COMES FROM THE STORE — the headline price, the
 * strike-through and the button's own figure are the two localized prices
 * StoreKit / Play returned, never the design's literals, so an install the
 * discount cannot reach meets a card that states its real price.
 *
 * It STANDS once raised: the ✕ is the only thing that takes it down, and it
 * takes it down for good. The decisions live in src/lib/upsell/holiday.ts
 * (pure, tested); this file asks once per mount, stamps what it raised, runs
 * the clock and renders it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Icon } from '../components/Icon';
import { useSheets } from '../components/Sheet';
import { fonts, usePalette } from '../theme';
import { hexA } from '../lib/color';
import { useAppState } from '../store/store';
import { hasAccessGrant, useAccessGrant, useTier } from '../store/tier';
import { FOUNDER_SKU, YEARLY_SKU, priceOf, subscribe, useIap } from '../store/iap';
import { StoreBlockedNotice } from './Paywall';
import { todayKey } from '../lib/dates';
import { resolveProtocol } from '../lib/scoring/day';
import { detectDownturn } from '../lib/scoring/downturn';
import { detectStrain } from '../lib/scoring/strain';
import { profileCtx } from '../lib/scoring';
import { holidayCountdown, holidayVerdict, holidayWindowOpen } from '../lib/upsell/holiday';
import { FORCE_HOLIDAY_OFFER, holidayMemory, noteHolidayDismissed, noteHolidayShown } from '../lib/upsell/holidayMemory';
import { noteOfferShown } from '../lib/upsell/pacingMemory';
import { pingOfferAccepted, pingOfferDismissed, pingOfferShown } from '../store/ping';

/** The glow's box, from the design: a 260pt circle hung off the top-right
 *  corner and clipped by the card. */
const GLOW = 260;

/** Where a DEV-forced preview pretends the clock is. Never reached in a
 *  release build. */
const PREVIEW_START_MS = Date.parse('2026-11-27T09:00:00-05:00');

/** The wordmark's two lines. Its line height is deliberately ABOVE its type
 *  size — see the note at the call site. */
const WORDMARK = { fontSize: 44, fontWeight: '900' as const, letterSpacing: -2, lineHeight: 48 };

export function HolidayOfferCard() {
  const p = usePalette();
  const { products, purchasing, error, blocked } = useIap();
  const { depth } = useSheets();
  const state = useAppState();
  const tier = useTier();
  const gifted = useAccessGrant();
  const dk = todayKey();

  // A card already raised is a pure read, so adopt it during the first render
  // the way AnnualOfferCard and FounderOfferCard do: settling it a frame later
  // pops the card in under the Outlook on launch and shoves the rest of the
  // Journal down.
  const [live, setLive] = useState(() => {
    const m = holidayMemory();
    return m.shownAtMs != null && !m.dismissed;
  });
  const [dismissed, setDismissed] = useState(false);

  // Ask once per mount, then hold: re-entering would re-evaluate a decision
  // this very card just persisted.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || dismissed) return;
    // Nothing to sell a subscriber. Returned before anything is stamped, so an
    // entitlement that lands late cannot leave a raised offer and a stopped
    // clock behind it.
    if (tier === 'pro') return;
    const now = Date.now();
    const mem = holidayMemory();
    // The dev force opens the WINDOW, never the memory: a card that reappeared
    // after a ✕ would be testing something the shipping app cannot do.
    const forced = __DEV__ && FORCE_HOLIDAY_OFFER && !mem.dismissed;
    if (!forced && !holidayWindowOpen(now)) return;
    const ask = (downturn: boolean) => holidayVerdict({
      nowMs: forced && !holidayWindowOpen(now) ? Date.parse('2026-11-27T09:00:00-05:00') : now,
      tier,
      memory: mem,
      sheetOpen: depth > 0,
      crashAlertFiredToday: state.settings.crashAlert?.lastFired === dk,
      downturn,
      codeAccess: hasAccessGrant(),
    });
    // Asked twice, deliberately: this effect re-runs on every journal change
    // and detectDownturn is an O(week) sweep, so the cheap gates (memory, tier,
    // window) reject the overwhelming majority of runs before it.
    let v = ask(false);
    if (v.ok && v.claim) {
      const ctx = profileCtx(state.profile);
      // Either detector behind the Journal's warning card defers this card into
      // a later hour. Four days is long enough that nothing is lost by waiting.
      const bad = !!detectDownturn(state.days, dk, ctx, resolveProtocol(state.settings.protocol), state.customTypes)
        || !!detectStrain(state.days, dk, ctx);
      if (bad) v = ask(true);
    }
    if (!v.ok) return;
    settled.current = true;
    // Stamped on the FIRST raise only. The shared clock (../lib/upsell/pacing)
    // goes with it, which is what keeps the other two offers quiet for a week
    // AFTER this window as well as during it — this card never asks that clock,
    // because its own window is shorter than the cool-down.
    if (v.claim) { noteHolidayShown(now); noteOfferShown('holiday', now); }
    setLive(true);
  }, [tier, depth, state, dk, dismissed]);

  // Shown: capped per Eastern day in the store, so re-entering the Journal all
  // day counts once and the four days of the window are at most four counts.
  useEffect(() => { if (live && tier !== 'pro') pingOfferShown('holiday'); }, [live, tier, dk]);

  const windowOpen = holidayWindowOpen(Date.now()) || (__DEV__ && FORCE_HOLIDAY_OFFER);
  const visible = live && !dismissed && tier !== 'pro' && windowOpen && !gifted;

  // The clock. One re-render a second, and ONLY while the card is on screen —
  // the Journal stays mounted under every tab and sheet, so an interval left
  // running behind a dismissed card would be a second of work a second, for
  // ever, for nothing. A countdown is the one thing on this card that cannot be
  // derived at render time alone.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return;
    setTick(Date.now());
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible]);
  // Forced previews run outside the real window, where the countdown would be
  // all zeros; run it from the window's own start instead, ADVANCED by the real
  // time since this card mounted, so the preview ticks exactly as the shipping
  // one does. (It was a fixed instant at first, which is a clock that cannot
  // move — the thing the preview exists to show.) In a release build `__DEV__`
  // is false and this whole branch is dead: the clock is `Date.now()` against
  // the window's end, so it is absolute, timezone-independent, and self-
  // correcting across a background/foreground rather than a counter that
  // decrements and drifts.
  const previewFrom = useRef(0);
  if (previewFrom.current === 0) previewFrom.current = Date.now();
  const clock = holidayCountdown(
    __DEV__ && FORCE_HOLIDAY_OFFER && !holidayWindowOpen(tick)
      ? PREVIEW_START_MS + (tick - previewFrom.current)
      : tick,
  );

  const end = () => {
    noteHolidayDismissed();
    pingOfferDismissed('holiday');
    setDismissed(true);
    setLive(false);
  };

  const full = priceOf(products.find((s) => s.productId === YEARLY_SKU), YEARLY_SKU);
  const founder = products.find((s) => s.productId === FOUNDER_SKU);
  const offerPrice = useMemo(() => priceOf(founder, FOUNDER_SKU), [founder]);

  // Every gate again, because `live` can have been seeded from a raise on an
  // earlier launch without ever consulting the verdict — and because the window
  // can close, or a subscription arrive, while the Journal is on screen.
  if (!visible) return null;

  return (
    <View style={{
      position: 'relative', overflow: 'hidden',
      borderWidth: 1, borderColor: hexA(p.accent, 0.27), borderRadius: 22,
      backgroundColor: p.sunk, marginBottom: 12,
      paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16,
    }}>
      {/* Light hung off the top-right corner and clipped by the card — an SVG
          radial UNDER the content, never a tint over it, the same trick the
          Outlook's GradientBorderCard uses. */}
      <View style={{ position: 'absolute', right: -60, top: -80, width: GLOW, height: GLOW }} pointerEvents="none">
        <Svg width={GLOW} height={GLOW}>
          <Defs>
            <RadialGradient id="bf-glow" cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={p.accent} stopOpacity={0.22} />
              <Stop offset="0.7" stopColor={p.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={GLOW} height={GLOW} fill="url(#bf-glow)" />
        </Svg>
      </View>

      {/* The ✕ is the whole dismissal and it is permanent: there is no "later"
          on a card that lives for one weekend, so no second grey button says
          the same thing. Drawn exactly as the other two offer cards' are (20px
          in `textDim`, a 44pt target at top:4/right:4) rather than at the
          design's 12px: the three cards are the same object in the same slot,
          a reader meets at most one of them, and a dismissal that looks
          different card to card is the one control that must not. */}
      <Pressable
        onPress={end}
        accessibilityLabel="Dismiss"
        hitSlop={6}
        style={({ pressed }) => [
          { position: 'absolute', top: 4, right: 4, width: 44, height: 44, borderRadius: 22, zIndex: 2, alignItems: 'center', justifyContent: 'center' },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Icon name="x" size={20} color={p.textDim} strokeWidth={2.4} />
      </Pressable>

      {/* The occasion on the left at display size, the price on the right.
          Baselines are set by the right column's own top padding rather than by
          aligning the two, so the price sits against the second word. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        {/* Two Texts, not one with a newline, and both with a line height
            LARGER than the type. The design asks for line-height 0.88, which in
            CSS merely overlaps the lines; React Native clips a glyph to its line
            box, so a sub-1.0 line height shears the tops off the capitals. The
            tight stack the design wants is bought back with a negative margin
            instead: 48 - 9 is the 39pt step, with nothing cropped. */}
        <View style={{ flexShrink: 0, marginTop: -4 }}>
          <Text style={[WORDMARK, { color: p.text }]}>BLACK</Text>
          <Text style={[WORDMARK, { color: p.text, marginTop: -9 }]}>FRIDAY</Text>
          <View style={{
            alignSelf: 'flex-start', height: 26, paddingHorizontal: 11, marginTop: 9,
            borderRadius: 999, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1.7, color: '#fff' }}>WEEKEND</Text>
          </View>
        </View>
        {/* The price sits low in the column on purpose: it clears the ✕ above
            it and lands as one block with the "a year" line under it, rather
            than floating between the two. */}
        <View style={{ alignItems: 'flex-end', paddingTop: 34, flexShrink: 1 }}>
          {/* Manrope's tabular figures are what the Progress readouts use, so
              the number reads as one of this app's numbers and not as an ad.
              `numHeavy` (ExtraBold, 800) is the heaviest weight Manrope ships
              and the one the widget figures are set in — a step above the
              countdown tiles below, so the price stays the heaviest thing on
              the card, as it is in the design.
              The design budgeted 46px for "$36"; the store returns "$35.99",
              and in other territories something longer again with a currency
              word in it — so the hero SHRINKS to fit rather than wrapping or
              running into the wordmark, which is what it did at the design's
              fixed size. The wordmark beside it never gives ground. */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
            style={{ fontFamily: fonts.numHeavy, fontSize: 46, letterSpacing: -1.8, lineHeight: 54, color: p.text }}
          >
            {offerPrice}
          </Text>
          {/* Bigger than the design's 12.5px: this line carries the saving,
              which is half the offer, and at caption size it read as fine
              print beside a 46px headline. */}
          <Text numberOfLines={1} style={{ fontSize: 15, color: p.textDim, marginTop: -1 }}>
            a year{' '}
            <Text style={{ color: p.textFaint, textDecorationLine: 'line-through' }}>{full}</Text>
          </Text>
        </View>
      </View>

      <Text style={{ fontSize: 14.5, lineHeight: 22, color: p.textDim, marginBottom: 16 }}>
        Prices go up next year. This is your chance to lock in a great price.
      </Text>

      {/* Four tiles, each a step BELOW the card surface rather than a colour of
          its own: black at half strength over `sunk` is the design's #0a0a0b in
          the dark theme and the right direction in the light one. */}
      <View style={{ flexDirection: 'row', gap: 7 }}>
        {clock.map((c) => (
          <View key={c.l} style={{
            flex: 1, backgroundColor: hexA(p.bg, 0.5), borderRadius: 13,
            paddingTop: 9, paddingBottom: 8, alignItems: 'center',
          }}>
            <Text style={{ fontFamily: fonts.numBold, fontSize: 21, lineHeight: 21, color: p.text }}>{c.v}</Text>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.6, color: p.textFaint, marginTop: 4 }}>{c.l}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 16 }} />

      {/* No button when the store has told us this device can never complete a
          purchase: the tap would fire `oac` and then die in loadProducts before
          requestPurchase, recording an offer as accepted that could not
          convert. */}
      {blocked ? <StoreBlockedNotice text={blocked} /> : (
        <Pressable
          onPress={() => { pingOfferAccepted('holiday'); subscribe(FOUNDER_SKU, 'holiday'); }}
          disabled={purchasing}
          style={({ pressed }) => [
            { height: 52, borderRadius: 16, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' },
            (pressed || purchasing) && { opacity: 0.8 },
          ]}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
            {purchasing ? 'Starting…' : `Lock in ${offerPrice}/yr`}
          </Text>
        </Pressable>
      )}

      {/* A store failure has to be said out loud here, or the button just
          flashes "Starting…" and reverts (see src/store/iap.ts). */}
      {error && !blocked ? (
        <Text style={{ color: '#d63b3b', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 9 }}>{error}</Text>
      ) : null}

      <Text style={{ fontSize: 12, color: p.textFaint, textAlign: 'center', marginTop: 10 }}>
        Ends Monday 11:59pm ET · Cancel anytime
      </Text>
    </View>
  );
}
