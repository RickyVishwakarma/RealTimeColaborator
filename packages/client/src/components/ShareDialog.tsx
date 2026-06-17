import { useState, type FormEvent } from 'react';
import type { DocumentRole } from '@rtc/shared';
import { api } from '../api';

interface Props {
  documentId: string;
  onClose: () => void;
}

type ShareableRole = Extract<DocumentRole, 'editor' | 'commenter' | 'viewer'>;

export function ShareDialog({ documentId, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareableRole>('editor');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={handleShare}>
        <h2>Share document</h2>
        <label>
          Email
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
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit">Share</button>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </div>
  );
}
