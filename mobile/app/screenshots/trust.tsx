/**
 * Scene 8 · "Trust" — the real onboarding "Private & on-device" step, framed as
 * the privacy promise. Headline "100% on your phone. No cloud, no account."
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { TrustScreen } from './_screens';

export default function TrustScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="100% on your phone. No cloud, no account, no tracking."
        caption="Your most sensitive data never leaves your device."
        titleScale={0.72}
      >
        <TrustScreen />
      </AppStoreSlide>
    </>
  );
}
