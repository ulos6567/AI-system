<script setup lang="ts">
/**
 * 002 (T023) — 상품 이미지 컴포넌트 (FR-009, SC-009)
 *   - 실제 이미지(url) 우선 표시.
 *   - url 이 없거나 로드 실패하면 카테고리 기반 합성 SVG 로 대체 → 빈 이미지 0건.
 */
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    url?: string | null;
    category?: string | null;
    name?: string | null;
    size?: number | string;
    rounded?: boolean;
  }>(),
  { url: null, category: null, name: null, size: 56, rounded: true },
);

const CATEGORY_VISUAL: Record<string, { emoji: string; color: string }> = {
  beverage: { emoji: '🥤', color: '#38bdf8' },
  snack: { emoji: '🍪', color: '#f59e0b' },
  lunchbox: { emoji: '🍱', color: '#ef4444' },
  ricesnack: { emoji: '🍙', color: '#10b981' },
  instant: { emoji: '🍜', color: '#f97316' },
  frozen: { emoji: '🧊', color: '#6366f1' },
  default: { emoji: '🛒', color: '#64748b' },
};

const visual = computed(() => CATEGORY_VISUAL[props.category ?? 'default'] ?? CATEGORY_VISUAL.default);
const failed = ref(false);
watch(() => props.url, () => { failed.value = false; });

// 실제 이미지를 쓸 수 있는지 — url 이 있고 아직 실패하지 않은 경우
const useReal = computed(() => !!props.url && !failed.value);
const dim = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size));

function onError(): void {
  failed.value = true;
}
</script>

<template>
  <div class="product-img" :class="{ rounded }" :style="{ width: dim, height: dim }">
    <img v-if="useReal" :src="url!" :alt="name ?? '상품 이미지'" loading="lazy" @error="onError" />
    <div v-else class="fallback" :style="{ background: visual.color + '22', color: visual.color }">
      <span class="emoji">{{ visual.emoji }}</span>
    </div>
  </div>
</template>

<style scoped>
.product-img {
  display: inline-grid;
  place-items: center;
  overflow: hidden;
  background: #f1f5f9;
  flex: 0 0 auto;
}
.product-img.rounded { border-radius: 8px; }
.product-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fallback { width: 100%; height: 100%; display: grid; place-items: center; }
.fallback .emoji { font-size: 1.6em; line-height: 1; }
</style>
