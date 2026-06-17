import { useRef, useState } from 'react';
import type { Collaborator } from '@rtc/shared';

interface Props {
  value: string;
  onChange: (value: string) => void;
  collaborators: Collaborator[];
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}

/**
 * Textarea with @-mention autocomplete. Typing "@" + a name surfaces matching
 * collaborators; selecting inserts "@Display Name ". Mentions are resolved from
 * the final text by the parent (matching collaborator names), so this component
 * stays stateless about which IDs were mentioned.
 */
export function MentionInput({
  value,
  onChange,
  collaborators,
  placeholder,
  rows = 2,
  autoFocus,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const matches =
    query === null
      ? []
      : collaborators
          .filter((c) => c.displayName.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6);

  function detectQuery(text: string, caret: number): void {
    const before = text.slice(0, caret);
    const m = before.match(/@([\p{L}\p{N} ]{0,30})$/u);
    // Only treat as a mention token if it doesn't span a line break.
    if (m && !m[1].includes('\n')) {
      setQuery(m[1].trimStart());
      setActive(0);
    } else {
      setQuery(null);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    onChange(e.target.value);
    detectQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  function pick(c: Collaborator): void {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([\p{L}\p{N} ]{0,30})$/u, `@${c.displayName} `);
    const after = value.slice(caret);
    const next = before + after;
    onChange(next);
    setQuery(null);
    // Restore focus and place caret after the inserted mention.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (query === null || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === 'Escape') {
      setQuery(null);
    }
  }

  return (
    <div className="mention-wrap">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
      />
      {query !== null && matches.length > 0 && (
        <ul className="mention-menu card">
          {matches.map((c, i) => (
            <li
              key={c.userId}
              className={`mention-item${i === active ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
            >
              <strong>{c.displayName}</strong>
              <span className="muted">{c.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Resolve mentioned user IDs by matching "@Display Name" occurrences in text. */
export function resolveMentions(text: string, collaborators: Collaborator[]): string[] {
  const ids = collaborators
    .filter((c) => text.includes(`@${c.displayName}`))
    .map((c) => c.userId);
  return [...new Set(ids)];
}
