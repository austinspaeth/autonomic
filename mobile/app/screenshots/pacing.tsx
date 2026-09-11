/**
 * Scene · "Know how much today can take" — the real pacing sheet open over
 * today, from the imported journal. The feature push: the budget, what the day
 * has spent and where it went, all from the app's own BudgetSheet.
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { PacingSheetScreen } from './_screens';

export default function PacingScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="Know how much today can take"
        caption="A daily pacing budget, set by your HRV and spent as you move."
      >
        <PacingSheetScreen />
      </AppStoreSlide>
    </>
  );
}
