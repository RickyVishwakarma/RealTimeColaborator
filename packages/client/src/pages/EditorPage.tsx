import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import type { DocumentDetail } from '@rtc/shared';
import { canEdit } from '@rtc/shared';
import { api } from '../api';
import { useAuth } from '../store';
import { CollaborativeEditor, type PresenceUser } from '../components/CollaborativeEditor';
import { CommentsPanel } from '../components/CommentsPanel';
import { VersionHistory } from '../components/VersionHistory';
import { ShareDialog } from '../components/ShareDialog';
import { ExportMenu } from '../components/ExportMenu';
import { PresenceAvatars } from '../components/PresenceAvatars';
import { ThemeToggle } from '../components/ThemeToggle';
import { DocumentOutline } from '../components/DocumentOutline';
import { templateById } from '../lib/templates';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [present, setPresent] = useState<PresenceUser[]>([]);
  const [commentsSignal, setCommentsSignal] = useState(0);
  const [showOutline, setShowOutline] = useState(false);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const templateId = (location.state as { templateId?: string } | null)?.templateId;
  const seedHtml = templateById(templateId)?.html || undefined;

  const handleEditorReady = useCallback((e: Editor | null) => setEditor(e), []);
  const handlePresence = useCallback((users: PresenceUser[]) => setPresent(users), []);
  const handleCommentsChanged = useCallback(() => setCommentsSignal((n) => n + 1), []);

  useEffect(() => {
    if (!id) return;
    api
      .getDocument(id)
      .then(({ document }) => {
        setDoc(document);
        setTitle(document.title);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [id]);

  // Debounced title rename.
  function handleTitleChange(value: string) {
    setTitle(value);
    if (!id) return;
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => {
      void api.renameDocument(id, value.trim() || 'Untitled').catch(() => undefined);
    }, 500);
  }

  if (error) return <div className="center error">{error}</div>;
  if (!doc || !user || !id) return <div className="center muted">Loading document…</div>;

  const editable = canEdit(doc.role);

  return (
    <div className="page editor-page">
      <header className="topbar editor-topbar">
        <div className="row editor-title-row">
          <Link to="/" className="link back-link">
            ←
          </Link>
          <input
            className="doc-title-input"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            disabled={!editable}
            placeholder="Untitled"
            aria-label="Document title"
          />
          <span className="badge">{doc.role}</span>
        </div>
        <div className="row">
          <PresenceAvatars users={present} selfName={user.displayName} />
          <button className="secondary" onClick={() => setShowComments((v) => !v)}>
            {showComments ? 'Hide comments' : 'Comments'}
          </button>
          <div className="outline-wrap">
            <button className="secondary" onClick={() => setShowOutline((v) => !v)}>
              Outline
            </button>
            {showOutline && (
              <DocumentOutline editor={editor} onClose={() => setShowOutline(false)} />
            )}
          </div>
          <button className="secondary" onClick={() => setShowHistory(true)}>
            History
          </button>
          <ExportMenu editor={editor} title={title || 'document'} />
          <ThemeToggle />
          {doc.role === 'owner' && <button onClick={() => setShowShare(true)}>Share</button>}
        </div>
      </header>

      <div className={`editor-layout ${showComments ? 'with-comments' : ''}`}>
        <CollaborativeEditor
          documentId={id}
          user={user}
          role={doc.role}
          seedHtml={seedHtml}
          onEditorReady={handleEditorReady}
          onPresence={handlePresence}
          onCommentsChanged={handleCommentsChanged}
        />
        {showComments && (
          <CommentsPanel documentId={id} role={doc.role} user={user} refreshSignal={commentsSignal} />
        )}
      </div>

      {showShare && (
        <ShareDialog
          documentId={id}
          initialIsPublic={doc.isPublic}
          initialPublicToken={doc.publicToken}
          onClose={() => setShowShare(false)}
        />
      )}
      {showHistory && (
        <VersionHistory documentId={id} role={doc.role} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
