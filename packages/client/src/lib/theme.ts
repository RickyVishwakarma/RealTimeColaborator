import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'folio-theme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The active theme: an explicit user choice, otherwise the OS preference. */
export function resolveTheme(): Theme {
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

/** React hook: current theme + a toggle that persists the choice. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(resolveTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle(): void {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      return next;
    });
  }

  return { theme, toggle };
}
