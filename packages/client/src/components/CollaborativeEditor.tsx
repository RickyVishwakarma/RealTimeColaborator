import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import type { User } from '@rtc/shared';
import { canEdit, type DocumentRole } from '@rtc/shared';
import { SocketProvider } from '../lib/SocketProvider';
import { EditorToolbar } from './EditorToolbar';
import { getAccessToken } from '../api';
import { colorForUser } from '../config';

type ConnStatus = 'connecting' | 'connected' | 'disconnected';

interface Props {
  documentId: string;
  user: User;
  role: DocumentRole;
  /** Optional template HTML seeded once into an empty document. */
  seedHtml?: string;
  /** Receives the editor instance so the page can drive export, etc. */
  onEditorReady?: (editor: Editor | null) => void;
}

export function CollaborativeEditor({ documentId, user, role, seedHtml, onEditorReady }: Props) {
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const providerRef = useRef<SocketProvider | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const seededRef = useRef(false);
  const editable = canEdit(role);

  // Establish the network provider once per document.
  if (!providerRef.current) {
    providerRef.current = new SocketProvider(
      documentId,
      ydoc,
      getAccessToken() ?? '',
      setStatus,
    );
  }

  useEffect(() => {
    return () => {
      providerRef.current?.destroy();
      providerRef.current = null;
      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const editor = useEditor(
    {
      editable,
      extensions: [
        // History is provided by the Collaboration extension; disable StarterKit's.
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({
          provider: providerRef.current,
          user: { name: user.displayName, color: colorForUser(user.id) },
        }),
      ],
      editorProps: {
        attributes: { class: 'prose-editor' },
      },
    },
    [documentId],
  );

  useEffect(() => {
    onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  // Seed a template once, only when synced into a still-empty document, so we
  // don't clobber existing content or race other collaborators.
  useEffect(() => {
    if (!editor || !seedHtml || seededRef.current || status !== 'connected') return;
    if (editor.isEmpty) {
      editor.commands.setContent(seedHtml);
      seededRef.current = true;
    }
  }, [editor, seedHtml, status]);

  return (
    <div className="editor-wrap">
      <div className={`status status-${status}`}>
        <span className="dot" /> {status}
      </div>
      {editable && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
