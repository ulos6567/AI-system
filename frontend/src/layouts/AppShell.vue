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

// 상단바 — 핵심 가치 중심 3개 카테고리 드롭다운 (9개 메뉴)
const navGroups = [
  {
    label: '홈',
    items: [
      { name: 'dashboard',     label: '매장 종합 현황',   icon: '🏠' },
      { name: 'self-checkout', label: 'AI 결제 시뮬레이터', icon: '🛒' },
    ],
  },
  {
    label: 'AI 스마트 분석',
    items: [
      { name: 'assistant', label: 'AI 챗봇',           icon: '🤖' },
      { name: 'insights',  label: '매장 맞춤 개선 제안', icon: '💡' },
      { name: 'analytics', label: '손님 행동·동선 분석', icon: '🗺️' },
    ],
  },
  {
    label: '자동화 관리',
    items: [
      { name: 'orders',         label: 'AI 추천 자동 발주',  icon: '📦' },
      { name: 'pricing-rules',  label: '실시간 스마트 가격 설정', icon: '💲' },
      { name: 'mappings',       label: '상품 코드 관리',     icon: '🔗' },
      { name: 'local-delivery', label: '로컬 상생 배송 관리', icon: '🚚' },
    ],
  },
];

// 열린 드롭다운 그룹 (없으면 null)
const openGroup = ref<string | null>(null);
function toggleGroup(label: string): void {
  openGroup.value = openGroup.value === label ? null : label;
}
function isGroupActive(g: { items: Array<{ name: string }> }): boolean {
  return g.items.some((i) => i.name === route.name);
}

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
        <template v-if="auth.isAuthenticated">
          <span class="user">{{ auth.user?.displayName }}</span>
          <span class="role" :class="{ admin: auth.isAdmin }" :title="auth.isAdmin ? '쓰기 권한 보유' : '읽기 전용 계정'">
            {{ auth.isAdmin ? '🛡 ' + auth.roleLabel : '👁 ' + auth.roleLabel }}
          </span>
          <button class="logout" @click="doLogout">로그아웃</button>
        </template>
        <template v-else>
          <span class="role" title="비로그인 열람 모드">👁 게스트 · 열람 전용</span>
          <button class="logout" @click="router.push({ name: 'login' })">로그인</button>
        </template>
      </div>
    </header>

    <!-- 상단 가로 메뉴바 — 3개 카테고리 드롭다운 -->
    <nav class="topnav" aria-label="주 메뉴">
      <div v-for="g in navGroups" :key="g.label" class="nav-group">
        <button
          class="nav-trigger"
          :class="{ active: isGroupActive(g), open: openGroup === g.label }"
          @click="toggleGroup(g.label)"
        >
          <span>{{ g.label }}</span>
          <span class="caret">▾</span>
        </button>
        <div v-if="openGroup === g.label" class="nav-menu">
          <router-link
            v-for="item in g.items"
            :key="item.name"
            :to="{ name: item.name }"
            class="nav-menu-item"
            :class="{ active: route.name === item.name }"
            @click="openGroup = null"
          >
            <span class="icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </router-link>
        </div>
      </div>
    </nav>
    <!-- 드롭다운 바깥 클릭 시 닫기 -->
    <div v-if="openGroup" class="nav-backdrop" @click="openGroup = null"></div>

    <div v-if="!auth.isAdmin && route.name !== 'self-checkout'" class="readonly-banner">
      <template v-if="auth.isAuthenticated">
        🔒 열람 전용 계정입니다. 발주 승인·가격 변경·매핑 수정 등 데이터 수정은 관리자(본사)만 가능합니다.
      </template>
      <template v-else>
        👁 로그인 없이 둘러보는 중입니다. 데이터 조회는 자유롭게, 수정은 <a class="banner-link" @click="router.push({ name: 'login' })">로그인</a> 후 관리자만 가능합니다.
      </template>
      <span class="banner-sub">AI 결제 시뮬레이터는 누구나 이용할 수 있어요.</span>
    </div>

    <main class="content" :class="{ 'bg-cool': route.name === 'dashboard' }">
      <router-view />
    </main>

    <EventPanel />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: inherit;
  background: var(--canvas-soft);
  color: var(--ink);
}
.topbar {
  height: 56px;
  background: #0d253d;
  color: #eef3f8;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 0.75rem;
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand { font-weight: 700; }
.meta { margin-left: auto; display: flex; align-items: center; gap: 0.55rem; font-size: 0.85rem; }
.store { background: #1c1e54; padding: 0.2rem 0.5rem; border-radius: 4px; }
.conn { font-size: 0.7rem; opacity: 0.6; }
.conn.ok { opacity: 1; }
.bell {
  position: relative;
  background: transparent;
  border: none;
  color: #eef3f8;
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
.role {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: #273951;
  color: #c7d2e0;
  white-space: nowrap;
}
.role.admin { background: var(--primary); color: #fff; }
.logout {
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--r-pill);
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.15s ease;
}
.logout:hover { background: var(--primary-press); }
.readonly-banner {
  /* 보라 톤과 어울리는 연한 라벤더 틴트(반투명) + 다크 그레이 글자로 은은하게 */
  background: rgba(83, 58, 253, 0.07);
  color: #3f4453;
  border-bottom: 1px solid rgba(83, 58, 253, 0.12);
  padding: 0.55rem 1rem;
  font-size: 0.82rem;
  font-weight: 500;
  text-align: center;
}
.banner-sub { color: #64748d; margin-left: 0.4rem; }
.banner-link { color: #533afd; text-decoration: underline; cursor: pointer; }

/* 상단 메뉴바 — 3개 카테고리 드롭다운 (헤더 바로 아래 고정) */
.topnav {
  position: sticky;
  top: 56px;
  z-index: 9;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  height: 48px;
  padding: 0 0.75rem;
  background: #fff;
  border-bottom: 1px solid var(--hairline);
}
.nav-group { position: relative; }
.nav-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 500;
  color: #273951;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.45rem 0.8rem;
  border-radius: 8px;
  transition: background 0.15s ease, color 0.15s ease;
}
.nav-trigger:hover { background: #eef3f8; }
.nav-trigger.active { background: rgba(83, 58, 253, 0.1); color: #4434d4; font-weight: 600; }
.nav-trigger.open { background: #eef3f8; }
.nav-trigger .caret { font-size: 0.7rem; opacity: 0.55; }
.nav-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 196px;
  background: #fff;
  border: 1px solid var(--hairline);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.1);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 30;
}
.nav-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  color: #273951;
  text-decoration: none;
  font-size: 0.85rem;
}
.nav-menu-item .icon { font-size: 0.95rem; line-height: 1; }
.nav-menu-item:hover { background: #eef3f8; }
.nav-menu-item.active { background: rgba(83, 58, 253, 0.1); color: #4434d4; font-weight: 600; }
/* 바깥클릭 닫기용 — topnav(z-index:9)와 그 안의 드롭다운보다 아래에 둬서 메뉴 클릭을 막지 않게 */
.nav-backdrop { position: fixed; inset: 0; z-index: 8; background: transparent; }

.content { flex: 1; padding: 1.5rem; min-width: 0; }
/* 대시보드 라우트 — 콘텐츠 영역을 아주 연한 쿨그레이로(카드가 떠오르도록) */
.content.bg-cool { background: #f4f5f7; }

@media (max-width: 768px) {
  .meta .user { display: none; }
  .topnav { padding: 0 0.5rem; }
  .content { padding: 1rem; }
}
</style>
