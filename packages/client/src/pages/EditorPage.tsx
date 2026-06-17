import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DocumentDetail } from '@rtc/shared';
import { canEdit } from '@rtc/shared';
import { api } from '../api';
import { useAuth } from '../store';
import { CollaborativeEditor } from '../components/CollaborativeEditor';
import { ShareDialog } from '../components/ShareDialog';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);

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
        {doc.role === 'owner' && <button onClick={() => setShowShare(true)}>Share</button>}
      </header>

      {!canEdit(doc.role) && (
        <p className="muted banner">You have read-only access to this document.</p>
      )}

      <CollaborativeEditor documentId={id} user={user} />

      {showShare && <ShareDialog documentId={id} onClose={() => setShowShare(false)} />}
    </div>
  );
}
