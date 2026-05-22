import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi, type SessionUser } from '@/api/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => user.value !== null);
  const primaryStoreId = computed(() => user.value?.stores[0]?.storeId ?? null);

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

  return { user, loading, error, isAuthenticated, primaryStoreId, login, fetchMe, logout, clear };
});
