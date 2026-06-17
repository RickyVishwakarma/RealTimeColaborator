import type { DocumentRole } from '@rtc/shared';
import { query } from '../db/pool.js';

/**
 * Resolves the effective role a user has on a document.
 * Returns null if the user has no access (and the doc isn't public).
 */
export async function getRole(documentId: string, userId: string): Promise<DocumentRole | null> {
  const perm = await query<{ role: DocumentRole }>(
    'SELECT role FROM document_permissions WHERE document_id = $1 AND user_id = $2',
    [documentId, userId],
  );
  if (perm.rows[0]) return perm.rows[0].role;

  // Public documents grant viewer access to anyone authenticated.
  const doc = await query<{ is_public: boolean }>(
    'SELECT is_public FROM documents WHERE id = $1 AND deleted_at IS NULL',
    [documentId],
  );
  if (doc.rows[0]?.is_public) return 'viewer';

  return null;
}
