/**
 * Scene 1 · "See your nervous system recover" — the real Journal day view over
 * the real journal, shifted so Sat 8 Aug 2026 reads as today. The hero shot:
 * the score, the day's readings and the breadth of what gets logged, all from
 * data the user actually recorded.
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { JournalHeroScreen } from './_screens';

export default function JournalScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="See your nervous system recover"
        caption="For long COVID, POTS & dysautonomia recovery."
      >
        <JournalHeroScreen />
      </AppStoreSlide>
    </>
  );
}
