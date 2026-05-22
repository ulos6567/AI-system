<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useEventsStore } from '@/stores/events';
import { useEventStream } from '@/composables/useEventStream';
import EventPanel from '@/components/EventPanel.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const events = useEventsStore();
const navOpen = ref(false);

const navItems = [
  { name: 'orders',         label: '발주',        icon: '📦' },
  { name: 'inventory',      label: '재고',        icon: '🗄️' },
  { name: 'transactions',   label: '거래/매출',    icon: '💳' },
  { name: 'pricing-rules',  label: '가격 룰',     icon: '💲' },
  { name: 'pricing-events', label: '가격 이력',    icon: '📈' },
  { name: 'reports',        label: '리포트',      icon: '📊' },
  { name: 'self-checkout',  label: '셀프 결제',   icon: '🛒' },
  { name: 'mappings',       label: '매핑 검토',   icon: '🔗' },
];

const currentStore = computed(() => {
  const sid = auth.primaryStoreId;
  if (!sid) return '본사';
  return `점포 #${sid}`;
});

async function doLogout(): Promise<void> {
  await auth.logout();
  router.push({ name: 'login' });
}

const sseUrl = computed(() => {
  const sid = auth.primaryStoreId ?? 1;
  const base = import.meta.env.VITE_API_BASE_URL || '/api';
  return `${base}/stores/${sid}/events/stream`;
});

const { connected } = useEventStream(sseUrl.value, {
  onEvent(data) { events.pushIncomingEvent(data); },
  onNotification(data) { events.pushIncomingNotification(data); },
});

onMounted(async () => {
  if (auth.primaryStoreId) {
    await events.refresh(auth.primaryStoreId);
  }
});
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <button class="hamburger" aria-label="menu" @click="navOpen = !navOpen">☰</button>
      <div class="brand">AI 점포 운영</div>
      <div class="meta">
        <span class="store">{{ currentStore }}</span>
        <span class="conn" :class="{ ok: connected }" :title="connected ? '실시간 연결됨' : '재연결 시도 중…'">
          {{ connected ? '🟢' : '⚪' }}
        </span>
        <button class="bell" aria-label="notifications" @click="events.togglePanel()">
          🔔
          <span v-if="events.unreadCount > 0" class="badge">{{ events.unreadCount > 99 ? '99+' : events.unreadCount }}</span>
        </button>
        <span class="user">{{ auth.user?.displayName }}</span>
        <button class="logout" @click="doLogout">로그아웃</button>
      </div>
    </header>

    <div class="body">
      <nav class="sidenav" :class="{ open: navOpen }" @click="navOpen = false">
        <ul>
          <li v-for="item in navItems" :key="item.name">
            <router-link :to="{ name: item.name }" :class="{ active: route.name === item.name }">
              <span class="icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </router-link>
          </li>
        </ul>
      </nav>

      <main class="content">
        <router-view />
      </main>
    </div>

    <EventPanel />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif;
  background: #f8fafc;
  color: #0f172a;
}
.topbar {
  height: 56px;
  background: #0f172a;
  color: #f1f5f9;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 0.75rem;
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand { font-weight: 700; }
.hamburger { background: transparent; border: none; color: #f1f5f9; font-size: 1.25rem; cursor: pointer; display: none; }
.meta { margin-left: auto; display: flex; align-items: center; gap: 0.55rem; font-size: 0.85rem; }
.store { background: #1e293b; padding: 0.2rem 0.5rem; border-radius: 4px; }
.conn { font-size: 0.7rem; opacity: 0.6; }
.conn.ok { opacity: 1; }
.bell {
  position: relative;
  background: transparent;
  border: none;
  color: #f1f5f9;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
}
.bell .badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: #ef4444;
  color: #fff;
  border-radius: 999px;
  font-size: 0.65rem;
  padding: 0.05rem 0.35rem;
  min-width: 1.1rem;
  text-align: center;
  font-weight: 700;
}
.logout { background: #38bdf8; color: #0f172a; border: none; border-radius: 4px; padding: 0.3rem 0.6rem; cursor: pointer; font-weight: 600; }
.body { display: flex; flex: 1; min-height: 0; }
.sidenav {
  width: 220px;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  padding: 1rem 0.5rem;
}
.sidenav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.sidenav a {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  border-radius: 6px;
  text-decoration: none;
  color: #334155;
}
.sidenav a:hover { background: #f1f5f9; }
.sidenav a.active { background: #0ea5e9; color: #fff; }
.content { flex: 1; padding: 1.5rem; min-width: 0; }

@media (max-width: 768px) {
  .hamburger { display: inline-flex; }
  .meta .user { display: none; }
  .sidenav {
    position: fixed;
    top: 56px;
    left: -240px;
    height: calc(100vh - 56px);
    transition: left 0.2s ease;
    box-shadow: 4px 0 12px rgba(0,0,0,0.1);
    z-index: 20;
  }
  .sidenav.open { left: 0; }
  .content { padding: 1rem; }
}
</style>
