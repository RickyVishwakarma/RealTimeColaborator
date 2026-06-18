import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { redis } from '../redis.js';

/**
 * Relay hub: holds the Socket.io server and the cross-instance pub/sub plumbing
 * so both the gateway and REST routes broadcast through the same channel and
 * server identity (used to ignore our own echoes).
 */
let io: Server | null = null;

// Unique per server process — lets us ignore our own Redis publishes.
export const SERVER_ID = randomUUID();
export const relayChannel = (documentId: string): string => `doc:${documentId}:relay`;

export interface RelayMessage {
  origin: string;
  documentId: string;
  kind: 'doc' | 'awareness' | 'comments';
  /** base64-encoded binary payload (doc/awareness only) */
  payload?: string;
}

export function setIo(server: Server): void {
  io = server;
}

/** Publish an event to other server instances handling the same document. */
export async function publishRelay(
  documentId: string,
  kind: RelayMessage['kind'],
  payload?: string,
): Promise<void> {
  const message: RelayMessage = { origin: SERVER_ID, documentId, kind, payload };
  await redis.publish(relayChannel(documentId), JSON.stringify(message));
}

/** Broadcast a Yjs update to every client currently in a document room. */
export function broadcastDocUpdate(documentId: string, update: Uint8Array): void {
  io?.to(documentId).emit('doc:update', { documentId, update });
}

/**
 * Tell every client in a document room (here and on other instances) that the
 * comment thread changed, so they refetch.
 */
export function broadcastCommentsChanged(documentId: string): void {
  io?.to(documentId).emit('comments:changed', { documentId });
  void publishRelay(documentId, 'comments');
}
