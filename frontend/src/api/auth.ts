import { api } from './client';

export interface SessionUser {
  id: number;
  email: string;
  displayName: string;
  globalRole: 'SUPER_ADMIN' | 'HQ_OPERATOR' | 'STORE_USER';
  stores: Array<{ storeId: number; storeRole: 'STORE_OWNER' | 'STORE_STAFF' }>;
}

export const authApi = {
  login(email: string, password: string) {
    return api<{ user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  register(email: string, password: string, displayName: string) {
    return api<{ user: SessionUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
  },
  me() {
    return api<{ user: SessionUser }>('/auth/me');
  },
  logout() {
    return api<{ ok: true }>('/auth/logout', { method: 'POST' });
  },
};
