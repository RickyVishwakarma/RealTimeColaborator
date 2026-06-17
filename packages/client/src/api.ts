import type {
  AuthResponse,
  Comment,
  CommentThread,
  DocumentVersion,
  Notification,
  SearchResult,
  DocumentDetail,
  DocumentSummary,
  SignupPayload,
  AuthCredentials,
} from '@rtc/shared';
import { API_URL } from './config';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Retry once after refreshing the access token on 401. */
  retryOnAuth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, retryOnAuth = true } = opts;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retryOnAuth && path !== '/api/auth/refresh') {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...opts, retryOnAuth: false });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = (await res.json()) as AuthResponse;
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  signup: (payload: SignupPayload) =>
    request<AuthResponse>('/api/auth/signup', { method: 'POST', body: payload }),
  login: (payload: AuthCredentials) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: payload }),
  refresh: tryRefresh,
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: import('@rtc/shared').User }>('/api/auth/me'),

  listDocuments: () => request<{ documents: DocumentSummary[] }>('/api/documents'),
  search: (q: string) =>
    request<{ results: SearchResult[] }>(`/api/documents/search?q=${encodeURIComponent(q)}`),
  createDocument: (title: string) =>
    request<{ document: DocumentSummary }>('/api/documents', { method: 'POST', body: { title } }),
  getDocument: (id: string) => request<{ document: DocumentDetail }>(`/api/documents/${id}`),
  shareDocument: (id: string, email: string, role: 'editor' | 'commenter' | 'viewer') =>
    request<void>(`/api/documents/${id}/share`, { method: 'POST', body: { email, role } }),
  renameDocument: (id: string, title: string) =>
    request<void>(`/api/documents/${id}`, { method: 'PATCH', body: { title } }),
  deleteDocument: (id: string) => request<void>(`/api/documents/${id}`, { method: 'DELETE' }),

  listComments: (docId: string) =>
    request<{ threads: CommentThread[] }>(`/api/documents/${docId}/comments`),
  createComment: (docId: string, body: string, threadId?: string) =>
    request<{ comment: Comment }>(`/api/documents/${docId}/comments`, {
      method: 'POST',
      body: { body, threadId: threadId ?? null },
    }),
  resolveThread: (docId: string, commentId: string, resolved: boolean) =>
    request<void>(`/api/documents/${docId}/comments/${commentId}/resolve`, {
      method: 'POST',
      body: { resolved },
    }),
  deleteComment: (docId: string, commentId: string) =>
    request<void>(`/api/documents/${docId}/comments/${commentId}`, { method: 'DELETE' }),

  listVersions: (docId: string) =>
    request<{ versions: DocumentVersion[] }>(`/api/documents/${docId}/versions`),
  createVersion: (docId: string, label: string) =>
    request<{ version: DocumentVersion }>(`/api/documents/${docId}/versions`, {
      method: 'POST',
      body: { label },
    }),
  previewVersion: (docId: string, versionId: string) =>
    request<{ content: string }>(`/api/documents/${docId}/versions/${versionId}/preview`),
  restoreVersion: (docId: string, versionId: string) =>
    request<void>(`/api/documents/${docId}/versions/${versionId}/restore`, { method: 'POST' }),

  listNotifications: () =>
    request<{ notifications: Notification[]; unread: number }>('/api/notifications'),
  markNotificationRead: (id: string) =>
    request<void>(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request<void>('/api/notifications/read-all', { method: 'POST' }),
};
