/**
 * T072 — auth store 단위 테스트 (Vitest)
 *   API 클라이언트를 vi.mock 으로 격리.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(async (email: string) => ({
      user: {
        id: 1, email, displayName: 'demo',
        globalRole: 'STORE_USER', stores: [{ storeId: 1, storeRole: 'STORE_OWNER' }],
      },
    })),
    me: vi.fn(async () => { throw new Error('not auth'); }),
    logout: vi.fn(async () => ({ ok: true })),
  },
}));

import { useAuthStore } from '@/stores/auth';

describe('auth store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('logs in and sets user', async () => {
    const auth = useAuthStore();
    const ok = await auth.login('a@b.com', 'pw');
    expect(ok).toBe(true);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.primaryStoreId).toBe(1);
  });

  it('logout clears user', async () => {
    const auth = useAuthStore();
    await auth.login('a@b.com', 'pw');
    await auth.logout();
    expect(auth.user).toBeNull();
  });
});
