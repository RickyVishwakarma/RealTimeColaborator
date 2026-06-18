import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SlashItem } from '../lib/slashCommand';

export interface SlashMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface Props {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

/** Popup list for the slash (/) command menu. Keyboard nav is driven by the
 *  TipTap suggestion plugin via the imperative onKeyDown handle. */
export const SlashMenu = forwardRef<SlashMenuRef, Props>(({ items, command }, ref) => {
  const [active, setActive] = useState(0);

  useEffect(() => setActive(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') {
        setActive((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setActive((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        command(items[active]);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <div className="slash-menu card">
      {items.map((item, i) => (
        <button
          key={item.title}
          className={`slash-item${i === active ? ' active' : ''}`}
          onMouseEnter={() => setActive(i)}
          onClick={() => command(item)}
        >
          <span className="slash-icon">{item.icon}</span>
          <span className="slash-text">
            <strong>{item.title}</strong>
            <span className="muted">{item.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

SlashMenu.displayName = 'SlashMenu';
