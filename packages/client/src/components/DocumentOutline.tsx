import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

interface Heading {
  level: number;
  text: string;
  pos: number;
}

interface Props {
  editor: Editor | null;
  onClose: () => void;
}

/** Floating table-of-contents derived live from the document's headings. */
export function DocumentOutline({ editor, onClose }: Props) {
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    if (!editor) return;
    const compute = () => {
      const items: Heading[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          items.push({
            level: Number(node.attrs.level) || 1,
            text: node.textContent || 'Untitled',
            pos,
          });
        }
      });
      setHeadings(items);
    };
    compute();
    editor.on('update', compute);
    return () => {
      editor.off('update', compute);
    };
  }, [editor]);

  function goTo(pos: number) {
    if (!editor) return;
    const resolved = editor.view.domAtPos(pos + 1);
    const node = resolved?.node as Node | undefined;
    const el = (node instanceof HTMLElement ? node : node?.parentElement) ?? null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="outline-popover card">
      <div className="outline-head">
        <strong>Outline</strong>
        <button className="link" onClick={onClose}>
          ×
        </button>
      </div>
      {headings.length === 0 ? (
        <p className="muted outline-empty">No headings yet. Add H1–H3 to build an outline.</p>
      ) : (
        <ul className="outline-list">
          {headings.map((h, i) => (
            <li key={`${h.pos}-${i}`} style={{ paddingLeft: `${(h.level - 1) * 0.85}rem` }}>
              <button className="outline-item" onClick={() => goTo(h.pos)} title={h.text}>
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
