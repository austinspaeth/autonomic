/**
 * Scene 1 · "The promise" — the Live HRV session shown inside an iPhone frame on
 * a glowing branded ground, headlined "See your nervous system recover".
 * Capture it straight from the simulator (⌘S); change the simulator device to
 * re-shoot at each App Store size.
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { LiveHrvScreen } from './_screens';

export default function PromiseScene() {
  return (
    <>
      {/* Hide the real iOS status bar — the mockup draws its own faux 9:41 inside
          the bezel, so the outer time/battery would be a distracting duplicate. */}
      <StatusBar hidden />
      <AppStoreSlide
        title="See your nervous system recover"
        caption="For long COVID, POTS & dysautonomia recovery."
      >
        <LiveHrvScreen />
      </AppStoreSlide>
    </>
  );
}
