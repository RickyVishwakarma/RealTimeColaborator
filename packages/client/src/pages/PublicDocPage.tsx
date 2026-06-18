import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as Y from 'yjs';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import { api } from '../api';
import { Logo } from '../components/Logo';

/** Decode base64 to bytes without Node's Buffer (browser-safe). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Unauthenticated, read-only view of a published document. Loads the Yjs
 * snapshot into a local doc and renders it with a non-editable TipTap instance
 * (no socket, no presence).
 */
export function PublicDocPage() {
  const { token } = useParams<{ token: string }>();
  const ydoc = useMemo(() => new Y.Doc(), []);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!token) return;
    api
      .getPublicDocument(token)
      .then((doc) => {
        setTitle(doc.title);
        if (doc.snapshot) {
          Y.applyUpdate(ydoc, base64ToBytes(doc.snapshot));
        }
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [token, ydoc]);

  const editor = useEditor(
    {
      editable: false,
      extensions: [StarterKit.configure({ history: false }), Collaboration.configure({ document: ydoc })],
      editorProps: { attributes: { class: 'prose-editor' } },
    },
    [ydoc],
  );

  if (status === 'error') {
    return <div className="center muted">This document isn’t publicly available.</div>;
  }
  if (status === 'loading') {
    return <div className="center muted">Loading…</div>;
  }

  return (
    <div className="public-page">
      <header className="public-bar">
        <Logo />
        <span className="badge">Read-only</span>
      </header>
      <div className="public-doc">
        <h1 className="public-title">{title}</h1>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
