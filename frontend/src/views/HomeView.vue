<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

// 핵심 가치 제안 (DDBM 캔버스 · 가치제안)
const valueProps = [
  {
    icon: '🏪',
    audience: '가맹점주',
    title: '구인난 해소 · 폐기 최소화',
    desc: '심야 시간대 구인난을 자동화로 해소하고 인건비를 절감합니다. AI 정밀 수요예측으로 악성재고와 폐기를 줄이고, 매장에 나오지 않아도 모바일로 실시간 관리하세요.',
    points: ['심야 인건비 절감', '악성재고·폐기율 최소화', '원격 모바일 모니터링'],
    tint: 'sky',
  },
  {
    icon: '🛍️',
    audience: '최종 고객',
    title: '대기 없는 즉시 결제 경험',
    desc: '공항·번화가 등 인구 밀집 지역에서도 줄 서지 않고 즉시 결제하는 혁신적 쇼핑 경험. 24시간 언제나 원하는 상품이 채워져 있는 안정적인 매장을 제공합니다.',
    points: ['무인 고속 결제', '24시간 안정적 재고', '개인 맞춤 혜택'],
    tint: 'lavender',
  },
];

// 핵심 역량 (ISP 캔버스 · TO-BE 목표 기능)
const capabilities = [
  {
    icon: '🤖',
    title: 'AI 자가학습 자동발주',
    desc: '기상예보·인근 행사·과거 트렌드를 복합 분석해 최적 발주량을 산출하고, 물류 시스템과 연동해 점주 개입 없이 자동 주문합니다.',
    tint: 'peach',
  },
  {
    icon: '🏷️',
    title: '실시간 다이나믹 프라이싱',
    desc: '유통기한 임박·날씨 변화를 감지하면 AI가 할인율을 계산해 ESL 전자가격표시기에 실시간 반영합니다. (예: 마감 3시간 전 도시락 30% 할인)',
    tint: 'rose',
  },
  {
    icon: '📣',
    title: '하이퍼로컬 타겟 마케팅',
    desc: '타임세일로 전환된 가격 정보를 매장 인근 앱 사용자에게 위치 기반 푸시 알림으로 자동 발송합니다.',
    tint: 'mint',
  },
  {
    icon: '📷',
    title: 'Vision AI 무인·고속 결제',
    desc: '바코드 없이 카메라와 중량센서가 상품을 자동 인식하는 결제, 음성 인식 AI 어시스턴트와 원격 화상 상담을 제공합니다.',
    tint: 'yellow',
  },
];

// 성과 지표 (ISP 캔버스 · 기대효과·성공지표 KPIs)
const stats = [
  { value: '40%↓', label: '신선식품 폐기율 감소' },
  { value: '15%↑', label: '객단가·총매출 상승' },
  { value: '90%+', label: '수요예측 정확도 (MAPE)' },
  { value: '99.99%', label: '시스템 가동률 (Uptime)' },
];

// 작동 방식 (DDBM 캔버스 · 핵심 활동 흐름)
const howItWorks = [
  { step: '01', title: '데이터 수집', desc: 'POS 매출·앱 구매내역에 날씨·유동인구·지역 행사, Vision AI 행동 데이터를 결합한 빅데이터 허브를 구축합니다.' },
  { step: '02', title: 'AI 수요예측', desc: '요일·날씨·행사 특성에 맞는 품목별 최적 발주량을 산출하고, 구매 이력 기반 개인화 엔진으로 맞춤 혜택을 설계합니다.' },
  { step: '03', title: '자동 실행', desc: '산출된 발주량을 물류에 자동 전송하고, 다이나믹 프라이싱과 타겟 푸시 알림을 실시간으로 실행합니다.' },
  { step: '04', title: '모니터링', desc: '점주는 매장에 나오지 않고도 모바일로 발주·재고·매출 현황을 실시간으로 확인하고 관리합니다.' },
];

// 플랫폼 모듈 — 앱 내비게이션과 동일한 직관적 명칭
const features = [
  { icon: '📦', title: '발주 관리', desc: 'AI 수요예측 기반 자동 발주 제안과 승인·송신 관리', tint: 'peach' },
  { icon: '🗄️', title: '재고 관리', desc: '실시간 재고 현황과 입출고·유통기한 임박 추적', tint: 'mint' },
  { icon: '💳', title: '매출 현황', desc: '일·주·월 매출 추이와 객단가·거래 건수 분석', tint: 'sky' },
  { icon: '💲', title: '가격 정책', desc: '시간대·재고 기반 동적 가격(다이나믹 프라이싱) 설정', tint: 'lavender' },
  { icon: '📈', title: '가격 변동 이력', desc: '가격 변동 이벤트와 적용 이력 모니터링', tint: 'rose' },
  { icon: '📊', title: '경영 리포트', desc: '핵심 지표(KPI) 대시보드와 운영 성과 리포트', tint: 'yellow' },
  { icon: '🛒', title: '셀프 계산대', desc: 'Vision AI 무인 셀프 체크아웃 흐름 시뮬레이션', tint: 'cream' },
  { icon: '🔗', title: '상품 매핑', desc: '점포별 상이한 상품 코드의 표준화·정합성 관리', tint: 'mint' },
];

// 이행 로드맵 (ISP 캔버스 · 이행 로드맵)
const roadmap = [
  { phase: '1단계', period: '1~3개월', title: '인프라 표준화 · 연동', desc: '기존 POS 솔루션사와 데이터 연동, 점포별 상품 코드 표준화, 코어 데이터 허브 아키텍처 설계' },
  { phase: '2단계', period: '4~8개월', title: '테스트베드 구축 · 모델 개발', desc: '직영점 대상 하드웨어(카메라·센서·ESL) 도입, AI 수요예측·자동발주 엔진 개발 및 실증 테스트' },
  { phase: '3단계', period: '9~12개월', title: '고도화 · 가맹점 전사 확산', desc: '현장 피드백 기반 모바일/UI 최적화, 지자체 보조금 연계로 초기 도입비 절감, 전국 가맹점 확산' },
];

// 히어로 데모용 발주 보드 — 실제 제품 UI 느낌의 목업
const board = [
  {
    name: '신규 제안',
    accent: 'var(--brand-pink)',
    items: [
      { t: '삼각김밥 (참치)', q: '제안 48개', tag: '수요 ↑', tint: 'rose' },
      { t: '바나나우유 240ml', q: '제안 24개', tag: '재고 부족', tint: 'peach' },
    ],
  },
  {
    name: '승인 대기',
    accent: 'var(--brand-yellow)',
    items: [
      { t: '도시락 (불고기)', q: '제안 30개', tag: '검토중', tint: 'yellow' },
      { t: '생수 2L', q: '제안 60개', tag: '정기', tint: 'sky' },
    ],
  },
  {
    name: '발주 확정',
    accent: 'var(--brand-green)',
    items: [
      { t: '아메리카노 캔', q: '확정 36개', tag: '완료', tint: 'mint' },
      { t: '컵라면 (매운맛)', q: '확정 40개', tag: '완료', tint: 'mint' },
    ],
  },
];

function goDashboard(): void {
  router.push({ name: 'orders' });
}
function goLogin(): void {
  router.push({ name: 'login' });
}
function goRegister(): void {
  router.push({ name: 'register' });
}
</script>

<template>
  <div class="home">
    <!-- 상단 프로모 배너 -->
    <div class="promo">
      <span>🚀 데이터와 AI로 만드는 차세대 소매점포 표준 — 로그인 없이 둘러보기 가능</span>
    </div>

    <!-- 상단 내비게이션 -->
    <header class="nav">
      <div class="nav-inner">
        <a class="brand" @click="router.push({ name: 'home' })">
          <span class="logo">🏪</span>
          <span class="brand-name">AI 점포 운영</span>
        </a>
        <nav class="nav-links">
          <a class="nav-link" href="#value">솔루션</a>
          <a class="nav-link" href="#capabilities">핵심 역량</a>
          <a class="nav-link" href="#stats">성과</a>
          <a class="nav-link" href="#roadmap">로드맵</a>
        </nav>
        <div class="actions">
          <template v-if="auth.isAuthenticated">
            <span class="hello">{{ auth.user?.displayName }}님</span>
            <button class="btn btn-primary" @click="goDashboard">대시보드</button>
          </template>
          <template v-else>
            <button class="btn btn-ghost" @click="goLogin">로그인</button>
            <button class="btn btn-primary" @click="goRegister">무료로 시작하기</button>
          </template>
        </div>
      </div>
    </header>

    <!-- 히어로 (네이비 밴드) -->
    <section class="hero">
      <!-- 장식용 스티키 노트 도트 -->
      <span class="dot dot-1"></span>
      <span class="dot dot-2"></span>
      <span class="dot dot-3"></span>
      <span class="dot dot-4"></span>
      <span class="dot dot-5"></span>
      <span class="dot dot-6"></span>

      <div class="hero-content">
        <h1 class="hero-title">AI 점포 운영 시스템</h1>
        <p class="hero-sub">
          고령화와 구인난 시대, 과거 판매·유동인구·날씨·행사 데이터를 AI로 분석해
          발주를 최적화하고 폐기를 줄입니다. 단순 판매 공간을 넘어, 자동화로 운영하는
          라이프스타일 플랫폼.
        </p>
        <div class="cta-row">
          <button class="btn btn-primary lg" @click="goDashboard">대시보드 들어가기</button>
          <button v-if="!auth.isAuthenticated" class="btn btn-on-dark-outline lg" @click="goRegister">
            무료로 시작하기
          </button>
        </div>
        <p class="hero-note">로그인 없이 둘러볼 수 있어요 · 운영 데이터는 로그인 후 이용 가능합니다</p>
      </div>

      <!-- 워크스페이스 목업 카드 -->
      <div class="mockup">
        <div class="mockup-bar">
          <span class="mb-dot r"></span>
          <span class="mb-dot y"></span>
          <span class="mb-dot g"></span>
          <span class="mockup-title">발주 보드 · p12.sumzip.com</span>
        </div>
        <div class="mockup-body">
          <div v-for="col in board" :key="col.name" class="board-col">
            <div class="col-head">
              <span class="col-accent" :style="{ background: col.accent }"></span>
              <span class="col-name">{{ col.name }}</span>
              <span class="col-count">{{ col.items.length }}</span>
            </div>
            <article v-for="it in col.items" :key="it.t" class="board-card">
              <p class="bc-title">{{ it.t }}</p>
              <div class="bc-meta">
                <span class="bc-qty">{{ it.q }}</span>
                <span class="bc-tag" :class="`tint-${it.tint}`">{{ it.tag }}</span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <!-- 가치 제안 -->
    <section id="value" class="value">
      <div class="section-head">
        <span class="eyebrow">도입 효과</span>
        <h2 class="value-title">점주에게는 수익을, 고객에게는 편의를</h2>
        <p class="section-sub">데이터 기반의 정교한 운영으로 가맹점 수익성을 극대화하고, 고객 경험을 혁신합니다.</p>
      </div>
      <div class="value-grid">
        <article v-for="v in valueProps" :key="v.audience" class="value-card" :class="`tint-${v.tint}`">
          <div class="value-top">
            <span class="value-icon">{{ v.icon }}</span>
            <span class="value-audience">{{ v.audience }}</span>
          </div>
          <h3>{{ v.title }}</h3>
          <p>{{ v.desc }}</p>
          <ul class="value-points">
            <li v-for="p in v.points" :key="p">✓ {{ p }}</li>
          </ul>
        </article>
      </div>
    </section>

    <!-- 핵심 역량 (TO-BE) -->
    <section id="capabilities" class="capabilities">
      <div class="section-head">
        <span class="eyebrow">핵심 역량</span>
        <h2>AI가 직접 발주하고, 가격을 정하고, 알립니다</h2>
        <p class="section-sub">사후 조치가 아닌 사전 예측 자동화. 매장 전체를 하나의 실시간 IoT 센서 네트워크로.</p>
      </div>
      <div class="cap-grid">
        <article v-for="c in capabilities" :key="c.title" class="cap-card" :class="`tint-${c.tint}`">
          <div class="cap-icon">{{ c.icon }}</div>
          <h3>{{ c.title }}</h3>
          <p>{{ c.desc }}</p>
        </article>
      </div>
    </section>

    <!-- 기능 섹션 -->
    <section id="features" class="features">
      <div class="section-head">
        <span class="eyebrow">플랫폼 모듈</span>
        <h2>점포 운영에 필요한 모든 것</h2>
        <p class="section-sub">흩어진 운영 업무를 하나의 워크스페이스로. 클릭 한 번으로 전환하세요.</p>
      </div>
      <div class="grid">
        <article
          v-for="f in features"
          :key="f.title"
          class="card"
          :class="`tint-${f.tint}`"
        >
          <div class="card-icon">{{ f.icon }}</div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.desc }}</p>
        </article>
      </div>
    </section>

    <!-- 작동 방식 -->
    <section id="how" class="how">
      <div class="section-head">
        <span class="eyebrow">작동 방식</span>
        <h2>수집부터 자동 실행까지, 끊김 없이</h2>
        <p class="section-sub">내부·외부·실시간 데이터를 결합해 예측하고, 점주 개입 없이 자동으로 실행합니다.</p>
      </div>
      <div class="steps">
        <article v-for="(s, i) in howItWorks" :key="s.step" class="step">
          <span class="step-num">{{ s.step }}</span>
          <h3>{{ s.title }}</h3>
          <p>{{ s.desc }}</p>
          <span v-if="i < howItWorks.length - 1" class="step-arrow">→</span>
        </article>
      </div>
    </section>

    <!-- 성과 스트립 (KPI) -->
    <section id="stats" class="stats-wrap">
      <div class="stat-row">
        <div class="stat-head">
          <span class="eyebrow on-dark">기대 효과 · 성공 지표</span>
          <h2>측정 가능한<br />운영 성과</h2>
          <p>폐기 손실 방어부터 매출 상승까지, 데이터로 증명하는 결과를 목표합니다.</p>
        </div>
        <div class="stat-grid">
          <div v-for="s in stats" :key="s.label" class="stat-cell">
            <span class="stat-value">{{ s.value }}</span>
            <span class="stat-label">{{ s.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 이행 로드맵 -->
    <section id="roadmap" class="roadmap">
      <div class="section-head">
        <span class="eyebrow">이행 로드맵</span>
        <h2>1년 안에 전국 가맹점으로</h2>
        <p class="section-sub">인프라 표준화에서 시작해 테스트베드 검증을 거쳐 전사 확산까지 단계적으로.</p>
      </div>
      <div class="road-grid">
        <article v-for="(r, i) in roadmap" :key="r.phase" class="road-card">
          <div class="road-head">
            <span class="road-phase">{{ r.phase }}</span>
            <span class="road-period">{{ r.period }}</span>
          </div>
          <h3>{{ r.title }}</h3>
          <p>{{ r.desc }}</p>
          <span class="road-line" :style="{ width: `${(i + 1) * 33}%` }"></span>
        </article>
      </div>
    </section>

    <!-- CTA 배너 -->
    <section id="cta" class="cta-wrap">
      <div class="cta-banner">
        <h2>지금 바로 점포 운영을 시작하세요</h2>
        <p>몇 분이면 충분합니다. 로그인 후 발주·재고·매출 데이터를 바로 확인해 보세요.</p>
        <div class="cta-row center">
          <button class="btn btn-primary lg" @click="goDashboard">대시보드 들어가기</button>
          <button v-if="!auth.isAuthenticated" class="btn btn-secondary lg" @click="goLogin">
            로그인
          </button>
        </div>
      </div>
    </section>

    <!-- 푸터 -->
    <footer class="foot">
      <div class="foot-inner">
        <div class="foot-brand">
          <div class="brand">
            <span class="logo">🏪</span>
            <span class="brand-name">AI 점포 운영</span>
          </div>
          <p class="foot-tag">데이터와 AI로 만드는 차세대 소매점포 표준</p>
        </div>
        <div class="foot-cols">
          <div class="foot-col">
            <h4>운영</h4>
            <a @click="goDashboard">발주 관리</a>
            <a @click="goDashboard">재고 관리</a>
            <a @click="goDashboard">매출 현황</a>
          </div>
          <div class="foot-col">
            <h4>가격 · 분석</h4>
            <a @click="goDashboard">가격 정책</a>
            <a @click="goDashboard">가격 변동 이력</a>
            <a @click="goDashboard">경영 리포트</a>
          </div>
          <div class="foot-col">
            <h4>계정</h4>
            <a @click="goLogin">로그인</a>
            <a @click="goRegister">회원가입</a>
          </div>
        </div>
      </div>
      <div class="foot-bottom">
        <span>© 2026 AI 점포 운영 시스템 · p12.sumzip.com</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ── Notion 디자인 토큰 ───────────────────────────── */
.home {
  --primary: #5645d4;
  --primary-pressed: #4534b3;
  --on-primary: #ffffff;
  --brand-navy: #0a1530;
  --brand-navy-deep: #070f24;
  --brand-pink: #ff64c8;
  --brand-purple: #7b3ff2;
  --brand-teal: #2a9d99;
  --brand-green: #1aae39;
  --brand-yellow: #f5d75e;
  --brand-orange: #dd5b00;

  --tint-peach: #ffe8d4;
  --tint-rose: #fde0ec;
  --tint-mint: #d9f3e1;
  --tint-lavender: #e6e0f5;
  --tint-sky: #dcecfa;
  --tint-yellow: #fef7d6;
  --tint-cream: #f8f5e8;

  --canvas: #ffffff;
  --surface: #f6f5f4;
  --surface-soft: #fafaf9;
  --hairline: #e5e3df;
  --hairline-strong: #c8c4be;

  --ink: #1a1a1a;
  --charcoal: #37352f;
  --slate: #5d5b54;
  --steel: #787671;
  --stone: #a4a097;
  --on-dark: #ffffff;
  --on-dark-muted: #a4a097;

  --shadow-card: rgba(15, 15, 15, 0.08) 0px 4px 12px 0px;
  --shadow-mockup: rgba(0, 0, 0, 0.35) 0px 24px 56px -8px;

  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: 'Inter', -apple-system, system-ui, 'Apple SD Gothic Neo', 'Segoe UI', sans-serif;
  color: var(--ink);
  background: var(--canvas);
  letter-spacing: -0.01em;
}

/* ── 버튼 ──────────────────────────────────────── */
.btn {
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  white-space: nowrap;
}
.btn.lg { padding: 13px 24px; font-size: 16px; border-radius: 8px; }
.btn-primary { background: var(--primary); color: var(--on-primary); }
.btn-primary:hover { background: var(--primary-pressed); }
.btn-ghost { background: transparent; color: var(--ink); }
.btn-ghost:hover { background: var(--surface); }
.btn-secondary {
  background: transparent;
  color: var(--ink);
  border-color: var(--hairline-strong);
}
.btn-secondary:hover { background: var(--surface); }
.btn-on-dark-outline {
  background: transparent;
  color: var(--on-dark);
  border-color: rgba(255, 255, 255, 0.4);
}
.btn-on-dark-outline:hover { background: rgba(255, 255, 255, 0.1); }

/* ── 프로모 배너 ───────────────────────────────── */
.promo {
  background: var(--surface);
  color: var(--charcoal);
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  padding: 9px 16px;
  border-bottom: 1px solid var(--hairline);
}

/* ── 내비게이션 ───────────────────────────────── */
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--hairline);
}
.nav-inner {
  max-width: 1280px;
  margin: 0 auto;
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  color: var(--ink);
}
.logo {
  font-size: 18px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  background: var(--surface);
  border-radius: 8px;
}
.nav-links { display: flex; gap: 4px; margin-left: auto; }
.nav-link {
  font-size: 14px;
  font-weight: 500;
  color: var(--slate);
  padding: 8px 12px;
  border-radius: 6px;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;
}
.nav-link:hover { background: var(--surface); color: var(--ink); }
.actions { display: flex; align-items: center; gap: 8px; }
.hello { font-size: 14px; color: var(--slate); margin-right: 4px; }

/* ── 히어로 ───────────────────────────────────── */
.hero {
  position: relative;
  background: radial-gradient(120% 120% at 50% 0%, #14224a 0%, var(--brand-navy) 55%, var(--brand-navy-deep) 100%);
  color: var(--on-dark);
  padding: 96px 24px 0;
  overflow: hidden;
}
.hero-content {
  position: relative;
  z-index: 2;
  max-width: 760px;
  margin: 0 auto;
  text-align: center;
}
.hero-badge {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #d6b6f6;
  background: rgba(123, 63, 242, 0.2);
  border: 1px solid rgba(214, 182, 246, 0.3);
  padding: 5px 14px;
  border-radius: 9999px;
  margin-bottom: 24px;
}
.hero-title {
  font-size: 64px;
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.03em;
  margin: 0 0 20px;
}
.hero-sub {
  font-size: 18px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.78);
  max-width: 600px;
  margin: 0 auto 32px;
}
.cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.cta-row.center { justify-content: center; }
.hero-note {
  margin: 20px 0 0;
  font-size: 13px;
  color: var(--on-dark-muted);
}

/* 장식 도트 */
.dot {
  position: absolute;
  border-radius: 9999px;
  z-index: 1;
  filter: blur(0.3px);
  opacity: 0.9;
}
.dot-1 { width: 14px; height: 14px; background: var(--brand-pink); top: 90px; left: 12%; }
.dot-2 { width: 10px; height: 10px; background: var(--brand-yellow); top: 150px; left: 22%; }
.dot-3 { width: 16px; height: 16px; background: var(--brand-teal); top: 70px; right: 14%; }
.dot-4 { width: 11px; height: 11px; background: var(--brand-green); top: 200px; right: 9%; }
.dot-5 { width: 9px; height: 9px; background: var(--brand-purple); top: 120px; right: 26%; }
.dot-6 { width: 13px; height: 13px; background: var(--brand-orange); top: 240px; left: 8%; }

/* ── 워크스페이스 목업 ──────────────────────────── */
.mockup {
  position: relative;
  z-index: 2;
  max-width: 1040px;
  margin: 64px auto 0;
  transform: translateY(40px);
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: 12px;
  box-shadow: var(--shadow-mockup);
  overflow: hidden;
}
.mockup-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--hairline);
}
.mb-dot { width: 11px; height: 11px; border-radius: 9999px; }
.mb-dot.r { background: #ff5f57; }
.mb-dot.y { background: #febc2e; }
.mb-dot.g { background: #28c840; }
.mockup-title {
  margin-left: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--steel);
}
.mockup-body {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 20px;
  background: var(--surface-soft);
  text-align: left;
}
.board-col { display: flex; flex-direction: column; gap: 10px; }
.col-head { display: flex; align-items: center; gap: 8px; padding: 0 4px 2px; }
.col-accent { width: 10px; height: 10px; border-radius: 9999px; }
.col-name { font-size: 13px; font-weight: 600; color: var(--charcoal); }
.col-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--steel);
  background: var(--surface);
  border-radius: 9999px;
  padding: 1px 8px;
  margin-left: auto;
}
.board-card {
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: 8px;
  padding: 12px;
  box-shadow: var(--shadow-card);
}
.bc-title { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--ink); }
.bc-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.bc-qty { font-size: 12px; color: var(--steel); }
.bc-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  color: var(--charcoal);
}

/* 틴트 유틸 (태그 + 카드) */
.tint-peach { background: var(--tint-peach); }
.tint-rose { background: var(--tint-rose); }
.tint-mint { background: var(--tint-mint); }
.tint-lavender { background: var(--tint-lavender); }
.tint-sky { background: var(--tint-sky); }
.tint-yellow { background: var(--tint-yellow); }
.tint-cream { background: var(--tint-cream); }

/* ── 가치 제안 ─────────────────────────────────── */
.value {
  max-width: 1280px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 144px 24px 0; /* 히어로 목업 오버행(translateY)을 비우는 상단 여백 */
}
.value-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.value-card {
  border-radius: 16px;
  padding: 36px;
  border: 1px solid rgba(0, 0, 0, 0.05);
}
.value-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.value-icon {
  font-size: 22px;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 10px;
}
.value-audience {
  font-size: 13px;
  font-weight: 700;
  color: var(--charcoal);
  background: rgba(255, 255, 255, 0.7);
  padding: 4px 12px;
  border-radius: 9999px;
}
.value-card h3 { margin: 0 0 10px; font-size: 22px; font-weight: 600; color: var(--ink); }
.value-card > p { margin: 0 0 18px; font-size: 15px; line-height: 1.6; color: var(--charcoal); opacity: 0.9; }
.value-points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.value-points li { font-size: 14px; font-weight: 600; color: var(--charcoal); }

/* ── 핵심 역량 ─────────────────────────────────── */
.capabilities {
  max-width: 1280px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 96px 24px 0;
}
.cap-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.cap-card {
  border-radius: 16px;
  padding: 32px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.cap-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-card); }
.cap-icon {
  font-size: 26px;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  margin-bottom: 18px;
}
.cap-card h3 { margin: 0 0 10px; font-size: 20px; font-weight: 600; color: var(--ink); }
.cap-card p { margin: 0; font-size: 15px; line-height: 1.6; color: var(--charcoal); opacity: 0.9; }

/* ── 기능 섹션 ─────────────────────────────────── */
.features {
  max-width: 1280px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 96px 24px 0;
}
.section-head { text-align: center; max-width: 640px; margin: 0 auto 56px; }
.eyebrow {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 12px;
}
.section-head h2 {
  font-size: 40px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.025em;
  margin: 0 0 14px;
  color: var(--ink);
}
.section-sub { font-size: 18px; line-height: 1.55; color: var(--slate); margin: 0; }
/* 도입 효과 제목은 한 줄로 (중앙 정렬이라 640px 컨테이너보다 길어도 OK) */
.value .section-head { max-width: none; }
.value-title { white-space: nowrap; }
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.card {
  border-radius: 12px;
  padding: 28px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.card:hover { transform: translateY(-3px); box-shadow: var(--shadow-card); }
.card-icon {
  font-size: 24px;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 10px;
  margin-bottom: 16px;
}
.card h3 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: var(--ink); }
.card p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--charcoal); opacity: 0.85; }

/* ── 작동 방식 ─────────────────────────────────── */
.how {
  max-width: 1280px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 96px 24px;
}
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.step {
  position: relative;
  background: var(--surface-soft);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  padding: 28px 24px;
}
.step-num {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 14px;
}
.step h3 { margin: 0 0 8px; font-size: 17px; font-weight: 600; color: var(--ink); }
.step p { margin: 0; font-size: 14px; line-height: 1.55; color: var(--slate); }
.step-arrow {
  position: absolute;
  right: -12px;
  top: 40px;
  font-size: 20px;
  color: var(--stone);
  z-index: 1;
}

/* ── 성과 스트립 ───────────────────────────────── */
.eyebrow.on-dark { color: #d6b6f6; }
.stats-wrap { padding: 0 24px 96px; }
.stat-row {
  max-width: 1280px;
  margin: 0 auto;
  background: var(--brand-navy);
  color: var(--on-dark);
  border-radius: 20px;
  padding: 64px 56px;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 48px;
  align-items: center;
}
.stat-head h2 { font-size: 36px; font-weight: 600; line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 14px; }
.stat-head p { font-size: 16px; line-height: 1.55; color: rgba(255, 255, 255, 0.72); margin: 0; }
.stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
.stat-cell {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 24px;
}
.stat-value { display: block; font-size: 32px; font-weight: 700; letter-spacing: -0.02em; color: #d6b6f6; }
.stat-label { display: block; margin-top: 6px; font-size: 14px; color: rgba(255, 255, 255, 0.75); }

/* ── 이행 로드맵 ───────────────────────────────── */
.roadmap {
  max-width: 1280px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 0 24px 96px;
}
.road-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.road-card {
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  padding: 28px;
  position: relative;
  overflow: hidden;
}
.road-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.road-phase {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
  background: var(--tint-lavender);
  padding: 4px 12px;
  border-radius: 9999px;
}
.road-period { font-size: 13px; font-weight: 600; color: var(--steel); }
.road-card h3 { margin: 0 0 10px; font-size: 18px; font-weight: 600; color: var(--ink); }
.road-card p { margin: 0 0 18px; font-size: 14px; line-height: 1.55; color: var(--slate); }
.road-line {
  display: block;
  height: 4px;
  border-radius: 9999px;
  background: linear-gradient(90deg, var(--primary), var(--brand-purple));
}

/* ── CTA 배너 ──────────────────────────────────── */
.cta-wrap { padding: 0 24px 96px; }
.cta-banner {
  max-width: 1280px;
  margin: 0 auto;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: 20px;
  padding: 72px 32px;
  text-align: center;
}
.cta-banner h2 { font-size: 36px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 12px; color: var(--ink); }
.cta-banner p { font-size: 18px; line-height: 1.55; color: var(--slate); margin: 0 0 28px; }

/* ── 푸터 ──────────────────────────────────────── */
.foot { margin-top: auto; border-top: 1px solid var(--hairline); background: var(--canvas); }
.foot-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 64px 24px 40px;
  display: grid;
  grid-template-columns: 1.4fr 2fr;
  gap: 48px;
}
.foot-tag { margin: 14px 0 0; font-size: 14px; color: var(--steel); max-width: 280px; line-height: 1.5; }
.foot-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
.foot-col h4 { margin: 0 0 14px; font-size: 13px; font-weight: 600; color: var(--charcoal); }
.foot-col a {
  display: block;
  font-size: 14px;
  color: var(--steel);
  padding: 4px 0;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.15s ease;
}
.foot-col a:hover { color: var(--ink); }
.foot-bottom {
  border-top: 1px solid var(--hairline);
  padding: 20px 24px;
  text-align: center;
  font-size: 13px;
  color: var(--stone);
}

/* ── 반응형 ────────────────────────────────────── */
@media (max-width: 1024px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
  .steps { grid-template-columns: repeat(2, 1fr); }
  .road-grid { grid-template-columns: 1fr; }
  .stat-row { grid-template-columns: 1fr; gap: 32px; padding: 48px 36px; }
  .step-arrow { display: none; }
  .nav-links { display: none; }
}
@media (max-width: 768px) {
  .hero { padding: 64px 20px 0; }
  .hero-title { font-size: 44px; }
  .hero-sub { font-size: 16px; }
  .mockup-body { grid-template-columns: 1fr; }
  .board-col:nth-child(n + 2) { display: none; }
  .section-head h2 { font-size: 32px; }
  .value-grid, .cap-grid { grid-template-columns: 1fr; }
  .value { padding-top: 120px; }
  .foot-inner { grid-template-columns: 1fr; gap: 32px; }
}
@media (max-width: 560px) {
  .hero-title { font-size: 34px; }
  .grid { grid-template-columns: 1fr; }
  .steps { grid-template-columns: 1fr; }
  .foot-cols { grid-template-columns: repeat(2, 1fr); }
  .stat-grid { grid-template-columns: 1fr; }
  .cta-banner { padding: 48px 20px; }
  /* 좁은 화면에선 한 줄 강제 해제(넘침 방지) */
  .value-title { white-space: normal; font-size: 26px; }
}
</style>
