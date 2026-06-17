import { useEffect, useRef, useState } from 'react';
import type { User } from '@rtc/shared';
import { useTheme } from '../lib/theme';
import { colorForUser } from '../config';

interface Props {
  user: User;
  onLogout: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function UserMenu({ user, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Element)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="avatar avatar-btn"
        style={{ background: colorForUser(user.id) }}
        onClick={() => setOpen((v) => !v)}
        title={user.displayName}
        aria-label="Account menu"
      >
        {initials(user.displayName)}
      </button>

      {open && (
        <div className="user-dropdown card">
          <div className="user-identity">
            <strong>{user.displayName}</strong>
            <span className="muted">{user.email}</span>
          </div>
          <button className="menu-item menu-toggle" onClick={toggle}>
            <span>{theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}</span>
          </button>
          <button className="menu-item" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
