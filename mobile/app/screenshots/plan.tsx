/**
 * Scene 4 · "Make a plan" — the real clean-day Protocol editor with the user's
 * requirements toggled (Water / Sleep / No triggers / two meds ON, Activities
 * OFF). Headline "Build your own recovery protocol".
 */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppStoreSlide } from './_device';
import { ProtocolEditorScreen } from './_screens';

export default function PlanScene() {
  return (
    <>
      <StatusBar hidden />
      <AppStoreSlide
        title="Build your own recovery protocol"
        caption="You define the clean day. The app holds you to it."
      >
        <ProtocolEditorScreen />
      </AppStoreSlide>
    </>
  );
}
