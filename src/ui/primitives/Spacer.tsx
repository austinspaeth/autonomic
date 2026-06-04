// Spacer — fixed-size gap, or flexible (grow) when `flex` is set.
import React from 'react';
import { View } from 'react-native';

export function Spacer({ size = 0, flex }: { size?: number; flex?: boolean }) {
  return <View style={flex ? { flex: 1 } : { width: size, height: size }} />;
}
