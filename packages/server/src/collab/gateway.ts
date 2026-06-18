import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  DocumentRole,
} from '@rtc/shared';
import { canEdit } from '@rtc/shared';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { getRole } from '../documents/permissions.js';
import { redisSub } from '../redis.js';
import { acquireDoc, releaseDoc, applyUpdate, encodeState } from './docManager.js';
import {
  setIo,
  publishRelay,
  relayChannel,
  SERVER_ID,
  type RelayMessage,
} from './io.js';
import { wsConnections } from '../metrics.js';

interface SocketData {
  userId: string;
  email: string;
  /** documentId -> role for rooms this socket has joined. */
  roles: Map<string, DocumentRole>;
}

type CollabSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

export function attachCollabGateway(httpServer: HttpServer): Server {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>(httpServer, {
    cors: { origin: config.CLIENT_ORIGIN, credentials: true },
    maxHttpBufferSize: 5 * 1024 * 1024, // 5MB cap per message
  });

  // Expose the server so REST routes (version restore, live comments) can broadcast.
  setIo(io as unknown as import('socket.io').Server);

  // --- Authentication handshake ---
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const claims = verifyAccessToken(token);
      socket.data.userId = claims.sub;
      socket.data.email = claims.email;
      socket.data.roles = new Map();
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // --- Cross-server relay: re-broadcast events from other server instances ---
  redisSub.on('messageBuffer', (channelBuf: Buffer, messageBuf: Buffer) => {
    const ch = channelBuf.toString();
    if (!ch.startsWith('doc:') || !ch.endsWith(':relay')) return;
    const msg = JSON.parse(messageBuf.toString()) as RelayMessage;
    if (msg.origin === SERVER_ID) return; // ignore our own publishes
    if (msg.kind === 'comments') {
      io.to(msg.documentId).emit('comments:changed', { documentId: msg.documentId });
      return;
    }
    const update = new Uint8Array(Buffer.from(msg.payload ?? '', 'base64'));
    const event = msg.kind === 'doc' ? 'doc:update' : 'awareness:update';
    io.to(msg.documentId).emit(event, { documentId: msg.documentId, update });
  });

  const relayBinary = (documentId: string, kind: 'doc' | 'awareness', payload: Uint8Array) =>
    publishRelay(documentId, kind, Buffer.from(payload).toString('base64'));

  io.on('connection', (socket: CollabSocket) => {
    wsConnections.inc();
    logger.debug({ userId: socket.data.userId, sid: socket.id }, 'Socket connected');

    socket.on('doc:join', async ({ documentId }, ack) => {
      try {
        const role = await getRole(documentId, socket.data.userId);
        if (!role) {
          ack({ ok: false, error: 'Access denied' });
          return;
        }

        await acquireDoc(documentId);
        socket.data.roles.set(documentId, role);
        await socket.join(documentId);

        // Subscribe this server to the document's relay channel (idempotent).
        await redisSub.subscribe(relayChannel(documentId));

        const state = encodeState(documentId);
        if (state) socket.emit('doc:sync', { documentId, state });

        ack({ ok: true, role });
        logger.debug({ documentId, userId: socket.data.userId, role }, 'Joined document');
      } catch (err) {
        logger.error({ err, documentId }, 'doc:join failed');
        ack({ ok: false, error: 'Internal error' });
      }
    });

    socket.on('doc:update', async ({ documentId, update }) => {
      const role = socket.data.roles.get(documentId);
      if (!role || !canEdit(role)) {
        socket.emit('doc:error', { documentId, message: 'You do not have edit permission' });
        return;
      }
      const bytes = update instanceof Uint8Array ? update : new Uint8Array(update);
      await applyUpdate(documentId, bytes, socket.data.userId);
      // Broadcast to everyone else in the room on this server...
      socket.to(documentId).emit('doc:update', { documentId, update: bytes });
      // ...and to clients connected to other server instances.
      await relayBinary(documentId, 'doc', bytes);
    });

    socket.on('awareness:update', async ({ documentId, update }) => {
      if (!socket.data.roles.has(documentId)) return;
      const bytes = update instanceof Uint8Array ? update : new Uint8Array(update);
      socket.to(documentId).emit('awareness:update', { documentId, update: bytes });
      await relayBinary(documentId, 'awareness', bytes);
    });

    socket.on('doc:leave', async ({ documentId }) => {
      await leaveDocument(socket, documentId);
    });

    socket.on('disconnect', async () => {
      wsConnections.dec();
      for (const documentId of socket.data.roles.keys()) {
        await releaseDoc(documentId);
      }
      socket.data.roles.clear();
      logger.debug({ sid: socket.id }, 'Socket disconnected');
    });
  });

  return io;
}

async function leaveDocument(socket: CollabSocket, documentId: string): Promise<void> {
  if (!socket.data.roles.has(documentId)) return;
  socket.data.roles.delete(documentId);
  await socket.leave(documentId);
  await releaseDoc(documentId);
}
