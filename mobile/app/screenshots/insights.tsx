/**
 * Scene 6 · Insights: what the app found in the log.
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { InsightsScreen } from './_screens';

export default function InsightsScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="Find what moves your numbers"
        caption="Real statistics on your own data, not a hunch about what worked."
      >
        <InsightsScreen />
      </AppStoreSlide>
    </>
  );
}
