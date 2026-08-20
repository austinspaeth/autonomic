/**
 * Scene 5 · "Live it" — the real Journal day view (header + nav bar) scrolled to
 * show the breadth of tracking: medications, a symptom, no triggers, hydration.
 * Headline "Track it all — water, meds, even digestion".
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { LiveJournalScreen } from './_screens';

export default function LiveScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="Log everything, not just the numbers"
        caption="Supplements, triggers, symptoms, hydration and digestion, in one day."
      >
        <LiveJournalScreen />
      </AppStoreSlide>
    </>
  );
}
