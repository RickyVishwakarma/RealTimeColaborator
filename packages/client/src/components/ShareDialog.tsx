import { useState, type FormEvent } from 'react';
import type { DocumentRole } from '@rtc/shared';
import { api } from '../api';

interface Props {
  documentId: string;
  initialIsPublic?: boolean;
  initialPublicToken?: string | null;
  onClose: () => void;
}

type ShareableRole = Extract<DocumentRole, 'editor' | 'commenter' | 'viewer'>;

export function ShareDialog({
  documentId,
  initialIsPublic = false,
  initialPublicToken = null,
  onClose,
}: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareableRole>('editor');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [token, setToken] = useState<string | null>(initialPublicToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = token ? `${window.location.origin}/p/${token}` : '';

  async function handleShare(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api.shareDocument(documentId, email, role);
      setMessage(`Shared with ${email} as ${role}`);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    }
  }

  async function togglePublic() {
    setBusy(true);
    setError(null);
    try {
      if (isPublic) {
        await api.unpublishDocument(documentId);
        setIsPublic(false);
      } else {
        const { token } = await api.publishDocument(documentId);
        setToken(token);
        setIsPublic(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sharing');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>Share document</h2>

        <form onSubmit={handleShare} className="share-form">
          <label>
            Invite by email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as ShareableRole)}>
              <option value="editor">Editor</option>
              <option value="commenter">Commenter</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          {message && <p className="success">{message}</p>}
          <button type="submit">Send invite</button>
        </form>

        <div className="publish-block">
          <div className="publish-head">
            <div>
              <strong>Public link</strong>
              <p className="muted publish-sub">
                {isPublic ? 'Anyone with the link can view (read-only).' : 'Not shared publicly.'}
              </p>
            </div>
            <button className="secondary" onClick={() => void togglePublic()} disabled={busy}>
              {isPublic ? 'Unpublish' : 'Publish to web'}
            </button>
          </div>
          {isPublic && token && (
            <div className="row publish-link">
              <input readOnly value={publicUrl} onFocus={(e) => e.target.select()} />
              <button className="secondary" onClick={() => void copyLink()}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
