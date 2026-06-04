<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const email = ref('');
const password = ref('');
const passwordConfirm = ref('');
const displayName = ref('');
const localError = ref<string | null>(null);

async function submit(): Promise<void> {
  localError.value = null;
  if (password.value.length < 8) {
    localError.value = '비밀번호는 8자 이상이어야 합니다.';
    return;
  }
  if (password.value !== passwordConfirm.value) {
    localError.value = '비밀번호가 일치하지 않습니다.';
    return;
  }
  const ok = await auth.register(email.value, password.value, displayName.value);
  if (ok) {
    const redirect = route.query.redirect as string | undefined;
    router.push(redirect || { name: 'orders' });
  }
}

function goLogin(): void {
  router.push({ name: 'login', query: route.query });
}

function goHome(): void {
  router.push({ name: 'home' });
}
</script>

<template>
  <div class="login-wrap">
    <form class="card" @submit.prevent="submit">
      <button type="button" class="home-link" @click="goHome">← 메인으로</button>
      <h1>회원가입</h1>
      <p class="hint">계정을 만들어 AI 점포 운영 시스템을 이용하세요.</p>

      <label>
        이름
        <input v-model="displayName" type="text" autocomplete="off" required />
      </label>
      <label>
        이메일
        <input v-model="email" type="email" autocomplete="off" required />
      </label>
      <label>
        비밀번호
        <input v-model="password" type="password" autocomplete="new-password" minlength="8" required />
      </label>
      <label>
        비밀번호 확인
        <input v-model="passwordConfirm" type="password" autocomplete="new-password" required />
      </label>

      <button type="submit" :disabled="auth.loading">
        {{ auth.loading ? '가입 중…' : '회원가입' }}
      </button>

      <button type="button" class="secondary" :disabled="auth.loading" @click="goLogin">
        로그인으로 돌아가기
      </button>

      <p v-if="localError" class="error">{{ localError }}</p>
      <p v-else-if="auth.error" class="error">
        회원가입 실패: {{ auth.error === 'email_taken' ? '이미 사용 중인 이메일입니다.' : auth.error }}
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
button.secondary {
  background: #fff;
  color: #0ea5e9;
  border: 1px solid #0ea5e9;
}
button.secondary:disabled { background: #fff; color: #94a3b8; border-color: #cbd5e1; cursor: not-allowed; }
.error { color: #b91c1c; font-size: 0.85rem; margin: 0; }
.home-link {
  align-self: flex-start;
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 0.8rem;
  padding: 0;
  cursor: pointer;
  width: auto;
  font-weight: 500;
}
.home-link:hover { color: #0ea5e9; }
</style>
