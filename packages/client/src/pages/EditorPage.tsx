import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import type { DocumentDetail } from '@rtc/shared';
import { canEdit } from '@rtc/shared';
import { api } from '../api';
import { useAuth } from '../store';
import { CollaborativeEditor } from '../components/CollaborativeEditor';
import { CommentsPanel } from '../components/CommentsPanel';
import { VersionHistory } from '../components/VersionHistory';
import { ShareDialog } from '../components/ShareDialog';
import { ExportMenu } from '../components/ExportMenu';
import { templateById } from '../lib/templates';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);

  // Template chosen at creation time, passed through router state.
  const templateId = (location.state as { templateId?: string } | null)?.templateId;
  const seedHtml = templateById(templateId)?.html || undefined;

  const handleEditorReady = useCallback((e: Editor | null) => setEditor(e), []);

  useEffect(() => {
    if (!id) return;
    api
      .getDocument(id)
      .then(({ document }) => setDoc(document))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [id]);

  if (error) return <div className="center error">{error}</div>;
  if (!doc || !user || !id) return <div className="center muted">Loading document…</div>;

  return (
    <div className="page editor-page">
      <header className="topbar">
        <div className="row">
          <Link to="/" className="link">
            ← Documents
          </Link>
          <h1>{doc.title}</h1>
          <span className="badge">{doc.role}</span>
        </div>
        <div className="row">
          <button className="secondary" onClick={() => setShowComments((v) => !v)}>
            {showComments ? 'Hide comments' : 'Show comments'}
          </button>
          <button className="secondary" onClick={() => setShowHistory(true)}>
            History
          </button>
          <ExportMenu editor={editor} title={doc.title} />
          {doc.role === 'owner' && <button onClick={() => setShowShare(true)}>Share</button>}
        </div>
      </header>

      {!canEdit(doc.role) && (
        <p className="muted banner">You have read-only access to this document.</p>
      )}

      <div className={`editor-layout ${showComments ? 'with-comments' : ''}`}>
        <CollaborativeEditor
          documentId={id}
          user={user}
          role={doc.role}
          seedHtml={seedHtml}
          onEditorReady={handleEditorReady}
        />
        {showComments && <CommentsPanel documentId={id} role={doc.role} user={user} />}
      </div>

      {showShare && <ShareDialog documentId={id} onClose={() => setShowShare(false)} />}
      {showHistory && (
        <VersionHistory documentId={id} role={doc.role} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
