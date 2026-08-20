/**
 * Scene 2 · the live reading. The app's real `SessionCard` over a fabricated
 * store snapshot: a paced 4/6 chest-strap session at 2:47 remaining, 72 bpm,
 * SDNN 38, with the respiratory wave visible in the beat-to-beat trace.
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { BreathSessionScreen } from './_screens';

export default function BreathingScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="Paced breathing, beat by beat"
        caption="Live HRV from a chest strap, your camera, or Apple Watch."
      >
        <BreathSessionScreen />
      </AppStoreSlide>
    </>
  );
}
