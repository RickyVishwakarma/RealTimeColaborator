import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchResult } from '@rtc/shared';
import { api } from '../api';
import { useTheme } from '../lib/theme';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void | Promise<void>;
}

/** Global Cmd/Ctrl+K palette: jump to a document or run a quick action. */
export function CommandPalette() {
  const navigate = useNavigate();
  const { toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global open shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Reset + focus on open.
  useEffect(() => {
    if (open) {
      setQ('');
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Debounced document search.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const { results } = await api.search(q.trim());
        setResults(results);
      } catch {
        setResults([]);
      }
    }, 200);
  }, [q]);

  const actions: Command[] = useMemo(
    () => [
      {
        id: 'new',
        label: 'New document',
        hint: 'Create',
        run: async () => {
          const { document } = await api.createDocument('Untitled');
          navigate(`/doc/${document.id}`);
        },
      },
      { id: 'theme', label: 'Toggle light / dark theme', hint: 'Theme', run: toggle },
      { id: 'home', label: 'Go to all documents', hint: 'Navigate', run: () => navigate('/') },
    ],
    [navigate, toggle],
  );

  // Actions are filtered by the query; results come from the API.
  const filteredActions = actions.filter((a) =>
    a.label.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const items: Command[] = [
    ...filteredActions,
    ...results.map((r) => ({
      id: `doc-${r.id}`,
      label: r.title,
      hint: 'Document',
      run: () => navigate(`/doc/${r.id}`),
    })),
  ];

  async function select(cmd: Command | undefined) {
    if (!cmd) return;
    setOpen(false);
    await cmd.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void select(items[active]);
    }
  }

  if (!open) return null;

  return (
    <div className="cmdk-backdrop" onClick={() => setOpen(false)}>
      <div className="cmdk card" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          value={q}
          placeholder="Search documents or run a command…"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul className="cmdk-list">
          {items.length === 0 ? (
            <li className="cmdk-empty muted">No matches</li>
          ) : (
            items.map((cmd, i) => (
              <li
                key={cmd.id}
                className={`cmdk-item${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => void select(cmd)}
              >
                <span>{cmd.label}</span>
                {cmd.hint && <span className="cmdk-hint muted">{cmd.hint}</span>}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
