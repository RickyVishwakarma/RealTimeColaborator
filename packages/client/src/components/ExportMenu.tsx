import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { exportHtml, exportMarkdown, printDocument } from '../lib/export';

interface Props {
  editor: Editor | null;
  title: string;
}

export function ExportMenu({ editor, title }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Element)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div className="export-menu" ref={ref}>
      <button className="secondary" onClick={() => setOpen((v) => !v)} disabled={!editor}>
        Export ▾
      </button>
      {open && editor && (
        <div className="export-dropdown card">
          <button className="menu-item" onClick={() => run(() => exportHtml(editor, title))}>
            HTML
          </button>
          <button className="menu-item" onClick={() => run(() => exportMarkdown(editor, title))}>
            Markdown
          </button>
          <button className="menu-item" onClick={() => run(printDocument)}>
            Print / PDF
          </button>
        </div>
      )}
    </div>
  );
}
