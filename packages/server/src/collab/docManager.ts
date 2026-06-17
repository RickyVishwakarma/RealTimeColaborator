import * as Y from 'yjs';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

/**
 * Manages in-memory Yjs documents shared by all clients connected to a server.
 *
 * Lifecycle:
 *  - First join loads the latest snapshot from PostgreSQL into memory.
 *  - Updates are applied in memory and appended to the change log.
 *  - A debounced flush writes the full snapshot back to PostgreSQL.
 *  - When the last client leaves, the doc is flushed and evicted.
 */
class ManagedDoc {
  readonly doc = new Y.Doc();
  refs = 0;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(readonly documentId: string) {}

  markDirty(): void {
    this.dirty = true;
    if (!this.flushTimer) {
      // Debounce persistence: flush at most once every 5s while edits arrive.
      this.flushTimer = setTimeout(() => void this.flush(), 5_000);
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const snapshot = Buffer.from(Y.encodeStateAsUpdate(this.doc));
    await query('UPDATE documents SET content_snapshot = $1, updated_at = NOW() WHERE id = $2', [
      snapshot,
      this.documentId,
    ]);
    logger.debug({ documentId: this.documentId, bytes: snapshot.length }, 'Flushed snapshot');
  }
}

const docs = new Map<string, ManagedDoc>();

/** Acquire (or load) a document and increment its reference count. */
export async function acquireDoc(documentId: string): Promise<Y.Doc> {
  let managed = docs.get(documentId);
  if (!managed) {
    managed = new ManagedDoc(documentId);
    const result = await query<{ content_snapshot: Buffer | null }>(
      'SELECT content_snapshot FROM documents WHERE id = $1',
      [documentId],
    );
    const snapshot = result.rows[0]?.content_snapshot;
    if (snapshot) {
      Y.applyUpdate(managed.doc, new Uint8Array(snapshot));
    }
    docs.set(documentId, managed);
  }
  managed.refs += 1;
  return managed.doc;
}

/** Release a document; flush and evict when the last reference is gone. */
export async function releaseDoc(documentId: string): Promise<void> {
  const managed = docs.get(documentId);
  if (!managed) return;
  managed.refs -= 1;
  if (managed.refs <= 0) {
    await managed.flush();
    docs.delete(documentId);
  }
}

/**
 * Apply a binary update originating from a client to the in-memory doc,
 * append it to the change log, and schedule a snapshot flush.
 */
export async function applyUpdate(
  documentId: string,
  update: Uint8Array,
  userId: string,
): Promise<void> {
  const managed = docs.get(documentId);
  if (!managed) return;
  Y.applyUpdate(managed.doc, update, 'remote');
  managed.markDirty();
  await query('INSERT INTO document_changes (document_id, user_id, update_data) VALUES ($1, $2, $3)', [
    documentId,
    userId,
    Buffer.from(update),
  ]);
}

/** Encode the full current state of a doc for an initial sync. */
export function encodeState(documentId: string): Uint8Array | null {
  const managed = docs.get(documentId);
  return managed ? Y.encodeStateAsUpdate(managed.doc) : null;
}

/** Flush all docs — used during graceful shutdown. */
export async function flushAll(): Promise<void> {
  await Promise.all([...docs.values()].map((d) => d.flush()));
}
