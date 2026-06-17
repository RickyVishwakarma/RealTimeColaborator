import type { NotificationType } from '@rtc/shared';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

interface CreateArgs {
  userId: string;
  type: NotificationType;
  documentId?: string | null;
  actorId?: string | null;
  body: string;
}

/**
 * Persist a notification. Never throws into the caller's request path —
 * a failed notification must not fail the action that triggered it.
 */
export async function notify(args: CreateArgs): Promise<void> {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, document_id, actor_id, body)
       VALUES ($1, $2, $3, $4, $5)`,
      [args.userId, args.type, args.documentId ?? null, args.actorId ?? null, args.body],
    );
  } catch (err) {
    logger.error({ err, type: args.type }, 'Failed to create notification');
  }
}

/**
 * Notify the document owner and the root-thread author (deduped, never the
 * actor themselves) when a comment is posted.
 */
export async function notifyOnComment(args: {
  documentId: string;
  actorId: string;
  actorName: string;
  threadId: string | null;
}): Promise<void> {
  const recipients = new Set<string>();

  const owner = await query<{ owner_id: string }>(
    'SELECT owner_id FROM documents WHERE id = $1',
    [args.documentId],
  );
  if (owner.rows[0]) recipients.add(owner.rows[0].owner_id);

  if (args.threadId) {
    const root = await query<{ user_id: string }>(
      'SELECT user_id FROM comments WHERE id = $1',
      [args.threadId],
    );
    if (root.rows[0]) recipients.add(root.rows[0].user_id);
  }

  recipients.delete(args.actorId);

  const body = args.threadId
    ? `${args.actorName} replied to a comment`
    : `${args.actorName} commented on your document`;

  await Promise.all(
    [...recipients].map((userId) =>
      notify({ userId, type: 'comment', documentId: args.documentId, actorId: args.actorId, body }),
    ),
  );
}
