import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi, type SessionUser } from '@/api/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => user.value !== null);
  const primaryStoreId = computed(() => user.value?.stores[0]?.storeId ?? null);

  // 쓰기 권한 — 본사급 관리자(SUPER_ADMIN / HQ_OPERATOR)만 true.
  // 점주·직원·신규 가입자는 모두 열람(읽기) 전용.
  const isAdmin = computed(
    () => user.value?.globalRole === 'SUPER_ADMIN' || user.value?.globalRole === 'HQ_OPERATOR',
  );
  const roleLabel = computed(() => {
    switch (user.value?.globalRole) {
      case 'SUPER_ADMIN':
        return '시스템 관리자';
      case 'HQ_OPERATOR':
        return '본사 운영자';
      case 'STORE_USER':
        return user.value?.stores[0]?.storeRole === 'STORE_OWNER' ? '점주 · 열람 전용' : '열람 전용';
      default:
        return '';
    }
  });

  async function login(email: string, password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const { user: u } = await authApi.login(email, password);
      user.value = u;
      return true;
    } catch (err: any) {
      error.value = err?.detail?.error ?? err?.message ?? 'login_failed';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function register(email: string, password: string, displayName: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const { user: u } = await authApi.register(email, password, displayName);
      user.value = u;
      return true;
    } catch (err: any) {
      error.value = err?.detail?.error ?? err?.message ?? 'register_failed';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMe(): Promise<boolean> {
    try {
      const { user: u } = await authApi.me();
      user.value = u;
      return true;
    } catch {
      user.value = null;
      return false;
    }
  }

  async function logout(): Promise<void> {
    try { await authApi.logout(); } catch { /* ignore */ }
    user.value = null;
  }

  function clear(): void { user.value = null; }

  return { user, loading, error, isAuthenticated, primaryStoreId, isAdmin, roleLabel, login, register, fetchMe, logout, clear };
});
