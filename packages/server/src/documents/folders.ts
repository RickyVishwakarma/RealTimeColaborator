import { Router } from 'express';
import { z } from 'zod';
import type { Folder } from '@rtc/shared';
import { query } from '../db/pool.js';
import { requireAuth } from '../auth/middleware.js';

export const folderRouter = Router();
folderRouter.use(requireAuth);

/** List the user's folders with a live document count (excludes trashed). */
folderRouter.get('/', async (req, res) => {
  const result = await query<{ id: string; name: string; doc_count: string }>(
    `SELECT f.id, f.name,
            COUNT(d.id) FILTER (WHERE d.deleted_at IS NULL) AS doc_count
     FROM folders f
     LEFT JOIN documents d ON d.folder_id = f.id
     WHERE f.owner_id = $1
     GROUP BY f.id
     ORDER BY f.name ASC`,
    [req.userId],
  );
  const folders: Folder[] = result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    docCount: Number(r.doc_count),
  }));
  res.json({ folders });
});

const createSchema = z.object({ name: z.string().min(1).max(120) });

folderRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid folder name' });
    return;
  }
  const result = await query<{ id: string; name: string }>(
    'INSERT INTO folders (name, owner_id) VALUES ($1, $2) RETURNING id, name',
    [parsed.data.name, req.userId],
  );
  const folder: Folder = { id: result.rows[0].id, name: result.rows[0].name, docCount: 0 };
  res.status(201).json({ folder });
});

/** Delete a folder; its documents fall back to "no folder" (ON DELETE SET NULL). */
folderRouter.delete('/:id', async (req, res) => {
  const result = await query(
    'DELETE FROM folders WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.userId],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: 'Folder not found' });
    return;
  }
  res.status(204).end();
});
