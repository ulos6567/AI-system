import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { setUnauthorizedHandler } from '@/api/client';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // 첫 화면 — 비로그인 방문자도 곧장 운영 대시보드(실데이터)로 진입
    { path: '/', redirect: { name: 'dashboard' } },
    // 기존 마케팅 소개 페이지는 /home 에서 계속 열람 가능
    { path: '/home', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { public: true } },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { public: true } },
    {
      // 앱 영역 (/app/*) — 비로그인 방문자도 읽기 전용으로 열람 가능
      path: '/app',
      component: () => import('@/layouts/AppShell.vue'),
      children: [
        { path: '', redirect: { name: 'dashboard' } },
        { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '매장 종합 현황' } },
        { path: 'insights', name: 'insights', component: () => import('@/views/InsightsView.vue'), meta: { title: '오늘의 점포 운영 현황' } },
        { path: 'assistant', name: 'assistant', component: () => import('@/views/AssistantView.vue'), meta: { title: 'AI 점포 매니저 어시스턴트' } },
        { path: 'analytics', name: 'analytics', component: () => import('@/views/AnalyticsView.vue'), meta: { title: '구역별 상품 진열 최적화' } },
        { path: 'sales-patterns', name: 'sales-patterns', component: () => import('@/views/SalesPatternsView.vue'), meta: { title: '판매 패턴 분석' } },
        { path: 'orders', name: 'orders', component: () => import('@/views/OrdersView.vue'), meta: { title: '발주 관리' } },
        { path: 'pricing/rules', name: 'pricing-rules', component: () => import('@/views/PricingRulesView.vue'), meta: { title: '실시간 가격 설정' } },
        { path: 'self-checkout', name: 'self-checkout', component: () => import('@/views/SelfCheckoutMockView.vue'), meta: { title: 'AI 결제 시뮬레이터' } },
        { path: 'mappings', name: 'mappings', component: () => import('@/views/ProductMappingsView.vue'), meta: { title: '상품 코드 관리' } },
        { path: 'local-delivery', name: 'local-delivery', component: () => import('@/views/LocalDeliveryView.vue'), meta: { title: '로컬 상생 배송 관리' } },
        // 매출 현황·가격 변경 이력·근무 일정 — 메인 메뉴(AppShell)에 노출됨
        { path: 'transactions', name: 'transactions', component: () => import('@/views/TransactionsView.vue'), meta: { title: '매출 현황' } },
        { path: 'pricing/events', name: 'pricing-events', component: () => import('@/views/PricingEventsView.vue'), meta: { title: '가격 변경 이력' } },
        { path: 'schedule', name: 'schedule', component: () => import('@/views/ScheduleView.vue'), meta: { title: '근무 일정' } },
        { path: 'campus', name: 'campus', component: () => import('@/views/CampusEventsView.vue'), meta: { title: '대학 축제·시험 캘린더' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.user) await auth.fetchMe();
  if (to.meta?.public) {
    if (auth.isAuthenticated && to.name === 'login') return { name: 'dashboard' };
    return true;
  }
  // /app/* 은 비로그인 방문자(게스트)도 읽기 전용으로 열람 가능 — 로그인 강제하지 않음
  return true;
});

// 브라우저 탭 제목 — 메뉴 명칭과 일치하도록 라우트 meta.title 반영
const BASE_TITLE = 'AI 점포 운영 시스템';
router.afterEach((to) => {
  const t = to.meta?.title as string | undefined;
  document.title = t ? `${t} · ${BASE_TITLE}` : BASE_TITLE;
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
