import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { setUnauthorizedHandler } from '@/api/client';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // 공개 메인 페이지 — 비로그인 방문자도 열람 가능 (첫 화면)
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { public: true } },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { public: true } },
    {
      // 인증이 필요한 앱 영역 (/app/*)
      path: '/app',
      component: () => import('@/layouts/AppShell.vue'),
      children: [
        { path: '', redirect: { name: 'dashboard' } },
        { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
        { path: 'insights', name: 'insights', component: () => import('@/views/InsightsView.vue') },
        { path: 'anomalies', name: 'anomalies', component: () => import('@/views/AnomaliesView.vue') },
        { path: 'assistant', name: 'assistant', component: () => import('@/views/AssistantView.vue') },
        { path: 'analytics', name: 'analytics', component: () => import('@/views/AnalyticsView.vue') },
        { path: 'devices', name: 'devices', component: () => import('@/views/DevicesView.vue') },
        { path: 'schedule', name: 'schedule', component: () => import('@/views/ScheduleView.vue') },
        { path: 'orders', name: 'orders', component: () => import('@/views/OrdersView.vue') },
        { path: 'inventory', name: 'inventory', component: () => import('@/views/InventoryView.vue') },
        { path: 'transactions', name: 'transactions', component: () => import('@/views/TransactionsView.vue') },
        { path: 'pricing/rules', name: 'pricing-rules', component: () => import('@/views/PricingRulesView.vue') },
        { path: 'pricing/events', name: 'pricing-events', component: () => import('@/views/PricingEventsView.vue') },
        { path: 'reports', name: 'reports', component: () => import('@/views/ReportsView.vue') },
        { path: 'self-checkout', name: 'self-checkout', component: () => import('@/views/SelfCheckoutMockView.vue') },
        { path: 'mappings', name: 'mappings', component: () => import('@/views/ProductMappingsView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.user) await auth.fetchMe();
  if (to.meta?.public) {
    if (auth.isAuthenticated && to.name === 'login') return { name: 'orders' };
    return true;
  }
  if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
  return true;
});

// 401 발생 시 강제 로그아웃 + /login 이동
setUnauthorizedHandler(() => {
  const auth = useAuthStore();
  auth.clear();
  if (router.currentRoute.value.name !== 'login') {
    router.push({ name: 'login' });
  }
});

export default router;
