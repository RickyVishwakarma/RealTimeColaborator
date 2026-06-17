import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { CommentThread, DocumentRole, User } from '@rtc/shared';
import { canComment } from '@rtc/shared';
import { api } from '../api';

interface Props {
  documentId: string;
  role: DocumentRole;
  user: User;
}

export function CommentsPanel({ documentId, role, user }: Props) {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const refresh = useCallback(async () => {
    const { threads } = await api.listComments(documentId);
    setThreads(threads);
  }, [documentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mayComment = canComment(role);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    await api.createComment(documentId, newComment.trim());
    setNewComment('');
    await refresh();
  }

  async function handleReply(threadId: string, e: FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    await api.createComment(documentId, replyBody.trim(), threadId);
    setReplyBody('');
    setReplyTo(null);
    await refresh();
  }

  async function toggleResolve(threadId: string, resolved: boolean) {
    await api.resolveThread(documentId, threadId, resolved);
    await refresh();
  }

  async function remove(commentId: string) {
    await api.deleteComment(documentId, commentId);
    await refresh();
  }

  const visible = threads.filter((t) => showResolved || !t.root.resolvedAt);

  return (
    <aside className="comments-panel">
      <div className="comments-header">
        <h2>Comments</h2>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Show resolved
        </label>
      </div>

      {mayComment && (
        <form className="comment-compose" onSubmit={handleCreate}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
          />
          <button type="submit" disabled={!newComment.trim()}>
            Comment
          </button>
        </form>
      )}

      {visible.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <ul className="thread-list">
          {visible.map(({ root, replies }) => (
            <li key={root.id} className={`thread ${root.resolvedAt ? 'resolved' : ''}`}>
              <CommentBody
                authorName={root.author.displayName}
                body={root.body}
                createdAt={root.createdAt}
                canDelete={root.author.id === user.id || role === 'owner'}
                onDelete={() => void remove(root.id)}
              />

              {replies.map((r) => (
                <div key={r.id} className="reply">
                  <CommentBody
                    authorName={r.author.displayName}
                    body={r.body}
                    createdAt={r.createdAt}
                    canDelete={r.author.id === user.id || role === 'owner'}
                    onDelete={() => void remove(r.id)}
                  />
                </div>
              ))}

              <div className="thread-actions">
                {mayComment && (
                  <button className="link" onClick={() => setReplyTo(replyTo === root.id ? null : root.id)}>
                    Reply
                  </button>
                )}
                {mayComment && (
                  <button className="link" onClick={() => void toggleResolve(root.id, !root.resolvedAt)}>
                    {root.resolvedAt ? 'Reopen' : 'Resolve'}
                  </button>
                )}
              </div>

              {replyTo === root.id && (
                <form className="comment-compose" onSubmit={(e) => handleReply(root.id, e)}>
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Reply…"
                    rows={2}
                    autoFocus
                  />
                  <button type="submit" disabled={!replyBody.trim()}>
                    Reply
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

interface CommentBodyProps {
  authorName: string;
  body: string;
  createdAt: string;
  canDelete: boolean;
  onDelete: () => void;
}

function CommentBody({ authorName, body, createdAt, canDelete, onDelete }: CommentBodyProps) {
  return (
    <div className="comment">
      <div className="comment-meta">
        <strong>{authorName}</strong>
        <span className="muted">{new Date(createdAt).toLocaleString()}</span>
        {canDelete && (
          <button className="link danger-link" onClick={onDelete} title="Delete">
            ×
          </button>
        )}
      </div>
      <p className="comment-text">{body}</p>
    </div>
  );
}
