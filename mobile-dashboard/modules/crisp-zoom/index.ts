/* A container for content shown under a scale transform, which keeps it sharp
   by redrawing everything inside at the zoomed resolution (see
   ios/CrispZoomModule.swift). On a build without the native view it is a
   plain View: the zoom still works, it is just stretched rather than redrawn. */
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { View, type ViewProps } from 'react-native';
import type { ComponentType } from 'react';

type Props = ViewProps & { zoom: number };

/* Asked for only when the binary has it: a build from before the module was
   added (a simulator build still on screen) must not even try. */
let Native: ComponentType<Props> | null = null;
try {
  if (requireOptionalNativeModule('CrispZoom')) Native = requireNativeViewManager<Props>('CrispZoom');
} catch {
  Native = null;
}

export const CrispZoomView: ComponentType<Props> = Native ?? (View as unknown as ComponentType<Props>);
