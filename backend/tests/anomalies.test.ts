/**
 * 002 (T028) — 이상 징후 라우트 스모크 테스트 + SLA 단위 검증.
 *   DB 없이 검증 가능한 인증 게이팅과, 시뮬레이션 어댑터의 생성 계약만 확인한다.
 *   완전한 알림 SLA(≤30초) e2e 는 docker compose mariadb 환경에서 수행한다.
 */
import request from 'supertest';
import { createApp } from '../src/index';
import { generateAnomaly } from '../src/adapters/anomaly/sim';

const app = createApp();

describe('anomalies routes smoke', () => {
  it('read endpoints require auth (401/403 without session)', async () => {
    const paths = [
      '/api/stores/1/anomalies',
      '/api/stores/1/anomalies/sla',
    ];
    for (const p of paths) {
      const res = await request(app).get(p);
      expect([401, 403]).toContain(res.status);
    }
  });

  it('write endpoints (simulate/feedback) require auth + admin', async () => {
    const writes = [
      '/api/stores/1/anomalies/simulate',
      '/api/stores/1/anomalies/1/feedback',
    ];
    for (const p of writes) {
      const res = await request(app).post(p).send({});
      expect([401, 403]).toContain(res.status);
    }
  });
});

describe('anomaly simulation adapter', () => {
  it('generates well-formed anomaly signals with notify-able severity', () => {
    for (let i = 0; i < 20; i++) {
      const ev = generateAnomaly(7);
      expect(ev.storeId).toBe(7);
      expect(['unpaid_exit', 'disturbance', 'collapse', 'intrusion']).toContain(ev.anomalyType);
      expect(ev.severity).toBeGreaterThanOrEqual(1);
      expect(ev.severity).toBeLessThanOrEqual(5);
      expect(ev.detectedAt).toBeInstanceOf(Date);
    }
  });
});
