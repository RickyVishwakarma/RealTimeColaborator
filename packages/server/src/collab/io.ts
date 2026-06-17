import type { Server } from 'socket.io';

// Holds the Socket.io server so non-socket code (e.g. REST routes performing a
// version restore) can push updates into document rooms.
let io: Server | null = null;

export function setIo(server: Server): void {
  io = server as Server;
}

/** Broadcast a Yjs update to every client currently in a document room. */
export function broadcastDocUpdate(documentId: string, update: Uint8Array): void {
  io?.to(documentId).emit('doc:update', { documentId, update });
}
