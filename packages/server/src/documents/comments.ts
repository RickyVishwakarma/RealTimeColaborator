import { Router } from 'express';
import { z } from 'zod';
import { canComment, type Comment, type CommentThread } from '@rtc/shared';
import { query } from '../db/pool.js';
import { requireAuth } from '../auth/middleware.js';
import { getRole } from './permissions.js';
import { notify, notifyOnComment } from '../notifications/service.js';

// Mounted at /api/documents/:id/comments — preserve :id from the parent router.
export const commentRouter = Router({ mergeParams: true });
commentRouter.use(requireAuth);

interface CommentRow {
  id: string;
  document_id: string;
  thread_id: string | null;
  user_id: string;
  display_name: string;
  body: string;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    documentId: row.document_id,
    threadId: row.thread_id,
    author: { id: row.user_id, displayName: row.display_name },
    body: row.body,
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SELECT_COMMENT = `
  SELECT c.id, c.document_id, c.thread_id, c.user_id, u.display_name,
         c.body, c.resolved_at, c.created_at, c.updated_at
  FROM comments c
  JOIN users u ON u.id = c.user_id
`;

/** List all comments for a document, grouped into threads (any access). */
commentRouter.get('/', async (req, res) => {
  const documentId = (req.params as Record<string, string>).id;
  const role = await getRole(documentId, req.userId!);
  if (!role) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const result = await query<CommentRow>(
    `${SELECT_COMMENT} WHERE c.document_id = $1 ORDER BY c.created_at ASC`,
    [documentId],
  );
  const comments = result.rows.map(toComment);

  const threads = new Map<string, CommentThread>();
  for (const c of comments) {
    if (c.threadId === null) threads.set(c.id, { root: c, replies: [] });
  }
  for (const c of comments) {
    if (c.threadId !== null) threads.get(c.threadId)?.replies.push(c);
  }

  res.json({ threads: [...threads.values()] });
});

const createSchema = z.object({
  body: z.string().min(1).max(10_000),
  threadId: z.string().uuid().nullish(),
  mentions: z.array(z.string().uuid()).max(20).optional(),
});

/** Create a comment or reply (requires commenter+ role). */
commentRouter.post('/', async (req, res) => {
  const documentId = (req.params as Record<string, string>).id;
  const role = await getRole(documentId, req.userId!);
  if (!role || !canComment(role)) {
    res.status(403).json({ error: 'You do not have permission to comment' });
    return;
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const { body, threadId, mentions } = parsed.data;

  // A reply must target an existing root comment on the same document.
  if (threadId) {
    const parent = await query<{ thread_id: string | null }>(
      'SELECT thread_id FROM comments WHERE id = $1 AND document_id = $2',
      [threadId, documentId],
    );
    if (!parent.rows[0]) {
      res.status(400).json({ error: 'Parent comment not found' });
      return;
    }
    if (parent.rows[0].thread_id !== null) {
      res.status(400).json({ error: 'Cannot reply to a reply' });
      return;
    }
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO comments (document_id, thread_id, user_id, body)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [documentId, threadId ?? null, req.userId, body],
  );
  const result = await query<CommentRow>(`${SELECT_COMMENT} WHERE c.id = $1`, [inserted.rows[0].id]);
  const comment = toComment(result.rows[0]);

  // Fire-and-forget: notify owner + thread author (deduped, excluding actor).
  void notifyOnComment({
    documentId,
    actorId: req.userId!,
    actorName: comment.author.displayName,
    threadId: threadId ?? null,
  });

  // Notify explicitly @-mentioned collaborators who still have access.
  if (mentions?.length) {
    const unique = [...new Set(mentions)].filter((uid) => uid !== req.userId);
    void Promise.all(
      unique.map(async (uid) => {
        if (await getRole(documentId, uid)) {
          await notify({
            userId: uid,
            type: 'mention',
            documentId,
            actorId: req.userId,
            body: `${comment.author.displayName} mentioned you in a comment`,
          });
        }
      }),
    );
  }

  res.status(201).json({ comment });
});

/** Toggle resolve state on a thread root (commenter+; only roots resolvable). */
commentRouter.post('/:commentId/resolve', async (req, res) => {
  const documentId = (req.params as Record<string, string>).id;
  const role = await getRole(documentId, req.userId!);
  if (!role || !canComment(role)) {
    res.status(403).json({ error: 'You do not have permission to resolve comments' });
    return;
  }
  const resolved = z.object({ resolved: z.boolean() }).safeParse(req.body);
  if (!resolved.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const result = await query<CommentRow>(
    `UPDATE comments SET resolved_at = ${resolved.data.resolved ? 'NOW()' : 'NULL'}, updated_at = NOW()
     WHERE id = $1 AND document_id = $2 AND thread_id IS NULL
     RETURNING id`,
    [(req.params as Record<string, string>).commentId, documentId],
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: 'Thread not found' });
    return;
  }
  res.status(204).end();
});

/** Delete a comment — author or document owner only. */
commentRouter.delete('/:commentId', async (req, res) => {
  const documentId = (req.params as Record<string, string>).id;
  const role = await getRole(documentId, req.userId!);
  if (!role) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  const existing = await query<{ user_id: string }>(
    'SELECT user_id FROM comments WHERE id = $1 AND document_id = $2',
    [(req.params as Record<string, string>).commentId, documentId],
  );
  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }
  const isAuthor = existing.rows[0].user_id === req.userId;
  if (!isAuthor && role !== 'owner') {
    res.status(403).json({ error: 'Only the author or document owner can delete this comment' });
    return;
  }
  await query('DELETE FROM comments WHERE id = $1', [
    (req.params as Record<string, string>).commentId,
  ]);
  res.status(204).end();
});
