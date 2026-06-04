// Sheet headings — legacy .modal h2 / .modal h3 (docs/index.html).
import React from 'react';
import { Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';

export function H2({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 18, fontWeight: '700', color: t.text, marginRight: 40, marginBottom: 16 }}>
      {children}
    </Text>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.7,
        color: t.textDim,
        fontWeight: '700',
        marginTop: 18,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}
