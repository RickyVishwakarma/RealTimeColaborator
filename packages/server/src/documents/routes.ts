import { Router } from 'express';
import { z } from 'zod';
import { canManage, type DocumentSummary, type SearchResult } from '@rtc/shared';
import { pool, query } from '../db/pool.js';
import { requireAuth } from '../auth/middleware.js';
import { getRole } from './permissions.js';
import { commentRouter } from './comments.js';
import { versionRouter } from './versions.js';

export const documentRouter = Router();
documentRouter.use(requireAuth);

// Nested routes
documentRouter.use('/:id/comments', commentRouter);
documentRouter.use('/:id/versions', versionRouter);

interface DocRow {
  id: string;
  title: string;
  owner_id: string;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

/** List documents the user owns or has been granted access to. */
documentRouter.get('/', async (req, res) => {
  const result = await query<DocRow & { role: string }>(
    `SELECT d.id, d.title, d.owner_id, d.is_public, d.created_at, d.updated_at, p.role
     FROM documents d
     JOIN document_permissions p ON p.document_id = d.id
     WHERE p.user_id = $1 AND d.deleted_at IS NULL
     ORDER BY d.updated_at DESC`,
    [req.userId],
  );
  const docs: DocumentSummary[] = result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    ownerId: r.owner_id,
    role: r.role as DocumentSummary['role'],
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
  res.json({ documents: docs });
});

const createSchema = z.object({ title: z.string().min(1).max(255).default('Untitled') });

/** Create a document; the creator becomes owner (transactional). */
documentRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const docResult = await client.query<DocRow>(
      'INSERT INTO documents (title, owner_id) VALUES ($1, $2) RETURNING *',
      [parsed.data.title, req.userId],
    );
    const doc = docResult.rows[0];
    await client.query(
      `INSERT INTO document_permissions (document_id, user_id, role, granted_by_id)
       VALUES ($1, $2, 'owner', $2)`,
      [doc.id, req.userId],
    );
    await client.query('COMMIT');

    const summary: DocumentSummary = {
      id: doc.id,
      title: doc.title,
      ownerId: doc.owner_id,
      role: 'owner',
      createdAt: doc.created_at.toISOString(),
      updatedAt: doc.updated_at.toISOString(),
    };
    res.status(201).json({ document: summary });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/**
 * Full-text search across documents the user can access. Ranks tsvector
 * matches and also catches fuzzy title matches via trigram similarity.
 * Declared before '/:id' so the literal path takes precedence.
 */
documentRouter.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) {
    res.json({ results: [] });
    return;
  }
  const result = await query<{
    id: string;
    title: string;
    role: SearchResult['role'];
    snippet: string;
    updated_at: Date;
  }>(
    `SELECT d.id, d.title, p.role, d.updated_at,
            ts_headline('english', d.search_text, plainto_tsquery('english', $2),
              'MaxFragments=1, MaxWords=18, MinWords=5, StartSel=<<, StopSel=>>') AS snippet
     FROM documents d
     JOIN document_permissions p ON p.document_id = d.id
     WHERE p.user_id = $1
       AND d.deleted_at IS NULL
       AND (d.search_tsv @@ plainto_tsquery('english', $2) OR d.title ILIKE '%' || $2 || '%')
     ORDER BY ts_rank(d.search_tsv, plainto_tsquery('english', $2)) DESC,
              similarity(d.title, $2) DESC
     LIMIT 20`,
    [req.userId, q],
  );
  const results: SearchResult[] = result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    role: r.role,
    snippet: r.snippet ?? '',
    updatedAt: r.updated_at.toISOString(),
  }));
  res.json({ results });
});

/** Fetch a single document's metadata (requires any access). */
documentRouter.get('/:id', async (req, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!role) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  const result = await query<DocRow>(
    'SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL',
    [req.params.id],
  );
  const doc = result.rows[0];
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json({
    document: {
      id: doc.id,
      title: doc.title,
      ownerId: doc.owner_id,
      role,
      isPublic: doc.is_public,
      createdAt: doc.created_at.toISOString(),
      updatedAt: doc.updated_at.toISOString(),
    },
  });
});

const shareSchema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'commenter', 'viewer']),
});

/** Share a document with another user by email (owner only). */
documentRouter.post('/:id/share', async (req, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!role || !canManage(role)) {
    res.status(403).json({ error: 'Only the owner can share this document' });
    return;
  }
  const parsed = shareSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const target = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    parsed.data.email,
  ]);
  if (!target.rows[0]) {
    res.status(404).json({ error: 'No user with that email' });
    return;
  }

  await query(
    `INSERT INTO document_permissions (document_id, user_id, role, granted_by_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [req.params.id, target.rows[0].id, parsed.data.role, req.userId],
  );
  res.status(204).end();
});

/** Soft-delete a document (owner only). */
documentRouter.delete('/:id', async (req, res) => {
  const role = await getRole(req.params.id, req.userId!);
  if (!role || !canManage(role)) {
    res.status(403).json({ error: 'Only the owner can delete this document' });
    return;
  }
  await query('UPDATE documents SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
  res.status(204).end();
});
