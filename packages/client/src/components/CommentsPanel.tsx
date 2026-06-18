import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Collaborator, CommentThread, DocumentRole, User } from '@rtc/shared';
import { canComment } from '@rtc/shared';
import { api } from '../api';
import { MentionInput, resolveMentions } from './MentionInput';

interface Props {
  documentId: string;
  role: DocumentRole;
  user: User;
  /** Increments when a live `comments:changed` event arrives — triggers refetch. */
  refreshSignal?: number;
}

export function CommentsPanel({ documentId, role, user, refreshSignal }: Props) {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  const refresh = useCallback(async () => {
    const { threads } = await api.listComments(documentId);
    setThreads(threads);
  }, [documentId]);

  useEffect(() => {
    void refresh();
    api
      .listCollaborators(documentId)
      .then(({ collaborators }) => setCollaborators(collaborators))
      .catch(() => undefined);
  }, [refresh, documentId]);

  // Live refetch when another client changes comments.
  useEffect(() => {
    if (refreshSignal) void refresh();
  }, [refreshSignal, refresh]);

  const mayComment = canComment(role);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    await api.createComment(documentId, body, undefined, resolveMentions(body, collaborators));
    setNewComment('');
    await refresh();
  }

  async function handleReply(threadId: string, e: FormEvent) {
    e.preventDefault();
    const body = replyBody.trim();
    if (!body) return;
    await api.createComment(documentId, body, threadId, resolveMentions(body, collaborators));
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
          <MentionInput
            value={newComment}
            onChange={setNewComment}
            collaborators={collaborators}
            placeholder="Add a comment…  (@ to mention)"
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
                  <MentionInput
                    value={replyBody}
                    onChange={setReplyBody}
                    collaborators={collaborators}
                    placeholder="Reply…  (@ to mention)"
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
