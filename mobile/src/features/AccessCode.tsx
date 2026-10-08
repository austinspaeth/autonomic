/**
 * The access-code card. Reached by holding the Subscription row in Settings —
 * unlabelled on purpose, like the support dump: a code is something the
 * developer hands to one person along with where to type it, not a field every
 * user should wonder whether they are missing.
 *
 * One input, one button. The answer is said INSIDE the card (a toast cannot be
 * seen from a sheet), and the three ways it can go wrong are three different
 * sentences, since "that code is wrong" and "we could not ask" call for
 * different next moves.
 */
import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button } from '../components/ui';
import { type SheetControls } from '../components/Sheet';
import { radius, usePalette } from '../theme';
import { StoreError, StoreOkNotice } from './Paywall';
import { redeemAccessCode, type RedeemResult } from '../store/accessCode';
import { CODE_MAX, grantAddedText, isPlausibleCode } from '../lib/accessCode';

const FAILURE: Record<Exclude<RedeemResult['status'], 'ok'>, string> = {
  used: 'This code has already been used.',
  invalid: 'That code isn\'t valid. Check it and try again.',
  unreachable: 'Couldn\'t check the code. Check your connection and try again.',
};

export function AccessCodeSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const valid = isPlausibleCode(code);
  const done = result?.status === 'ok';

  const submit = async () => {
    if (!valid || busy || done) return;
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
        editable={!busy && !done}
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

      {result && result.status !== 'ok' ? (
        <View style={{ marginBottom: 12 }}><StoreError text={FAILURE[result.status]} /></View>
      ) : null}
      {result?.status === 'ok' ? (
        <View style={{ marginBottom: 12 }}><StoreOkNotice text={grantAddedText(result.days)} /></View>
      ) : null}

      {done
        ? <Button title="Done" variant="primary" onPress={controls.close} />
        : <Button title={busy ? 'Checking…' : 'Apply code'} variant="primary" disabled={!valid || busy} onPress={() => { void submit(); }} />}
      <View style={{ height: 20 }} />
    </View>
  );
}
