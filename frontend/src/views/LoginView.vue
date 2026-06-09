<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const email = ref('');
const password = ref('');

async function submit(): Promise<void> {
  const ok = await auth.login(email.value, password.value);
  if (ok) {
    const redirect = route.query.redirect as string | undefined;
    router.push(redirect || { name: 'orders' });
  }
}

function goRegister(): void {
  router.push({ name: 'register', query: route.query });
}

function goHome(): void {
  router.push({ name: 'dashboard' });
}
</script>

<template>
  <div class="login-wrap">
    <form class="card" @submit.prevent="submit">
      <button type="button" class="home-link" @click="goHome">← 메인으로</button>
      <h1>AI 점포 운영 시스템</h1>
      <p class="hint">로그인하여 발주·재고·매출을 확인하세요.</p>

      <label>
        이메일
        <input v-model="email" type="email" autocomplete="off" required />
      </label>
      <label>
        비밀번호
        <input v-model="password" type="password" autocomplete="off" required />
      </label>

      <button type="submit" :disabled="auth.loading">
        {{ auth.loading ? '로그인 중…' : '로그인' }}
      </button>

      <button type="button" class="secondary" :disabled="auth.loading" @click="goRegister">
        회원가입
      </button>

      <p v-if="auth.error" class="error">로그인 실패: {{ auth.error }}</p>
    </form>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f4ff, #ecebfe);
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
h1 { font-size: 1.25rem; margin: 0; color: #0d253d; }
.hint { color: #64748d; margin: 0 0 0.5rem; font-size: 0.9rem; }
label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; color: #273951; }
input {
  padding: 0.65rem 0.75rem;
  font-size: 1rem;
  border: 1px solid #c7d2e0;
  border-radius: 6px;
  background: #fff;
}
input:focus { outline: 2px solid #665efd; border-color: transparent; }
button {
  padding: 0.75rem;
  background: #533afd;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
button:disabled { background: #8a99af; cursor: not-allowed; }
button.secondary {
  background: #fff;
  color: #533afd;
  border: 1px solid #533afd;
}
button.secondary:disabled { background: #fff; color: #8a99af; border-color: #c7d2e0; cursor: not-allowed; }
.error { color: #b91c1c; font-size: 0.85rem; margin: 0; }
.home-link {
  align-self: flex-start;
  background: transparent;
  border: none;
  color: #64748d;
  font-size: 0.8rem;
  padding: 0;
  cursor: pointer;
  width: auto;
  font-weight: 500;
}
.home-link:hover { color: #533afd; }
code { background: #eef3f8; padding: 0.1rem 0.35rem; border-radius: 4px; }
</style>
