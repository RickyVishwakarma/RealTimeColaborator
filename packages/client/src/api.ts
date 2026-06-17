import type {
  AuthResponse,
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
  createDocument: (title: string) =>
    request<{ document: DocumentSummary }>('/api/documents', { method: 'POST', body: { title } }),
  getDocument: (id: string) => request<{ document: DocumentDetail }>(`/api/documents/${id}`),
  shareDocument: (id: string, email: string, role: 'editor' | 'commenter' | 'viewer') =>
    request<void>(`/api/documents/${id}/share`, { method: 'POST', body: { email, role } }),
  deleteDocument: (id: string) => request<void>(`/api/documents/${id}`, { method: 'DELETE' }),
};
