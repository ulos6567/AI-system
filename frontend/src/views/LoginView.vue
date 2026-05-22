<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const email = ref('store_owner_demo@example.com');
const password = ref('demo1234');

async function submit(): Promise<void> {
  const ok = await auth.login(email.value, password.value);
  if (ok) {
    const redirect = (route.query.redirect as string) || '/orders';
    router.push(redirect);
  }
}
</script>

<template>
  <div class="login-wrap">
    <form class="card" @submit.prevent="submit">
      <h1>AI 점포 운영 시스템</h1>
      <p class="hint">로그인하여 발주·재고·매출을 확인하세요.</p>

      <label>
        이메일
        <input v-model="email" type="email" autocomplete="username" required />
      </label>
      <label>
        비밀번호
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>

      <button type="submit" :disabled="auth.loading">
        {{ auth.loading ? '로그인 중…' : '로그인' }}
      </button>

      <p v-if="auth.error" class="error">로그인 실패: {{ auth.error }}</p>

      <p class="demo">
        데모: <code>store_owner_demo@example.com</code> / <code>demo1234</code>
      </p>
    </form>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
  padding: 1rem;
  font-family: system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif;
}
.card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
h1 { font-size: 1.25rem; margin: 0; color: #0f172a; }
.hint { color: #64748b; margin: 0 0 0.5rem; font-size: 0.9rem; }
label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; color: #334155; }
input {
  padding: 0.65rem 0.75rem;
  font-size: 1rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
}
input:focus { outline: 2px solid #38bdf8; border-color: transparent; }
button {
  padding: 0.75rem;
  background: #0ea5e9;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
button:disabled { background: #94a3b8; cursor: not-allowed; }
.error { color: #b91c1c; font-size: 0.85rem; margin: 0; }
.demo { color: #94a3b8; font-size: 0.75rem; margin: 0; text-align: center; }
code { background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 4px; }
</style>
