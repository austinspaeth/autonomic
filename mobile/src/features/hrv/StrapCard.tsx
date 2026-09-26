/**
 * The red "Chest straps are more accurate" card, shared by the camera setup's
 * heads-up step and the camera trouble card. Its own module because Trouble is
 * imported BY CameraSetup, so the card cannot live in either without a cycle.
 */
import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { radius, usePalette } from '../../theme';

/** Strap explainer on the website. The article carries the comparison; any
 *  model named in-app is a single example, not a product list. */
const STRAP_ARTICLE_URL =
  'https://autonomic.care/insights/hrv/best-hrv-chest-strap-polar-h10-coospo-h808s/';

export function StrapCard({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ padding: 16, borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: 'rgba(224,49,39,0.28)', backgroundColor: p.accentSoft }}>
      <Text style={{ color: p.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Chest straps are more accurate</Text>
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>{children}</Text>
      <Pressable
        onPress={() => Linking.openURL(STRAP_ARTICLE_URL).catch(() => {})}
        style={({ pressed }) => [
          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: radius.control, borderWidth: 1, borderColor: 'rgba(224,49,39,0.45)' },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={{ color: p.accent, fontSize: 14, fontWeight: '700' }}>Which strap to buy</Text>
        <Icon name="chevronRight" size={15} color={p.accent} />
      </Pressable>
    </View>
  );
}
