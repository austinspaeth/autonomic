import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import {
  useFonts,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';

/** Headerless, pure-black stack for the screenshot scenes. Loads Space Grotesk
 *  (used only for the baked-in marketing headlines) and holds a black frame
 *  until it registers so no title flashes in a fallback face. */
export default function ScreenshotsLayout() {
  const [loaded] = useFonts({ SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }} />
  );
}
