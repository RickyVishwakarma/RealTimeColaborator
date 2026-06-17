import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DocumentSummary } from '@rtc/shared';
import { api } from '../api';
import { useAuth } from '../store';

export function DocumentsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const { documents } = await api.listDocuments();
    setDocs(documents);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate() {
    const { document } = await api.createDocument('Untitled');
    navigate(`/doc/${document.id}`);
  }

  async function handleDelete(id: string) {
    await api.deleteDocument(id);
    void refresh();
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Your documents</h1>
        <div className="row">
          <span className="muted">{user?.email}</span>
          <button className="secondary" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>

      <button onClick={() => void handleCreate()}>+ New document</button>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="muted">No documents yet. Create your first one!</p>
      ) : (
        <ul className="doc-list">
          {docs.map((doc) => (
            <li key={doc.id} className="card doc-item">
              <Link to={`/doc/${doc.id}`} className="doc-title">
                {doc.title}
              </Link>
              <span className="badge">{doc.role}</span>
              <span className="muted">{new Date(doc.updatedAt).toLocaleString()}</span>
              {doc.role === 'owner' && (
                <button className="danger" onClick={() => void handleDelete(doc.id)}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
