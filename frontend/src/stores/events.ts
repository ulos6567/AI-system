import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { eventsApi, type NotificationRow, type EventLogRow } from '@/api/events';

export const useEventsStore = defineStore('events', () => {
  const notifications = ref<NotificationRow[]>([]);
  const unreadCount = ref(0);
  const recentEvents = ref<EventLogRow[]>([]);
  const panelOpen = ref(false);

  const sortedNotifications = computed(() =>
    [...notifications.value].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  );

  async function refresh(storeId: number): Promise<void> {
    const { notifications: items, unreadCount: c } = await eventsApi.notifications(storeId);
    notifications.value = items;
    unreadCount.value = c;
  }

  async function refreshEvents(storeId: number): Promise<void> {
    const { events } = await eventsApi.list(storeId, { limit: 50 });
    recentEvents.value = events;
  }

  function pushIncomingNotification(data: any): void {
    // SSE 로부터 즉시 도달한 단건을 head 에 prepend
    notifications.value = [
      {
        id: data.id,
        storeId: 0,
        eventLogId: null,
        title: data.title,
        body: data.body ?? null,
        readAt: null,
        deliveredChannels: ['sse'],
        createdAt: data.createdAt ?? new Date().toISOString(),
      } as NotificationRow,
      ...notifications.value,
    ].slice(0, 200);
    unreadCount.value += 1;
  }

  function pushIncomingEvent(data: any): void {
    recentEvents.value = [
      {
        id: data.eventLogId ?? Math.random(),
        severity: data.severity,
        eventType: data.eventType,
        message: data.message ?? null,
        metadata: data.metadata ?? null,
        occurredAt: data.ts ?? new Date().toISOString(),
      } as EventLogRow,
      ...recentEvents.value,
    ].slice(0, 100);
  }

  async function markRead(storeId: number, id: number): Promise<void> {
    await eventsApi.markRead(storeId, id);
    const n = notifications.value.find((x) => x.id === id);
    if (n && !n.readAt) {
      n.readAt = new Date().toISOString();
      unreadCount.value = Math.max(0, unreadCount.value - 1);
    }
  }

  async function markAllRead(storeId: number): Promise<void> {
    await eventsApi.markAllRead(storeId);
    const now = new Date().toISOString();
    for (const n of notifications.value) if (!n.readAt) n.readAt = now;
    unreadCount.value = 0;
  }

  function togglePanel(): void { panelOpen.value = !panelOpen.value; }
  function closePanel(): void { panelOpen.value = false; }

  return {
    notifications, unreadCount, recentEvents, panelOpen, sortedNotifications,
    refresh, refreshEvents, pushIncomingNotification, pushIncomingEvent,
    markRead, markAllRead, togglePanel, closePanel,
  };
});
