import { createContext, useContext } from 'react';

export interface ThemeModeContextValue {
  mode: 'light' | 'dark';
  toggle: () => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error('useThemeMode must be used inside AppProviders');
  return context;
}
