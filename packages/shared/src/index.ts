/**
 * Shared types and contracts between the client and server.
 * Keeping these in one place guarantees the wire protocol stays in sync.
 */

// ---- Domain models ----

export type DocumentRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  ownerId: string;
  role: DocumentRole;
  updatedAt: string;
  createdAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  isPublic: boolean;
}

export interface Collaborator {
  userId: string;
  email: string;
  displayName: string;
  role: DocumentRole;
}

// ---- Auth payloads ----

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignupPayload extends AuthCredentials {
  displayName: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface AccessTokenClaims {
  sub: string; // user id
  email: string;
  iat: number;
  exp: number;
}

// ---- Presence / awareness ----

export interface CursorPosition {
  anchor: number;
  head: number;
}

export interface PresenceState {
  userId: string;
  clientId: number;
  displayName: string;
  color: string;
  cursor: CursorPosition | null;
  lastActive: number;
}

// ---- Socket.io event contracts ----

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  'doc:join': (payload: { documentId: string }, ack: (res: JoinAck) => void) => void;
  'doc:leave': (payload: { documentId: string }) => void;
  /** Binary Yjs document update (Uint8Array). */
  'doc:update': (payload: { documentId: string; update: Uint8Array }) => void;
  /** Binary Yjs awareness update (Uint8Array). */
  'awareness:update': (payload: { documentId: string; update: Uint8Array }) => void;
}

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  /** Full initial document state when joining (Yjs encoded state). */
  'doc:sync': (payload: { documentId: string; state: Uint8Array }) => void;
  'doc:update': (payload: { documentId: string; update: Uint8Array }) => void;
  'awareness:update': (payload: { documentId: string; update: Uint8Array }) => void;
  'doc:error': (payload: { documentId: string; message: string }) => void;
}

export interface JoinAck {
  ok: boolean;
  role?: DocumentRole;
  error?: string;
}

// ---- REST API error envelope ----

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export const DOCUMENT_ROLES: DocumentRole[] = ['owner', 'editor', 'commenter', 'viewer'];

/** Returns true if the role is allowed to mutate document content. */
export function canEdit(role: DocumentRole): boolean {
  return role === 'owner' || role === 'editor';
}

/** Returns true if the role is allowed to manage sharing / delete. */
export function canManage(role: DocumentRole): boolean {
  return role === 'owner';
}
