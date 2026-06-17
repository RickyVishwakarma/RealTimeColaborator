import { Router } from 'express';
import type { Notification } from '@rtc/shared';
import { query } from '../db/pool.js';
import { requireAuth } from '../auth/middleware.js';

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

interface NotificationRow {
  id: string;
  type: Notification['type'];
  document_id: string | null;
  document_title: string | null;
  actor_name: string | null;
  body: string;
  read_at: Date | null;
  created_at: Date;
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    documentId: row.document_id,
    documentTitle: row.document_title,
    actorName: row.actor_name,
    body: row.body,
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

/** List the 50 most recent notifications + unread count. */
notificationRouter.get('/', async (req, res) => {
  const result = await query<NotificationRow>(
    `SELECT n.id, n.type, n.document_id, d.title AS document_title,
            a.display_name AS actor_name, n.body, n.read_at, n.created_at
     FROM notifications n
     LEFT JOIN documents d ON d.id = n.document_id
     LEFT JOIN users a ON a.id = n.actor_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT 50`,
    [req.userId],
  );
  const unread = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [req.userId],
  );
  res.json({
    notifications: result.rows.map(toNotification),
    unread: Number(unread.rows[0]?.count ?? 0),
  });
});

/** Mark a single notification as read. */
notificationRouter.post('/:id/read', async (req, res) => {
  await query(
    'UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL',
    [req.params.id, req.userId],
  );
  res.status(204).end();
});

/** Mark all notifications as read. */
notificationRouter.post('/read-all', async (req, res) => {
  await query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [
    req.userId,
  ]);
  res.status(204).end();
});
