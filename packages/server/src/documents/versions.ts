import { Router } from 'express';
import { z } from 'zod';
import * as Y from 'yjs';
import { canEdit, type DocumentVersion } from '@rtc/shared';
import { query } from '../db/pool.js';
import { requireAuth } from '../auth/middleware.js';
import { getRole } from './permissions.js';
import { getCurrentState, restoreSnapshot } from '../collab/docManager.js';
import { broadcastDocUpdate } from '../collab/io.js';

// Mounted at /api/documents/:id/versions
export const versionRouter = Router({ mergeParams: true });
versionRouter.use(requireAuth);

const docId = (req: import('express').Request): string =>
  (req.params as Record<string, string>).id;
const versionId = (req: import('express').Request): string =>
  (req.params as Record<string, string>).versionId;

interface VersionRow {
  id: string;
  label: string;
  created_by: string | null;
  display_name: string | null;
  created_at: Date;
}

function toVersion(row: VersionRow): DocumentVersion {
  return {
    id: row.id,
    label: row.label,
    author: row.created_by ? { id: row.created_by, displayName: row.display_name ?? '' } : null,
    createdAt: row.created_at.toISOString(),
  };
}

/** List version snapshots, newest first (any access). */
versionRouter.get('/', async (req, res) => {
  const role = await getRole(docId(req), req.userId!);
  if (!role) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  const result = await query<VersionRow>(
    `SELECT s.id, s.label, s.created_by, u.display_name, s.created_at
     FROM document_snapshots s
     LEFT JOIN users u ON u.id = s.created_by
     WHERE s.document_id = $1
     ORDER BY s.created_at DESC`,
    [docId(req)],
  );
  res.json({ versions: result.rows.map(toVersion) });
});

const createSchema = z.object({ label: z.string().min(1).max(255).default('Snapshot') });

/** Capture the current document state as a named version (editor+). */
versionRouter.post('/', async (req, res) => {
  const role = await getRole(docId(req), req.userId!);
  if (!role || !canEdit(role)) {
    res.status(403).json({ error: 'You do not have permission to create versions' });
    return;
  }
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const state = await getCurrentState(docId(req));
  if (!state) {
    res.status(409).json({ error: 'Document has no content to snapshot yet' });
    return;
  }
  const inserted = await query<VersionRow>(
    `INSERT INTO document_snapshots (document_id, label, state, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, label, created_by, created_at,
       (SELECT display_name FROM users WHERE id = $4) AS display_name`,
    [docId(req), parsed.data.label, Buffer.from(state), req.userId],
  );
  res.status(201).json({ version: toVersion(inserted.rows[0]) });
});

/** Plain-ish text preview of a version's content (any access). */
versionRouter.get('/:versionId/preview', async (req, res) => {
  const role = await getRole(docId(req), req.userId!);
  if (!role) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  const result = await query<{ state: Buffer }>(
    'SELECT state FROM document_snapshots WHERE id = $1 AND document_id = $2',
    [versionId(req), docId(req)],
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  const tmp = new Y.Doc();
  Y.applyUpdate(tmp, new Uint8Array(result.rows[0].state));
  const content = tmp.getXmlFragment('default').toString();
  tmp.destroy();
  res.json({ content });
});

/** Restore a version in place and broadcast to live editors (editor+). */
versionRouter.post('/:versionId/restore', async (req, res) => {
  const role = await getRole(docId(req), req.userId!);
  if (!role || !canEdit(role)) {
    res.status(403).json({ error: 'You do not have permission to restore versions' });
    return;
  }
  const result = await query<{ state: Buffer }>(
    'SELECT state FROM document_snapshots WHERE id = $1 AND document_id = $2',
    [versionId(req), docId(req)],
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  const update = await restoreSnapshot(docId(req), new Uint8Array(result.rows[0].state));
  if (update.length > 0) broadcastDocUpdate(docId(req), update);
  res.status(204).end();
});
