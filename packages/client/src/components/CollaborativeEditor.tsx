import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import type { User } from '@rtc/shared';
import { SocketProvider } from '../lib/SocketProvider';
import { getAccessToken } from '../api';
import { colorForUser } from '../config';

type ConnStatus = 'connecting' | 'connected' | 'disconnected';

interface Props {
  documentId: string;
  user: User;
}

export function CollaborativeEditor({ documentId, user }: Props) {
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const providerRef = useRef<SocketProvider | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');

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

  return (
    <div className="editor-wrap">
      <div className={`status status-${status}`}>
        <span className="dot" /> {status}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
