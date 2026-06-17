import type { Editor } from '@tiptap/react';

interface Props {
  editor: Editor | null;
}

/** Formatting toolbar bound to a TipTap editor instance. */
export function EditorToolbar({ editor }: Props) {
  if (!editor) return null;

  // Re-render on selection/transaction so active states stay in sync.
  const btn = (active: boolean) => `tb-btn${active ? ' active' : ''}`;

  return (
    <div className="toolbar">
      <button
        className={btn(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button
        className={btn(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <button
        className={btn(editor.isActive('strike'))}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <s>S</s>
      </button>
      <button
        className={btn(editor.isActive('code'))}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Inline code"
      >
        {'</>'}
      </button>

      <span className="tb-sep" />

      <button
        className={btn(editor.isActive('heading', { level: 1 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Heading 1"
      >
        H1
      </button>
      <button
        className={btn(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        H2
      </button>
      <button
        className={btn(editor.isActive('heading', { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        H3
      </button>

      <span className="tb-sep" />

      <button
        className={btn(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        • List
      </button>
      <button
        className={btn(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        1. List
      </button>
      <button
        className={btn(editor.isActive('blockquote'))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Quote"
      >
        ❝
      </button>
      <button
        className={btn(editor.isActive('codeBlock'))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code block"
      >
        { }
      </button>

      <span className="tb-sep" />

      <button
        className="tb-btn"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        ↶
      </button>
      <button
        className="tb-btn"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Y)"
      >
        ↷
      </button>
    </div>
  );
}
