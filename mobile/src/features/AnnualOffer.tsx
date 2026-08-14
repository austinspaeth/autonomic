/**
 * The half-off annual offer card — Claude Design "Annual Offer Card".
 *
 * Raised in the Journal under the Autonomic Outlook when a free user reaches
 * 30, 90, 180 or 365 days since install, and live for exactly 24 hours from the
 * moment it first renders. The same 24 hours also unlocks Pro
 * (src/store/tier.ts reads the window and reports 'trial'), because a discount
 * on something you have never been allowed to use is not an argument.
 *
 * Two departures from the design: no ✕, and no red radial glow. Dismissal is an
 * accordion collapse like every other Journal card — there is nothing to
 * permanently dismiss when the thing expires on its own in a day.
 *
 * All the decisions live in src/lib/upsell/annual.ts (pure, tested); this file
 * adopts a live window or opens a due one, then renders it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Icon } from '../components/Icon';
import { useSheets } from '../components/Sheet';
import { useAccordion } from '../components/ui';
import { radius, usePalette } from '../theme';
import { useAppState } from '../store/store';
import { getInstalledAtMs, recheckTier, useTier } from '../store/tier';
import { PROMO_YEARLY_SKU, YEARLY_SKU, priceOf, subscribe, useIap } from '../store/iap';
import { SCORE_COLORS } from '../lib/scoring';
import { todayKey } from '../lib/dates';
import { resolveProtocol } from '../lib/scoring/day';
import { detectDownturn } from '../lib/scoring/downturn';
import { dueMilestone, formatMsLeft, liveOffer, offerMsLeft } from '../lib/upsell/annual';
import { FORCE_ANNUAL_OFFER, annualMemory, noteAnnualOfferCollapsed, noteAnnualOfferStarted } from '../lib/upsell/annualMemory';
import { noteAnnualOfferPacing } from '../lib/upsell';

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const GREEN = SCORE_COLORS.great;

/** Names the user's own tenure, so the card's reason can't drift from the
 *  milestone that fired it. */
const BLURB: Record<number, string> = {
  30: 'A month of data is where the trends start to mean something.',
  90: 'Three months in. Long enough to see what actually moves your numbers.',
  180: 'Half a year logged. The seasonal patterns are in there waiting.',
  365: 'A year of your own data. Unlock everything it can tell you.',
};

const PERKS = [
  'Trends across weeks, months and years',
  'POTS testing and episode tracking',
  'AI analysis and doctor report',
];

/**
 * Monthly equivalent of a localized yearly price, keeping whatever currency
 * shape the store handed us ("$24.99" -> "$2"). Null when the price doesn't
 * parse, in which case the clause is left off rather than guessed at.
 *
 * Rounded to a whole unit for the headline, which is why every caller has to
 * say "about": $24.99/12 is $2.08, so a bare "$2/mo" would understate what the
 * store actually charges. Falls back to two decimals where rounding would read
 * as free.
 */
function perMonth(price: string): string | null {
  const m = price.match(/\d[\d.,]*/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const each = n / 12;
  const rounded = Math.round(each);
  return price.replace(m[0], rounded >= 1 ? String(rounded) : each.toFixed(2));
}

/** How often the countdown redraws. The card shows hours and minutes, so a
 *  half-minute tick is already finer than the smallest digit it displays. */
const TICK_MS = 30_000;

export function AnnualOfferCard() {
  const p = usePalette();
  const { products, purchasing, error } = useIap();
  const { depth } = useSheets();
  const state = useAppState();
  const tier = useTier();
  // Open on the first showing, and on every showing after that unless the user
  // folded it away — that choice outlives the launch (see annualMemory), but
  // not the offer: a new milestone starts a fresh window with no `collapsed`.
  const [expanded, setExpanded] = useState(() => !annualMemory().collapsed);
  const openedExpanded = useRef(expanded).current;
  // An ALREADY-RUNNING window is a pure read, so adopt it during the first
  // render rather than in the effect below: resolving it a frame later made the
  // card pop in under the Outlook on launch and shove the rest of the Journal
  // down. Opening a NEW window still happens in the effect — it writes MMKV and
  // re-derives the tier, neither of which belongs in render.
  const [offer, setOffer] = useState<{ milestone: number; msLeft: number } | null>(
    () => liveOffer(Date.now(), annualMemory()),
  );
  const { chevStyle, bodyStyle, onContentLayout, measureStyle } = useAccordion(expanded, openedExpanded);
  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    noteAnnualOfferCollapsed(!next);
  };

  // Adopt a window that's already running, or open a due one. Ask once and then
  // hold: re-entering would re-evaluate against a tier this very card changed.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current) return;
    const now = Date.now();
    const mem = annualMemory();
    const live = liveOffer(now, mem);
    // Functional update so re-adopting the window seeded above is a no-op
    // rather than a fresh object identity and another render.
    if (live) { settled.current = true; setOffer((o) => o ?? live); return; }
    // 'trial' here means the 7-day install window is still running (a live
    // offer would have been adopted above) and 'pro' means there is nothing to
    // sell. Either way, don't spend a milestone on them.
    if (tier !== 'free') return;
    if (depth > 0) return;                       // a sheet is open; not now
    const due = (__DEV__ && FORCE_ANNUAL_OFFER) || dueMilestone(getInstalledAtMs(), now, mem);
    if (!due) return;
    // Never open the window on a day the user is already having a bad time. The
    // milestone is not spent, so it fires on a calmer open instead.
    if (state.settings.crashAlert?.lastFired === todayKey()) return;
    if (detectDownturn(state.days, todayKey(), { sex: state.profile.sex, height: state.profile.height },
      resolveProtocol(state.settings.protocol), state.customTypes)) return;

    settled.current = true;
    const next = noteAnnualOfferStarted(due, now);
    noteAnnualOfferPacing();   // the generic upsell keeps its distance afterwards
    recheckTier();             // Pro lights up in the same frame the card appears
    setOffer({ milestone: due, msLeft: offerMsLeft(now, next) });
  }, [tier, depth, state]);

  // Countdown. Also what retires the card: when the window closes, the tier
  // re-derives back to free and the card unmounts itself.
  useEffect(() => {
    if (!offer) return;
    const id = setInterval(() => {
      const left = offerMsLeft(Date.now(), annualMemory());
      if (left <= 0) { setOffer(null); recheckTier(); return; }
      setOffer((o) => (o ? { ...o, msLeft: left } : o));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [offer]);

  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // The offer converted (or an entitlement arrived from a restore on another
  // device): there is nothing left to sell, so the card goes immediately rather
  // than riding out the rest of its 24 hours in front of a paying subscriber.
  // 'trial' is NOT this case — that's the unlock this very card granted.
  if (!offer || tier === 'pro') return null;

  const promo = priceOf(products.find((s) => s.productId === PROMO_YEARLY_SKU), PROMO_YEARLY_SKU);
  const full = priceOf(products.find((s) => s.productId === YEARLY_SKU), YEARLY_SKU);
  const monthly = perMonth(promo);

  return (
    <View style={{ borderWidth: 1, borderColor: hexA(p.accent, 0.28), borderRadius: radius.card, backgroundColor: p.surface, marginBottom: 12, overflow: 'hidden' }}>
      <Pressable onPress={toggle} style={{ padding: 15 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ backgroundColor: p.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 }}>
            <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1 }}>50% OFF</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: p.textDim }}>One year of Pro</Text>
          <Animated.View style={chevStyle}>
            <Icon name="chevron" size={18} color={p.textDim} />
          </Animated.View>
        </View>

        <Animated.View style={[{ overflow: 'hidden' }, bodyStyle]}>
          <View onLayout={onContentLayout} style={[measureStyle, { paddingTop: 14 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 19, fontWeight: '700', color: p.text, letterSpacing: -0.3 }}>
                {`A year of Pro for ${promo}`}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: p.textDim, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] }}>
                {full}
              </Text>
            </View>
            <Text style={{ fontSize: 13, lineHeight: 19, color: p.textDim, marginTop: 8 }}>
              {/* The per-month figure is DERIVED from the store's own localized
                  price, never a hardcoded "$2" — it has to stay true in every
                  currency. The leading ~ is load-bearing: the figure is rounded
                  to a whole unit ($24.99/12 is $2.08), so a bare "$2/mo" would
                  understate the real charge, and a price claim that doesn't
                  match what the store takes is the kind reviewers reject. */}
              {`${BLURB[offer.milestone] || BLURB[30]}${monthly ? ` Unlock the full picture for ~${monthly}/mo.` : ' Unlock the full picture.'}`}
            </Text>

            <View style={{ gap: 9, marginTop: 15 }}>
              {PERKS.map((t) => (
                <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Icon name="check" size={13} color={GREEN} strokeWidth={2.6} />
                  <Text style={{ flex: 1, fontSize: 13, color: p.text }}>{t}</Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border, borderRadius: 14, padding: 13, marginTop: 16 }}>
              <Icon name="lock" size={19} color={p.accent} strokeWidth={2.2} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: p.text }}>Pro is unlocked for 24 hours</Text>
                <Text style={{ fontSize: 12, lineHeight: 17, color: p.textDim, marginTop: 2 }}>
                  Try the full experience free, then decide.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => subscribe(PROMO_YEARLY_SKU)}
              disabled={purchasing}
              style={({ pressed }) => [
                { height: 50, borderRadius: 16, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
                (pressed || purchasing) && { opacity: 0.8 },
              ]}
            >
              <Text style={{ color: '#fff', fontSize: 15.5, fontWeight: '700' }}>{purchasing ? 'Starting…' : 'Claim half off'}</Text>
            </Pressable>

            {/* A store failure has to be said out loud here too, or the button
                just flashes "Starting…" and reverts (see src/store/iap.ts). */}
            {error ? (
              <Text style={{ color: '#d63b3b', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 9 }}>{error}</Text>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 11 }}>
              <Animated.View style={[{ width: 5, height: 5, borderRadius: 3, backgroundColor: p.accent }, dotStyle]} />
              <Text style={{ fontSize: 11.5, color: p.textDim }}>
                {`Access and offer both end in ${formatMsLeft(offer.msLeft)}`}
              </Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}
