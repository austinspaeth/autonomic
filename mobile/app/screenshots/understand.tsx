/**
 * Scene 3 · "Understand" — the day outlook: the real ScoredHero card with a
 * Moderate rating and its plain-language guidance, the grade legend, and three
 * graded vitals. Headline "Every reading graded — and what today is good for".
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { DayOutlookScreen } from './_screens';

export default function UnderstandScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="Every reading graded, and what today is good for"
        caption="A plain-language read on your day."
      >
        <DayOutlookScreen />
      </AppStoreSlide>
    </>
  );
}
