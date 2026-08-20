/**
 * Screenshot scenes — DEV-ONLY marketing captures.
 *
 * These routes render the app's real screens frozen in an ideal state on pure
 * black, with a marketing headline (Space Grotesk) baked in, so the iOS
 * simulator screenshot IS the finished App Store asset. Reached from the dev
 * link in the Settings menu (only shown under __DEV__). Nothing here ships.
 */
import React from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

/** Space Grotesk faces (loaded in ./_layout). Titles/captions only — in-app UI
 *  keeps its own type so the screens stay pixel-faithful. */
export const SG = {
  bold: 'SpaceGrotesk_700Bold',
  semi: 'SpaceGrotesk_600SemiBold',
  med: 'SpaceGrotesk_500Medium',
} as const;

/** The scene catalogue (drives the index list + ordering). */
export const SCENES: { slug: string; n: number; title: string; caption: string; tag?: string }[] = [
  { slug: 'journal', n: 1, title: 'See your nervous system recover', caption: 'For long COVID, POTS & dysautonomia recovery.' },
  { slug: 'breathing', n: 2, title: 'Measure your HRV as you breathe', caption: 'Five guided minutes with a chest strap, Apple Watch, or your camera.', tag: 'App Store' },
  { slug: 'breathing-play', n: 2, title: 'Measure your HRV as you breathe', caption: 'Five guided minutes with a chest strap or your phone camera.', tag: 'Play Store' },
  { slug: 'measure', n: 3, title: 'A clinical HRV lab in your pocket', caption: 'Every metric computed and graded on your phone. Nothing is uploaded, ever.' },
  { slug: 'understand', n: 4, title: 'Every reading graded, and what today is good for', caption: 'A plain-language read on your day.' },
  { slug: 'plan', n: 5, title: 'Build your own recovery protocol', caption: 'You define the clean day. The app holds you to it.' },
  { slug: 'live', n: 6, title: 'Log everything, not just the numbers', caption: 'Supplements, triggers, symptoms, hydration and digestion, in one day.' },
  { slug: 'insights', n: 7, title: 'Find what moves your numbers', caption: 'Real statistics on your own data, not a hunch about what worked.' },
  { slug: 'sleep', n: 8, title: 'Recovery is decided at night', caption: 'Every stage, your overnight heart rate and dip, and how the day after went.' },
  { slug: 'payoff', n: 9, title: 'And watch your numbers climb', caption: 'By day, week, month or year. Every reading graded and plotted for you.' },
  { slug: 'trust', n: 10, title: '100% on your phone. No cloud, no account, no tracking.', caption: 'Your most sensitive data never leaves your device.' },
];

/** Marketing headline block shared across scenes. Type scales with the device
 *  width so it reads the same on every simulator size. */
export function Headline({ title, caption, center, titleScale = 1 }: { title: string; caption: string; center?: boolean; titleScale?: number }) {
  const { width } = useWindowDimensions();
  const titleSize = Math.round(width * 0.084 * titleScale);
  const capSize = Math.round(width * 0.039);
  const align = center ? 'center' : 'left';
  return (
    <View>
      <Text style={{ color: '#f2f2f5', fontFamily: SG.bold, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.12), letterSpacing: -0.5, textAlign: align }}>
        {title}
      </Text>
      <Text style={{ color: '#9a9aa0', fontFamily: SG.med, fontSize: capSize, lineHeight: Math.round(capSize * 1.35), marginTop: 10, textAlign: align }}>
        {caption}
      </Text>
    </View>
  );
}
