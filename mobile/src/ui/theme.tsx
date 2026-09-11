import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { appStore } from '@/storage';
import { palette, radiusBase, type SchemeName } from '@/ui/tokens';

/**
 * Semantic status colours. Deliberately NOT in theme.json: the webapp encodes
 * these per-component with Tailwind utilities, so there is no shared token to
 * generate from. They are separate from `primary`/`accent` — severity must
 * never be confused with brand.
 */
const status = {
  light: { ok: '#0f9b6c', warn: '#c77a06', crit: '#dc3a3a', offline: '#94a3b8' },
  dark: { ok: '#3fc397', warn: '#e5a53a', crit: '#f4726f', offline: '#64748b' },
} as const;

export type Colors = (typeof palette)[SchemeName] & (typeof status)[SchemeName];

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 } as const;

export const radius = {
  sm: radiusBase / 2,
  md: radiusBase,
  lg: radiusBase * 2,
  pill: 999,
} as const;

/** One scale, used everywhere. Sizes are px; lineHeight is absolute, not a ratio. */
export const type = {
  hero: { fontSize: 64, lineHeight: 64, fontWeight: '700' },
  display: { fontSize: 40, lineHeight: 44, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.8 },
} as const;

export type TypeRole = keyof typeof type;

export type ThemePreference = 'system' | 'light' | 'dark';

const PREF_KEY = 'theme.preference';

function readPreference(): ThemePreference {
  const stored = appStore.getString(PREF_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

type ThemeValue = {
  colors: Colors;
  scheme: SchemeName;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);

  const setPreference = useCallback((next: ThemePreference) => {
    appStore.set(PREF_KEY, next);
    setPreferenceState(next);
  }, []);

  // Dark-first: an unset system preference resolves to dark, not light.
  const scheme: SchemeName =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo<ThemeValue>(
    () => ({ colors: { ...palette[scheme], ...status[scheme] }, scheme, preference, setPreference }),
    [scheme, preference, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
