import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DocumentSummary, Folder, SearchResult } from '@rtc/shared';
import { api } from '../api';
import { useAuth } from '../store';
import { NewDocDialog } from '../components/NewDocDialog';
import { NotificationBell } from '../components/NotificationBell';
import { Logo } from '../components/Logo';
import { UserMenu } from '../components/UserMenu';
import { timeAgo } from '../lib/time';
import type { DocTemplate } from '../lib/templates';

// Escape user content, then turn ts_headline's <<…>> markers into <mark> tags.
function renderSnippet(snippet: string): string {
  const escaped = snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/&lt;&lt;/g, '<mark>').replace(/&gt;&gt;/g, '</mark>');
}

type View = { kind: 'all' } | { kind: 'folder'; id: string } | { kind: 'trash' };

export function DocumentsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [view, setView] = useState<View>({ kind: 'all' });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFolders = useCallback(async () => {
    const { folders } = await api.listFolders();
    setFolders(folders);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const opts =
      view.kind === 'trash' ? { trash: true } : view.kind === 'folder' ? { folder: view.id } : {};
    const { documents } = await api.listDocuments(opts);
    setDocs(documents);
    setLoading(false);
  }, [view]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  async function handleCreate(template: DocTemplate) {
    setCreating(true);
    try {
      const { document } = await api.createDocument(template.title);
      if (view.kind === 'folder') await api.moveDocument(document.id, view.id).catch(() => undefined);
      navigate(`/doc/${document.id}`, { state: { templateId: template.id } });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await api.deleteDocument(id);
    await Promise.all([refresh(), loadFolders()]);
  }
  async function handleRestore(id: string) {
    await api.restoreDocument(id);
    await Promise.all([refresh(), loadFolders()]);
  }
  async function handleDeleteForever(id: string) {
    if (!confirm('Permanently delete this document? This cannot be undone.')) return;
    await api.deleteForever(id);
    await refresh();
  }
  async function handleMove(id: string, folderId: string | null) {
    await api.moveDocument(id, folderId);
    await Promise.all([refresh(), loadFolders()]);
  }
  async function handleDuplicate(id: string) {
    await api.duplicateDocument(id);
    await refresh();
  }

  async function handleNewFolder() {
    const name = prompt('Folder name')?.trim();
    if (!name) return;
    const { folder } = await api.createFolder(name);
    await loadFolders();
    setView({ kind: 'folder', id: folder.id });
  }
  async function handleDeleteFolder(id: string) {
    if (!confirm('Delete this folder? Documents inside are kept (moved out of the folder).')) return;
    await api.deleteFolder(id);
    if (view.kind === 'folder' && view.id === id) setView({ kind: 'all' });
    await Promise.all([loadFolders(), refresh()]);
  }

  const inTrash = view.kind === 'trash';

  return (
    <div className="page docs-page">
      <header className="topbar">
        <Logo />
        <div className="row">
          <NotificationBell />
          {user && <UserMenu user={user} onLogout={() => void logout()} />}
        </div>
      </header>

      <div className="docs-layout">
        <aside className="docs-sidebar">
          <button
            className={`nav-item${view.kind === 'all' ? ' active' : ''}`}
            onClick={() => setView({ kind: 'all' })}
          >
            All documents
          </button>

          <div className="nav-section">
            <span className="nav-heading">Folders</span>
            <button className="link nav-add" onClick={() => void handleNewFolder()}>
              + New
            </button>
          </div>
          {folders.length === 0 && <span className="muted nav-empty">No folders yet</span>}
          {folders.map((f) => (
            <div
              key={f.id}
              className={`nav-item folder${view.kind === 'folder' && view.id === f.id ? ' active' : ''}`}
              onClick={() => setView({ kind: 'folder', id: f.id })}
            >
              <span className="folder-name">📁 {f.name}</span>
              <span className="folder-count muted">{f.docCount}</span>
              <button
                className="link folder-del"
                title="Delete folder"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDeleteFolder(f.id);
                }}
              >
                ×
              </button>
            </div>
          ))}

          <button
            className={`nav-item nav-trash${view.kind === 'trash' ? ' active' : ''}`}
            onClick={() => setView({ kind: 'trash' })}
          >
            🗑 Trash
          </button>
        </aside>

        <main className="docs-main">
          <div className="row search-row">
            <input
              className="search-input"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search documents…"
            />
            {!inTrash && <button onClick={() => setShowNewDoc(true)}>+ New document</button>}
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
            <p className="muted">
              {inTrash ? 'Trash is empty.' : 'No documents here yet.'}
            </p>
          ) : (
            <ul className="doc-list">
              {docs.map((doc) => (
                <li key={doc.id} className="card doc-item">
                  {inTrash ? (
                    <span className="doc-title">{doc.title}</span>
                  ) : (
                    <Link to={`/doc/${doc.id}`} className="doc-title">
                      {doc.title}
                    </Link>
                  )}
                  <span className="badge">{doc.role}</span>
                  <span className="muted" title={new Date(doc.updatedAt).toLocaleString()}>
                    {timeAgo(doc.updatedAt)}
                  </span>

                  {inTrash ? (
                    <>
                      <button className="secondary" onClick={() => void handleRestore(doc.id)}>
                        Restore
                      </button>
                      <button className="danger" onClick={() => void handleDeleteForever(doc.id)}>
                        Delete forever
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="link"
                        title="Duplicate"
                        onClick={() => void handleDuplicate(doc.id)}
                      >
                        Duplicate
                      </button>
                      {doc.role === 'owner' && (
                        <>
                          <select
                            className="folder-select"
                            value={doc.folderId ?? ''}
                            title="Move to folder"
                            onChange={(e) => void handleMove(doc.id, e.target.value || null)}
                          >
                            <option value="">No folder</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                          <button className="danger" onClick={() => void handleDelete(doc.id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      {showNewDoc && (
        <NewDocDialog
          busy={creating}
          onCreate={(t) => void handleCreate(t)}
          onClose={() => setShowNewDoc(false)}
        />
      )}
    </div>
  );
}
