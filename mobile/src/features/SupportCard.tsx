/**
 * "Questions? Concerns? Email us!" — the support card, and the tap behind it.
 *
 * Lifted out of Settings so the two places that offer it cannot drift apart.
 * The second is the watch setup card, where it earns its place for a different
 * reason: that flow crosses into another company's app twice (Garmin Connect,
 * then the Connect IQ store) and every way it can fail happens outside our
 * process, where no diagnostic of ours can see it. A dead end there has to lead
 * to a person.
 *
 * The card is deliberately dark in BOTH themes, like the brand card it sits
 * under in Settings, so its text is hardcoded light rather than palette-driven.
 */
import React from 'react';
import { Linking, Pressable, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { radius } from '../theme';
import { useToast } from '../components/Toast';
import { SUPPORT_EMAIL } from '../lib/diagnostics/supportEmail';

/** Open the user's mail client at the support address. Devices with no mail
 *  account (and the iOS Simulator, which has no Mail.app at all) can't handle
 *  `mailto:` — copy the address instead of failing silently. */
export async function emailSupport(toast: (m: string) => void) {
  try {
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  } catch {
    await Clipboard.setStringAsync(SUPPORT_EMAIL);
    toast(`Email copied: ${SUPPORT_EMAIL}`);
  }
}

export function SupportCard({ prompt = 'Questions? Concerns? Email us!', style }: {
  /** The line above the address. Settings asks generally; a setup card asks
   *  about the thing the user is stuck on. */
  prompt?: string;
  style?: { marginTop?: number };
}) {
  const toast = useToast();
  return (
    <Pressable
      onPress={() => emailSupport(toast)}
      style={({ pressed }) => [
        { marginTop: style?.marginTop ?? 22, paddingVertical: 18, paddingHorizontal: 16, borderRadius: radius.card, backgroundColor: '#242427' },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={{ fontSize: 13.5, color: '#c9c9cf', textAlign: 'center' }}>{prompt}</Text>
      <Text style={{ fontSize: 14.5, fontWeight: '600', color: '#f2f2f5', textAlign: 'center', marginTop: 5 }}>{SUPPORT_EMAIL}</Text>
    </Pressable>
  );
}
