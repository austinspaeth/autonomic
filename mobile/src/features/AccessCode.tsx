/**
 * The access-code card. Reached from "Redeem a code", just above Restore purchase,
 * on the Subscription sheet in Settings (hidden from a subscriber). It
 * used to hide behind a long-press on the Subscription row, which meant every
 * code had to travel with instructions for a gesture nothing on screen hinted at.
 *
 * One input, one button. The answer is said INSIDE the card (a toast cannot be
 * seen from a sheet), and the three ways it can go wrong are three different
 * sentences, since "that code is wrong" and "we could not ask" call for
 * different next moves.
 *
 * A promo code answers with an OFFER instead of a grant: the $24.99 year, with
 * the price the store returned and a button that goes straight to the store.
 * Nothing is spent until that purchase lands (../store/accessCode), so backing
 * out of the store sheet leaves the code good for another try.
 */
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button } from '../components/ui';
import { type SheetControls } from '../components/Sheet';
import { radius, usePalette } from '../theme';
import { StoreError, StoreOkNotice } from './Paywall';
import { redeemAccessCode, type RedeemResult } from '../store/accessCode';
import { CODE_MAX, grantAddedText, isPlausibleCode } from '../lib/accessCode';
import { getTrialDaysLeft } from '../store/tier';
import { PROMO_YEARLY_SKU, priceOf, subscribe, useIap } from '../store/iap';

const FAILURE: Record<Exclude<RedeemResult['status'], 'ok' | 'offer'>, string> = {
  used: 'This code has already been used.',
  invalid: 'That code isn\'t valid. Check it and try again.',
  unreachable: 'Couldn\'t check the code. Check your connection and try again.',
};

export function AccessCodeSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const { products, purchasing, error, blocked, isPro, activeSku } = useIap();
  const valid = isPlausibleCode(code);
  const offer = result?.status === 'offer';
  const bought = offer && isPro && activeSku === PROMO_YEARLY_SKU;
  const done = result?.status === 'ok' || bought;
  const price = priceOf(products.find((x) => x.productId === PROMO_YEARLY_SKU), PROMO_YEARLY_SKU);

  const submit = async () => {
    if (!valid || busy || done || offer) return;
    setBusy(true);
    setResult(null);
    const r = await redeemAccessCode(code);
    setBusy(false);
    setResult(r);
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 8 }}>Enter a code</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 21, marginBottom: 16 }}>
        If you were given an access code, enter it here to unlock full access.
      </Text>

      <TextInput
        value={code}
        onChangeText={(v) => { setCode(v); if (!done) setResult(null); }}
        onSubmitEditing={() => { void submit(); }}
        editable={!busy && !done && !purchasing}
        placeholder="Access code"
        placeholderTextColor={p.textDim}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        // Room for the separators somebody may type between groups.
        maxLength={CODE_MAX + 8}
        keyboardAppearance="dark"
        returnKeyType="done"
        style={{
          marginBottom: 14, backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1,
          borderRadius: radius.control, padding: 12, fontSize: 18, letterSpacing: 1.5, color: p.text,
          textAlign: 'center', fontWeight: '600',
        }}
      />

      {result && result.status !== 'ok' && result.status !== 'offer' ? (
        <View style={{ marginBottom: 12 }}><StoreError text={FAILURE[result.status]} /></View>
      ) : null}
      {result?.status === 'ok' ? (
        <View style={{ marginBottom: 12 }}><StoreOkNotice text={grantAddedText(result.days, getTrialDaysLeft())} /></View>
      ) : null}
      {offer && !bought ? (
        <Text style={{ color: p.text, fontSize: 14, lineHeight: 21, marginBottom: 14 }}>
          {`This code unlocks Pro for ${price} a year. That price stays the same for as long as you stay subscribed.`}
        </Text>
      ) : null}
      {offer && !bought && (error || blocked) ? (
        <View style={{ marginBottom: 12 }}><StoreError text={(error || blocked) as string} /></View>
      ) : null}
      {bought ? (
        <View style={{ marginBottom: 12 }}><StoreOkNotice text="You're subscribed. Thank you!" /></View>
      ) : null}

      {done
        ? <Button title="Done" variant="primary" onPress={controls.close} />
        : offer
          ? <Button title={purchasing ? 'Starting…' : `Subscribe for ${price}/year`} variant="primary" disabled={purchasing} onPress={() => { void subscribe(PROMO_YEARLY_SKU); }} />
          : <Button title={busy ? 'Checking…' : 'Apply code'} variant="primary" disabled={!valid || busy} onPress={() => { void submit(); }} />}
      <View style={{ height: 20 }} />
    </View>
  );
}
