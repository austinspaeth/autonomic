// Box — a plain View wrapper. Kept as a named primitive so layout code reads
// consistently and we have one place to extend (e.g. testID conventions).
import React from 'react';
import { View, type ViewProps } from 'react-native';

export const Box = React.forwardRef<View, ViewProps>(function Box(props, ref) {
  return <View ref={ref} {...props} />;
});
