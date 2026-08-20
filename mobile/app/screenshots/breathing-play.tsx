/**
 * Scene 2, Play Store cut. Same reading, same mock, without the Apple Watch:
 * Android captures HRV from a Bluetooth strap or the camera, and naming a
 * sensor the reader's phone cannot use is a promise the app would break on
 * first launch. Kept as its own route rather than a Platform.OS branch inside
 * scene 2, because both cuts are shot on whichever simulator is to hand.
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { BreathSessionScreen } from './_screens';

export default function BreathingPlayScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="Measure your HRV as you breathe"
        caption="Five guided minutes with a chest strap or your phone camera."
      >
        <BreathSessionScreen />
      </AppStoreSlide>
    </>
  );
}
