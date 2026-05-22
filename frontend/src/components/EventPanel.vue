<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useEventsStore } from '@/stores/events';
import { useAuthStore } from '@/stores/auth';

const events = useEventsStore();
const auth = useAuthStore();
const storeId = computed(() => auth.primaryStoreId ?? 1);

async function refresh(): Promise<void> {
  if (!storeId.value) return;
  await Promise.all([events.refresh(storeId.value), events.refreshEvents(storeId.value)]);
}

onMounted(refresh);
watch(() => events.panelOpen, (open) => { if (open) refresh(); });

async function markRead(id: number): Promise<void> {
  await events.markRead(storeId.value, id);
}
async function markAll(): Promise<void> {
  await events.markAllRead(storeId.value);
}
</script>

<template>
  <transition name="fade">
    <aside v-if="events.panelOpen" class="panel" @keyup.esc="events.closePanel()">
      <header class="head">
        <h3>알림 / 이벤트</h3>
        <div>
          <button class="ghost sm" @click="markAll" :disabled="!events.unreadCount">전체 읽음</button>
          <button class="ghost sm" @click="events.closePanel()">닫기</button>
        </div>
      </header>

      <section class="section">
        <h4>알림 ({{ events.unreadCount }} 안 읽음)</h4>
        <ul v-if="events.sortedNotifications.length" class="list">
          <li v-for="n in events.sortedNotifications" :key="n.id" :class="{ unread: !n.readAt }">
            <div class="row">
              <span class="title">{{ n.title }}</span>
              <span class="ts">{{ n.createdAt.replace('T', ' ').slice(0, 16) }}</span>
            </div>
            <p class="body">{{ n.body }}</p>
            <button v-if="!n.readAt" class="ghost xs" @click="markRead(n.id)">읽음</button>
          </li>
        </ul>
        <p v-else class="empty">알림 없음</p>
      </section>

      <section class="section">
        <h4>최근 이벤트 (점포)</h4>
        <ul v-if="events.recentEvents.length" class="list">
          <li v-for="e in events.recentEvents.slice(0, 20)" :key="e.id" :class="`sev-${e.severity}`">
            <div class="row">
              <span class="sev">[{{ e.severity }}]</span>
              <span class="type">{{ e.eventType }}</span>
              <span class="ts">{{ e.occurredAt.replace('T', ' ').slice(11, 16) }}</span>
            </div>
            <p v-if="e.message" class="body">{{ e.message }}</p>
          </li>
        </ul>
        <p v-else class="empty">이벤트 없음</p>
      </section>
    </aside>
  </transition>
</template>

<style scoped>
.panel {
  position: fixed;
  top: 56px;
  right: 0;
  width: 360px;
  max-width: 100vw;
  height: calc(100vh - 56px);
  background: #fff;
  box-shadow: -4px 0 16px rgba(15,23,42,0.12);
  z-index: 30;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.head { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid #e2e8f0; }
.head h3 { margin: 0; font-size: 1rem; }
.section { padding: 0.5rem 1rem; overflow-y: auto; flex: 1; min-height: 0; }
.section h4 { margin: 0.75rem 0 0.5rem; font-size: 0.85rem; color: #475569; }
.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.list li { padding: 0.6rem 0.75rem; border-radius: 6px; background: #f8fafc; border-left: 3px solid transparent; }
.list li.unread { background: #eff6ff; border-left-color: #0ea5e9; }
.list li.sev-warn { border-left-color: #f59e0b; }
.list li.sev-error { border-left-color: #ef4444; background: #fef2f2; }
.list li.sev-critical { border-left-color: #b91c1c; background: #fee2e2; }
.list .row { display: flex; gap: 0.5rem; justify-content: space-between; align-items: baseline; }
.list .title { font-weight: 600; font-size: 0.9rem; }
.list .sev { font-size: 0.7rem; color: #475569; }
.list .type { font-size: 0.78rem; color: #0f172a; flex: 1; }
.list .ts { font-size: 0.7rem; color: #94a3b8; }
.list .body { margin: 0.3rem 0 0; font-size: 0.82rem; color: #334155; }
.empty { color: #94a3b8; font-size: 0.85rem; padding: 0.5rem 0; }

button { font-family: inherit; cursor: pointer; }
button.ghost { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; padding: 0.35rem 0.6rem; border-radius: 6px; margin-left: 0.3rem; }
button.sm { font-size: 0.8rem; }
button.xs { font-size: 0.75rem; padding: 0.2rem 0.45rem; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s, transform 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateX(20px); }

@media (max-width: 480px) {
  .panel { width: 100vw; }
}
</style>
