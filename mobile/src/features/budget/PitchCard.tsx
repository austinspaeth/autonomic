/**
 * "See what it does": what the pacing budget is, for somebody who cannot see it.
 *
 * Four things make this card work, and all four are easy to undo by accident:
 *
 *   IT SHOWS THE THING. A live-looking strip sits in the middle of the card so
 *   the reader sees the object they are buying before the bullets describe it.
 *   The numbers in it are FIXED SAMPLES, never the user's own — a real value
 *   here would be the preview the lock exists to withhold.
 *
 *   FOUR CLAIMS, NO MORE. A fifth line pushes the button below the fold on a
 *   small phone.
 *
 *   THE LAST CLAIM IS A LIMITATION. "It tells you when it is wrong" is an odd
 *   thing to put on a paywall and it is the strongest line here, for an
 *   audience that has been oversold by health apps before.
 *
 *   PRICE SITS UNDER THE BUTTON. The decision is whether the feature is worth
 *   having; price is a detail confirmed after that. Above the button it turns
 *   the card into a receipt.
 */
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import type { SheetControls } from '../../components/Sheet';
import { hexA } from '../../lib/color';
import { SCORE_COLORS } from '../../lib/scoring';
import { fonts, usePalette } from '../../theme';
import { MONTHLY_SKU, YEARLY_SKU, priceOf, useIap } from '../../store/iap';
import { PACING_TRIAL_DAYS, usePacingTrial, usePacingUnlocked } from '../../store/pacingTrial';
import { usePaywall } from '../Paywall';

/** The sample strip's numbers. Fixed, and deliberately not the reader's. */
const SAMPLE = { left: '3h 20m', of: 'left of 5h 30m', fill: 0.39, pace: 0.46 };

const PERKS = [
  { title: 'A number in minutes, not points', body: 'Hours and minutes of effort you can picture against your own afternoon.' },
  { title: 'See where it went', body: 'Ranked by source: minutes above your own exertion line, upright time, logged activities.' },
  { title: 'Built from your own baselines', body: 'Every input is stated against your usual, never a population range.' },
  { title: 'It tells you when it is wrong', body: 'An honest readout of how often staying under budget actually held.' },
];

export function BudgetPitchCard({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { products } = useIap();
  const unlocked = usePacingUnlocked();
  const { spent } = usePacingTrial();
  const openPaywall = usePaywall('pacing');

  const closeRef = React.useRef(controls.close);
  closeRef.current = controls.close;
  useEffect(() => { if (unlocked) closeRef.current(); }, [unlocked]);

  const mPrice = priceOf(products.find((s) => s.productId === MONTHLY_SKU), MONTHLY_SKU);
  const yPrice = priceOf(products.find((s) => s.productId === YEARLY_SKU), YEARLY_SKU);

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <Icon name="lock" size={14} color={p.textDim} strokeWidth={2.2} />
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: p.textDim }}>
          Pacing budget
        </Text>
      </View>

      <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.35, lineHeight: 26, color: p.text, marginBottom: 9 }}>
        Know how much today can absorb, before you spend it
      </Text>
      <Text style={{ fontSize: 13.5, lineHeight: 21, color: hexA(p.text, 0.62), marginBottom: 16 }}>
        Each morning your readings set a budget in minutes. The app tracks what the day uses and tells you where you stand against it.
      </Text>

      {/* Said once, plainly, and only to somebody who actually had the window:
          a feature that was on last week and is off today reads as a fault
          unless the card names what happened. It is a statement of fact, not a
          second pitch, so it carries no price and no button of its own. */}
      {spent ? (
        <Text style={{ fontSize: 12.5, lineHeight: 19, color: p.textDim, marginBottom: 16 }}>
          {`Your ${PACING_TRIAL_DAYS} free days of Pacing have ended.`}
        </Text>
      ) : null}

      <View style={{ backgroundColor: p.sunk, borderRadius: 18, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 13, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginBottom: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: p.textDim }}>Pacing</Text>
          <Text style={{ fontFamily: fonts.numHeavy, fontSize: 15, color: p.text, fontVariant: ['tabular-nums'] }}>{SAMPLE.left}</Text>
          <Text style={{ fontSize: 12, color: p.textDim }}>{SAMPLE.of}</Text>
        </View>
        {/* Drawn inline rather than with <BudgetBar/>: this one must never be
            able to animate or read a real state. */}
        <View style={{ height: 12, borderRadius: 999, backgroundColor: hexA(p.text, 0.06) }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${SAMPLE.fill * 100}%`, borderRadius: 999, backgroundColor: SCORE_COLORS.good }} />
          <View style={{ position: 'absolute', left: `${SAMPLE.pace * 100}%`, top: -4, bottom: -4, width: 2, marginLeft: -1, borderRadius: 999, backgroundColor: hexA(p.text, 0.84) }} />
        </View>
        <Text style={{ textAlign: 'center', fontSize: 11, color: p.textDim, marginTop: 20 }}>
          Lives inside your Autonomic Outlook card
        </Text>
      </View>

      {PERKS.map((k) => (
        <View key={k.title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 9 }}>
          <View style={{ marginTop: 2 }}>
            <Icon name="check" size={15} color={SCORE_COLORS.good} strokeWidth={2.8} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: p.text }}>{k.title}</Text>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.textDim, marginTop: 2 }}>{k.body}</Text>
          </View>
        </View>
      ))}

      <View style={{ borderTopWidth: 1, borderTopColor: p.border, marginTop: 13, paddingTop: 15 }}>
        <View style={{ flexDirection: 'row' }}>
          <Button title="Purchase Pro" variant="primary" onPress={openPaywall} />
        </View>
        <Text style={{ textAlign: 'center', fontSize: 12, color: p.textDim, marginTop: 12 }}>
          {`${mPrice} a month or ${yPrice} a year`}
        </Text>
        <Pressable
          onPress={controls.close}
          accessibilityRole="button"
          style={{ alignItems: 'center', justifyContent: 'center', height: 40, marginTop: 4 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: p.textDim }}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}
