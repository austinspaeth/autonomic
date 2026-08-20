/**
 * Scene 7 · the sleep report, pinned to the hypnogram, over the most recent
 * night in the journal.
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { SleepNightScreen } from './_screens';

export default function SleepScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="Recovery is decided at night"
        caption="Every stage, your overnight heart rate and dip, and how the day after went."
      >
        <SleepNightScreen />
      </AppStoreSlide>
    </>
  );
}
