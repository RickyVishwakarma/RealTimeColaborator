import { useTheme } from '../lib/theme';

/** Compact icon button to flip between light and dark themes. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      className="secondary icon-btn"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
