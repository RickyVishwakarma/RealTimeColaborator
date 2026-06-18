import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import type { User } from '@rtc/shared';
import { canEdit, type DocumentRole } from '@rtc/shared';
import { SocketProvider } from '../lib/SocketProvider';
import { EditorToolbar } from './EditorToolbar';
import { getAccessToken } from '../api';
import { colorForUser } from '../config';

type ConnStatus = 'connecting' | 'connected' | 'disconnected';

export interface PresenceUser {
  clientId: number;
  name: string;
  color: string;
}

interface Props {
  documentId: string;
  user: User;
  role: DocumentRole;
  /** Optional template HTML seeded once into an empty document. */
  seedHtml?: string;
  /** Receives the editor instance so the page can drive export, etc. */
  onEditorReady?: (editor: Editor | null) => void;
  /** Receives the live list of present collaborators (from awareness). */
  onPresence?: (users: PresenceUser[]) => void;
  /** Fires when another client changes comments (live refetch signal). */
  onCommentsChanged?: () => void;
}

export function CollaborativeEditor({
  documentId,
  user,
  role,
  seedHtml,
  onEditorReady,
  onPresence,
  onCommentsChanged,
}: Props) {
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
      onCommentsChanged,
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
        Placeholder.configure({ placeholder: 'Start writing…' }),
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

  // Report present collaborators from the awareness protocol.
  useEffect(() => {
    const awareness = providerRef.current?.awareness;
    if (!awareness || !onPresence) return;
    const emit = () => {
      const users: PresenceUser[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const u = (state as { user?: { name: string; color: string } }).user;
        if (u?.name) users.push({ clientId, name: u.name, color: u.color });
      });
      onPresence(users);
    };
    awareness.on('change', emit);
    emit();
    return () => awareness.off('change', emit);
  }, [onPresence]);

  // Seed a template once, only when synced into a still-empty document, so we
  // don't clobber existing content or race other collaborators.
  useEffect(() => {
    if (!editor || !seedHtml || seededRef.current || status !== 'connected') return;
    if (editor.isEmpty) {
      editor.commands.setContent(seedHtml);
      seededRef.current = true;
    }
  }, [editor, seedHtml, status]);

  // Re-derived each render; useEditor re-renders the component on every change.
  const text = editor?.getText() ?? '';
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="editor-wrap">
      <div className="editor-bar">
        {editable ? (
          <EditorToolbar editor={editor} />
        ) : (
          <span className="muted readonly-label">Read only</span>
        )}
        <div className={`status status-${status}`}>
          <span className="dot" />
          <span className="status-text">{status}</span>
        </div>
      </div>
      <div className="editor-scroll">
        <EditorContent editor={editor} />
      </div>
      <div className="editor-footer muted">
        <span>{wordCount} words</span>
        <span>{charCount} characters</span>
      </div>
    </div>
  );
}
