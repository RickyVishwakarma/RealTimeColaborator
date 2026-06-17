import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const KEY = 'folio-theme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The active theme: an explicit user choice, otherwise the OS preference. */
function resolveTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  return stored === 'light' || stored === 'dark' ? stored : systemTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/** Apply the resolved theme as early as possible (called before render). */
export function initTheme(): void {
  applyTheme(resolveTheme());
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

/**
 * Shared theme store so every toggle (user menu, editor header) stays in sync
 * and the choice is persisted.
 */
export const useTheme = create<ThemeState>((set, get) => ({
  theme: resolveTheme(),
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    applyTheme(next);
    set({ theme: next });
  },
}));
