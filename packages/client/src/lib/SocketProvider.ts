import * as Y from 'yjs';
import { io, type Socket } from 'socket.io-client';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import type { ClientToServerEvents, ServerToClientEvents } from '@rtc/shared';
import { WS_URL } from '../config';

type RtcSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * A minimal Yjs network provider built on Socket.io.
 *
 * Responsibilities:
 *  - Stream local document updates to the server and apply remote ones.
 *  - Sync the Awareness protocol (cursors / presence).
 *  - Surface connection status to the UI.
 *
 * Conflict resolution is handled entirely by Yjs (CRDT) — this provider only
 * moves bytes. Reconnection and exponential backoff are delegated to Socket.io.
 */
export class SocketProvider {
  readonly awareness: Awareness;
  readonly socket: RtcSocket;
  private synced = false;

  constructor(
    private readonly documentId: string,
    private readonly doc: Y.Doc,
    token: string,
    private readonly onStatus?: (status: 'connecting' | 'connected' | 'disconnected') => void,
    private readonly onCommentsChanged?: () => void,
  ) {
    this.awareness = new Awareness(doc);

    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionDelayMax: 30_000,
    }) as RtcSocket;

    this.doc.on('update', this.handleLocalUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);

    this.socket.on('connect', () => {
      this.onStatus?.('connecting');
      this.socket.emit('doc:join', { documentId }, (ack) => {
        if (!ack.ok) {
          console.error('Failed to join document:', ack.error);
          this.onStatus?.('disconnected');
          return;
        }
        this.onStatus?.('connected');
      });
    });

    this.socket.on('disconnect', () => this.onStatus?.('disconnected'));

    this.socket.on('doc:sync', ({ state }) => {
      Y.applyUpdate(this.doc, new Uint8Array(state), this);
      this.synced = true;
      // Push our initial awareness state once synced.
      this.broadcastAwareness([this.doc.clientID]);
    });

    this.socket.on('doc:update', ({ update }) => {
      Y.applyUpdate(this.doc, new Uint8Array(update), this);
    });

    this.socket.on('comments:changed', () => {
      this.onCommentsChanged?.();
    });

    this.socket.on('awareness:update', ({ update }) => {
      applyAwarenessUpdate(this.awareness, new Uint8Array(update), this);
    });

    this.socket.on('doc:error', ({ message }) => console.error('Document error:', message));
  }

  get isSynced(): boolean {
    return this.synced;
  }

  private handleLocalUpdate = (update: Uint8Array, origin: unknown): void => {
    // Don't echo updates that came from the network back to the server.
    if (origin === this) return;
    this.socket.emit('doc:update', { documentId: this.documentId, update });
  };

  private handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === this) return;
    this.broadcastAwareness([...added, ...updated, ...removed]);
  };

  private broadcastAwareness(clients: number[]): void {
    const update = encodeAwarenessUpdate(this.awareness, clients);
    this.socket.emit('awareness:update', { documentId: this.documentId, update });
  }

  destroy(): void {
    this.doc.off('update', this.handleLocalUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.socket.emit('doc:leave', { documentId: this.documentId });
    this.awareness.destroy();
    this.socket.disconnect();
  }
}
