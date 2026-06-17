import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DocumentSummary, SearchResult } from '@rtc/shared';
import { api } from '../api';
import { useAuth } from '../store';

// Escape user content, then turn ts_headline's <<…>> markers into <mark> tags.
function renderSnippet(snippet: string): string {
  const escaped = snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/&lt;&lt;/g, '<mark>').replace(/&gt;&gt;/g, '</mark>');
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refresh() {
    const { documents } = await api.listDocuments();
    setDocs(documents);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  // Debounced full-text search; clearing the box restores the full list.
  function handleSearchChange(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setResults(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const { results } = await api.search(value.trim());
      setResults(results);
    }, 250);
  }

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

      <div className="row search-row">
        <input
          className="search-input"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search documents…"
        />
        <button onClick={() => void handleCreate()}>+ New document</button>
      </div>

      {results !== null ? (
        results.length === 0 ? (
          <p className="muted">No matches for “{query}”.</p>
        ) : (
          <ul className="doc-list">
            {results.map((r) => (
              <li key={r.id} className="card doc-item">
                <Link to={`/doc/${r.id}`} className="doc-title">
                  {r.title}
                </Link>
                <span className="badge">{r.role}</span>
                {r.snippet && (
                  <span
                    className="muted snippet"
                    dangerouslySetInnerHTML={{ __html: renderSnippet(r.snippet) }}
                  />
                )}
              </li>
            ))}
          </ul>
        )
      ) : loading ? (
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
