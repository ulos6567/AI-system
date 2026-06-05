/**
 * 002 (T038) — 행동 분석 비식별 보장 테스트.
 *   - 인증 게이팅
 *   - 시뮬레이션 집계 결과에 개인식별자(이름/연락처/세션ID 등)가 포함되지 않음(SC-013).
 *   완전한 히트맵 e2e 는 docker compose mariadb 환경에서 수행한다.
 */
import request from 'supertest';
import { createApp } from '../src/index';
import { simulateZoneInsights } from '../src/adapters/vision/sim';

const app = createApp();

describe('analytics routes smoke', () => {
  it('requires auth (401/403 without session)', async () => {
    const paths = [
      '/api/stores/1/analytics/heatmap',
      '/api/stores/1/analytics/insights',
      '/api/stores/1/analytics/suggestions',
    ];
    for (const p of paths) {
      const res = await request(app).get(p);
      expect([401, 403]).toContain(res.status);
    }
  });
});

describe('behavior simulation is de-identified', () => {
  it('zone insights contain only aggregate fields, no PII', () => {
    const drafts = simulateZoneInsights(1);
    expect(drafts.length).toBeGreaterThan(0);
    const allowed = new Set([
      'zoneCode', 'zoneLabel', 'dwellWeight', 'passCount', 'pickupCount', 'putbackCount', 'demoSegment',
    ]);
    const forbidden = /name|phone|email|customer|session|ssn|birth|id_card/i;
    for (const d of drafts) {
      for (const key of Object.keys(d)) expect(allowed.has(key)).toBe(true);
      const json = JSON.stringify(d);
      expect(forbidden.test(json)).toBe(false);
      // 세그먼트는 분포(합계 100%)만
      const ageSum = Object.values(d.demoSegment.ageBands).reduce((s, v) => s + (v as number), 0);
      expect(ageSum).toBeGreaterThanOrEqual(95);
      expect(ageSum).toBeLessThanOrEqual(105);
    }
  });
});
