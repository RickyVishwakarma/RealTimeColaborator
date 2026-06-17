import { useCallback, useEffect, useState } from 'react';
import type { DocumentRole, DocumentVersion } from '@rtc/shared';
import { canEdit } from '@rtc/shared';
import { api } from '../api';

interface Props {
  documentId: string;
  role: DocumentRole;
  onClose: () => void;
}

export function VersionHistory({ documentId, role, onClose }: Props) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [label, setLabel] = useState('');
  const [preview, setPreview] = useState<{ id: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mayEdit = canEdit(role);

  const refresh = useCallback(async () => {
    const { versions } = await api.listVersions(documentId);
    setVersions(versions);
  }, [documentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    setBusy(true);
    try {
      await api.createVersion(documentId, label.trim() || 'Snapshot');
      setLabel('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview(id: string) {
    const { content } = await api.previewVersion(documentId, id);
    setPreview({ id, content });
  }

  async function handleRestore(id: string) {
    if (!confirm('Restore this version? Current content will be replaced for all editors.')) return;
    setBusy(true);
    try {
      await api.restoreVersion(documentId, id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal version-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Version history</h2>

        {mayEdit && (
          <div className="row version-create">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. before edit)"
            />
            <button onClick={() => void handleCreate()} disabled={busy}>
              Save version
            </button>
          </div>
        )}

        {versions.length === 0 ? (
          <p className="muted">No saved versions yet.</p>
        ) : (
          <ul className="version-list">
            {versions.map((v) => (
              <li key={v.id} className="version-item">
                <div className="version-info">
                  <strong>{v.label}</strong>
                  <span className="muted">
                    {v.author?.displayName ?? 'Unknown'} · {new Date(v.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="row">
                  <button className="secondary" onClick={() => void handlePreview(v.id)}>
                    Preview
                  </button>
                  {mayEdit && (
                    <button onClick={() => void handleRestore(v.id)} disabled={busy}>
                      Restore
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {preview && (
          <div className="version-preview">
            <h3>Preview</h3>
            <pre>{preview.content || '(empty)'}</pre>
          </div>
        )}

        <div className="row">
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
