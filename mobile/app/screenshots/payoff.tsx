/**
 * Scene 7 · "The payoff" — the Analysis RMSSD trend climbing amber → green over
 * 12 weeks, with the +delta tile. Headline "And watch your numbers climb".
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { TrendScreen } from './_screens';

export default function PayoffScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="And watch your numbers climb"
        caption="12 weeks of real recovery."
      >
        <TrendScreen />
      </AppStoreSlide>
    </>
  );
}
