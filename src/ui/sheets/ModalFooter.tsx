// ModalFooter — the blurred, pinned action bar (legacy .modal-foot,
// docs/index.html:94-102). Wrap your action buttons in this inside a sheet body
// and pass it via openSheet(..., { footer: <ModalFooter>…</ModalFooter> }).
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@ui/theme/ThemeProvider';
import { GlassSurface } from '@ui/surfaces/GlassSurface';

export function ModalFooter({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <GlassSurface
      tint={t.glassBg}
      blur={16}
      style={{
        borderTopWidth: 1,
        borderTopColor: t.border,
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: 14 + insets.bottom,
      }}
    >
      {children}
    </GlassSurface>
  );
}
