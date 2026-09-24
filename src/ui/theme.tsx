import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, ThemeColors } from './tokens';
import { ThemePreference } from './types';

const THEME_STORAGE_KEY = 'ui_theme_preference';

type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  colors: ThemeColors;
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(value => {
        if (mounted && isThemePreference(value)) {
          setPreferenceState(value);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextPreference).catch(() => undefined);
  };

  const mode: ThemeMode = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const colors = mode === 'dark' ? darkColors : lightColors;
  const value = useMemo(() => ({ colors, mode, preference, setPreference }), [colors, mode, preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
}
