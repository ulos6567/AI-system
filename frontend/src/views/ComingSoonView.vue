<script setup lang="ts">
/** 아직 페이지가 준비되지 않은 메뉴용 안내 화면 — 라우트 meta.title 로 제목 표시 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => (route.meta?.title as string) || '준비 중');
</script>

<template>
  <div class="coming">
    <header class="page-header">
      <h2>{{ title }}</h2>
    </header>
    <div class="card">
      <div class="cs-icon">🚧</div>
      <h3>준비 중입니다</h3>
      <p>이 기능은 현재 개발 중이에요. 곧 만나보실 수 있습니다.</p>
    </div>
  </div>
</template>

<style scoped>
.coming { display: flex; flex-direction: column; gap: 1rem; }
.page-header h2 { margin: 0; }
.card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  padding: 3rem 1.5rem;
  text-align: center;
  color: #3f5069;
}
.cs-icon { font-size: 2.4rem; margin-bottom: 0.75rem; }
.card h3 { margin: 0 0 0.5rem; font-size: 1.1rem; color: #0d253d; }
.card p { margin: 0; font-size: 0.9rem; color: #64748d; }
</style>
