import { requireNativeModule } from 'expo-modules-core';

interface WidgetBridgeNative {
  /** Store the widget payload JSON in the app group and reload all timelines. */
  setWidgetData(json: string): Promise<void>;
}

let mod: WidgetBridgeNative | null | undefined;

/** The native module, or null when it isn't built in (non-iOS / old binaries). */
export function widgetBridge(): WidgetBridgeNative | null {
  if (mod !== undefined) return mod;
  try {
    mod = requireNativeModule('WidgetBridge') as WidgetBridgeNative;
  } catch {
    mod = null;
  }
  return mod;
}
