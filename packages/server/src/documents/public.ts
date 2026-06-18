import { Router } from 'express';
import type { PublicDocument } from '@rtc/shared';
import { query } from '../db/pool.js';

/**
 * Unauthenticated, read-only access to documents published via a share link.
 * Mounted at /api/public WITHOUT requireAuth.
 */
export const publicRouter = Router();

publicRouter.get('/:token', async (req, res) => {
  const result = await query<{ title: string; content_snapshot: Buffer | null; is_public: boolean }>(
    'SELECT title, content_snapshot, is_public FROM documents WHERE public_token = $1 AND deleted_at IS NULL',
    [req.params.token],
  );
  const row = result.rows[0];
  if (!row || !row.is_public) {
    res.status(404).json({ error: 'This document is not publicly available' });
    return;
  }
  const body: PublicDocument = {
    title: row.title,
    snapshot: row.content_snapshot ? row.content_snapshot.toString('base64') : null,
  };
  res.json(body);
});
