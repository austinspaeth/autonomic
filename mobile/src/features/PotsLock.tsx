/**
 * The Pro gate over a POTS RESULT.
 *
 * Capture is never metered (see `lib/gating.ts`): the Apple Watch runs the POTS
 * Test and the POTS Episode on every tier, because a stand test and an episode
 * happen at a moment that can't be rescheduled around a subscription, and a
 * watch that refuses to record one loses it for good. Pro is what the app makes
 * of the reading — the trace, the POTS-range grading, the comparison with the
 * user's own history — so the gate lands here, on READING the result, never on
 * taking it. The entry is captured, synced and saved to the journal either way.
 *
 * It is a CARD, not a mask. Progress and Insights build the real document and
 * blur it, because there the shape of a locked screen is itself information (a
 * year of charts, a stack of findings) and the header that raised the gate has
 * to stay live. A single reading has neither: the shape behind the blur is one
 * number the user just measured, so showing it dimly is a tease rather than an
 * honest preview, and the sheet has no live header to preserve. So the tap
 * opens this and nothing else — a `fitContent` sheet, which is to say the card
 * sits at the bottom of the device, where every other answer in this app rises
 * from.
 */
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import type { SheetControls } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui';
import { usePalette } from '../theme';
import { getTier, useTier } from '../store/tier';
import { usePaywall } from './Paywall';
import { MONTHLY_SKU, YEARLY_SKU, priceOf, useIap } from '../store/iap';
import { READING_TYPES } from '../lib/registry';
import { fmtTime12 } from '../lib/dates';
import type { Entry } from '../lib/types';

/** The two readings the POTS flows produce, on the wrist or with a strap. */
export const POTS_READING_TYPES = new Set(['orthostatic', 'standTest']);

export function isPotsReading(r: Entry | null | undefined): boolean {
  return !!r && POTS_READING_TYPES.has(String(r.type));
}

/** Checked at tap time, not at render: the answer must be the current one. */
export function isPotsResultLocked(r: Entry | null | undefined): boolean {
  return isPotsReading(r) && getTier() === 'free';
}

/** What a free user gets instead of the result. `subject` names the reading it
 *  stands in for — dropped where the card sits under a header that already
 *  said which capture this was (the live session's results sheet). `onUnlocked`
 *  is what happens the moment the tier stops being free — by default the card
 *  is done and closes; a host that can render the real result in its place
 *  passes its own. */
export function PotsLockedCard({ r, controls, subject = true, onUnlocked }: {
  r: Entry; controls: SheetControls; subject?: boolean; onUnlocked?: () => void;
}) {
  const p = usePalette();
  const { products } = useIap();
  const tier = useTier();
  const openPaywall = usePaywall('pots');
  // Bought it from here: this card is answered. By default the reading it was
  // covering is one tap away in the journal behind it.
  const done = onUnlocked || controls.close;
  const doneRef = React.useRef(done); doneRef.current = done;
  useEffect(() => { if (tier !== 'free') doneRef.current(); }, [tier]);
  const mPrice = priceOf(products.find((s) => s.productId === MONTHLY_SKU), MONTHLY_SKU);
  const yPrice = priceOf(products.find((s) => s.productId === YEARLY_SKU), YEARLY_SKU);
  const label = READING_TYPES[String(r.type)]?.label || 'POTS reading';
  const when = r.time ? fmtTime12(String(r.time)) : '';
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name="lock" size={13} color={p.textDim} strokeWidth={2.4} />
        <Text style={{ color: p.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase' }}>Autonomic Pro</Text>
      </View>
      <Text style={{ color: p.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.2, paddingRight: 100 }}>POTS results are locked</Text>
      {subject ? <Text style={{ color: p.textDim, fontSize: 14, marginTop: 4 }}>{when ? `${label} · ${when}` : label}</Text> : null}
      <Text style={{ color: p.textDim, fontSize: 14.5, lineHeight: 21, marginTop: 14, marginBottom: 18 }}>
        Your reading was captured and saved to your journal, and it stays there. Pro opens the result: the heart-rate trace, the POTS-range grading, and how this one sits against your own history.
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <Button title="Upgrade to Pro" variant="primary" onPress={openPaywall} />
      </View>
      <Text style={{ color: p.textDim, fontSize: 12, textAlign: 'center', marginTop: 12 }}>{`${mPrice}/mo · ${yPrice}/yr · cancel anytime`}</Text>
    </View>
  );
}
