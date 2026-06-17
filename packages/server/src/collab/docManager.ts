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
    // Extract a plain-text projection of the content to feed full-text search.
    const text = extractText(this.doc.getXmlFragment('default')).slice(0, 100_000);
    await query(
      'UPDATE documents SET content_snapshot = $1, search_text = $2, updated_at = NOW() WHERE id = $3',
      [snapshot, text, this.documentId],
    );
    logger.debug({ documentId: this.documentId, bytes: snapshot.length }, 'Flushed snapshot');
  }
}

/** Recursively flatten an XML fragment/element into plain text. */
function extractText(node: Y.XmlFragment | Y.XmlElement): string {
  let out = '';
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) out += child.toString();
    else if (child instanceof Y.XmlElement) out += extractText(child) + '\n';
  }
  return out;
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

/**
 * Return the current encoded state of a document. Falls back to the persisted
 * snapshot when the document isn't loaded in memory (no active editors).
 */
export async function getCurrentState(documentId: string): Promise<Uint8Array | null> {
  const live = encodeState(documentId);
  if (live) return live;
  const result = await query<{ content_snapshot: Buffer | null }>(
    'SELECT content_snapshot FROM documents WHERE id = $1',
    [documentId],
  );
  const snapshot = result.rows[0]?.content_snapshot;
  return snapshot ? new Uint8Array(snapshot) : null;
}

type XmlNode = Y.XmlElement | Y.XmlText;

/** Deep-clone an XML node so it can be inserted into a different Y.Doc. */
function cloneXmlNode(node: XmlNode): XmlNode {
  if (node instanceof Y.XmlText) {
    const text = new Y.XmlText();
    text.applyDelta(node.toDelta());
    return text;
  }
  const el = new Y.XmlElement(node.nodeName);
  for (const [key, value] of Object.entries(node.getAttributes())) {
    if (typeof value === 'string') el.setAttribute(key, value);
  }
  el.insert(0, (node.toArray() as XmlNode[]).map(cloneXmlNode));
  return el;
}

/**
 * Restore a document's content to a previous snapshot, CRDT-safely.
 *
 * Applying an old state as an update would only *merge* (CRDT union) — it would
 * not remove content added since. Instead we replace the shared 'default'
 * fragment's children in a single transaction, which produces a normal update
 * that all clients converge on. Returns the generated update for broadcasting.
 */
export async function restoreSnapshot(
  documentId: string,
  snapshotState: Uint8Array,
): Promise<Uint8Array> {
  const doc = await acquireDoc(documentId);
  try {
    const tmp = new Y.Doc();
    Y.applyUpdate(tmp, snapshotState);
    const source = tmp.getXmlFragment('default');
    const dest = doc.getXmlFragment('default');

    const updates: Uint8Array[] = [];
    const capture = (update: Uint8Array, origin: unknown): void => {
      if (origin === 'restore') updates.push(update);
    };
    doc.on('update', capture);
    doc.transact(() => {
      dest.delete(0, dest.length);
      dest.insert(0, (source.toArray() as XmlNode[]).map(cloneXmlNode));
    }, 'restore');
    doc.off('update', capture);
    tmp.destroy();

    const managed = docs.get(documentId);
    managed?.markDirty();
    await managed?.flush();

    return updates.length ? Y.mergeUpdates(updates) : new Uint8Array();
  } finally {
    await releaseDoc(documentId);
  }
}

/** Flush all docs — used during graceful shutdown. */
export async function flushAll(): Promise<void> {
  await Promise.all([...docs.values()].map((d) => d.flush()));
}
