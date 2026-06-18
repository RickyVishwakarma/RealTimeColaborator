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

export interface Folder {
  id: string;
  name: string;
  docCount: number;
}

export interface DocumentSummary {
  id: string;
  title: string;
  ownerId: string;
  role: DocumentRole;
  folderId: string | null;
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

export interface CommentAuthor {
  id: string;
  displayName: string;
}

export interface Comment {
  id: string;
  documentId: string;
  threadId: string | null;
  author: CommentAuthor;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A root comment with its replies, ordered oldest-first. */
export interface CommentThread {
  root: Comment;
  replies: Comment[];
}

export type NotificationType = 'shared' | 'comment' | 'mention';

export interface Notification {
  id: string;
  type: NotificationType;
  documentId: string | null;
  documentTitle: string | null;
  actorName: string | null;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface SearchResult {
  id: string;
  title: string;
  role: DocumentRole;
  snippet: string;
  updatedAt: string;
}

export interface DocumentVersion {
  id: string;
  label: string;
  author: CommentAuthor | null;
  createdAt: string;
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
  /** A comment was created/resolved/deleted — clients should refetch. */
  'comments:changed': (payload: { documentId: string }) => void;
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

/** Returns true if the role is allowed to post comments. */
export function canComment(role: DocumentRole): boolean {
  return role === 'owner' || role === 'editor' || role === 'commenter';
}
