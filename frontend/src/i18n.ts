/**
 * T078 — i18n 골격 (vue-i18n)
 *   1차 한국어만 사용. 영문은 en.json 으로 후속 단계에 활성화.
 *   현재 컴포넌트는 한국어 하드코딩 — 향후 점진 치환.
 */
import { createI18n } from 'vue-i18n';
import ko from './locales/ko.json';
import en from './locales/en.json';

export const i18n = createI18n({
  legacy: false,
  locale: (navigator.language?.startsWith('en') ? 'en' : 'ko'),
  fallbackLocale: 'ko',
  messages: { ko, en },
});
