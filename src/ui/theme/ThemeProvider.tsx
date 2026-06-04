// Theme context + hooks. Replaces the legacy applyTheme/toggleTheme + data-theme
// attribute (docs/index.html:1838-1852). In Phase B this will read/write the
// persisted `settings.theme` via the Repository; for now it defaults to the OS
// scheme and holds the choice in state.
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import type { ThemeName } from '@core/types';
import { THEMES, type Tokens } from './tokens';

interface ThemeContextValue {
  name: ThemeName;
  theme: Tokens;
  setTheme: (name: ThemeName) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Persisted theme (Phase B). When omitted, follows the OS color scheme. */
  value?: ThemeName;
  onChange?: (name: ThemeName) => void;
}

export function ThemeProvider({ children, value, onChange }: ThemeProviderProps) {
  const system = useColorScheme();
  const [local, setLocal] = useState<ThemeName>(value ?? (system === 'dark' ? 'dark' : 'light'));
  const name = value ?? local;

  const setTheme = useCallback(
    (next: ThemeName) => {
      setLocal(next);
      onChange?.(next);
    },
    [onChange],
  );

  const toggleTheme = useCallback(() => {
    setTheme(name === 'light' ? 'dark' : 'light');
  }, [name, setTheme]);

  const ctx = useMemo<ThemeContextValue>(
    () => ({ name, theme: THEMES[name], setTheme, toggleTheme }),
    [name, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={ctx}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within <ThemeProvider>');
  return ctx;
}

/** The active token set. */
export function useTheme(): Tokens {
  return useThemeContext().theme;
}

type NamedStyles<T> = { [P in keyof T]: object };

/**
 * Memoized themed StyleSheet. The factory runs once per theme so returned style
 * objects keep stable references across re-renders (no reconciliation churn).
 */
export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (t: Tokens) => T,
): T {
  const { name, theme } = useThemeContext();
  // Re-create only when the theme name changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create(factory(theme)), [name]);
}
