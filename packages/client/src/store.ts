import { create } from 'zustand';
import type { User } from '@rtc/shared';
import { api, setAccessToken } from './api';

interface AuthState {
  user: User | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  login: async (email, password) => {
    const res = await api.login({ email, password });
    setAccessToken(res.accessToken);
    set({ user: res.user, status: 'authenticated' });
  },

  signup: async (email, password, displayName) => {
    const res = await api.signup({ email, password, displayName });
    setAccessToken(res.accessToken);
    set({ user: res.user, status: 'authenticated' });
  },

  setUser: (user) => set({ user }),

  logout: async () => {
    await api.logout().catch(() => undefined);
    setAccessToken(null);
    set({ user: null, status: 'anonymous' });
  },

  // On app load, try to restore the session via the httpOnly refresh cookie.
  bootstrap: async () => {
    const ok = await api.refresh();
    if (!ok) {
      set({ status: 'anonymous' });
      return;
    }
    try {
      const { user } = await api.me();
      set({ user, status: 'authenticated' });
    } catch {
      set({ status: 'anonymous' });
    }
  },
}));
