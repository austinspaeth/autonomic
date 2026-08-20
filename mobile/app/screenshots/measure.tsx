/**
 * Scene 2 · "Measure" — the real HRV Results screen (ReadingSummary) framed as
 * a clinical readout: hero Autonomic score, graded metric rows with their tints
 * and sparklines, power distribution. Headline "A clinical HRV lab in your pocket".
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { ResultsScreen } from './_screens';

export default function MeasureScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="A clinical HRV lab in your pocket"
        caption="Every metric computed and graded on your phone. Nothing is uploaded, ever."
      >
        <ResultsScreen />
      </AppStoreSlide>
    </>
  );
}
