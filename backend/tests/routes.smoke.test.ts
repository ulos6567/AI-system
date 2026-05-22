/**
 * T073 — 라우터 스모크 테스트
 *   DB 없이도 통과해야 하는 경로만 검증 (404·400·401 분기).
 *   완전한 e2e 는 docker compose mariadb 환경에서 별도 수행.
 */
import request from 'supertest';
import { createApp } from '../src/index';

const app = createApp();

describe('routes smoke', () => {
  it('GET /api/healthz returns 200 with online/buffered fields', async () => {
    const res = await request(app).get('/api/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('online');
    expect(res.body).toHaveProperty('buffered');
  });

  it('GET /api/readyz returns 200', async () => {
    const res = await request(app).get('/api/readyz');
    expect(res.status).toBe(200);
  });

  it('protected routes return 401 without session', async () => {
    const protectedPaths = [
      '/api/stores/1/orders',
      '/api/stores/1/inventory',
      '/api/stores/1/forecasts',
      '/api/stores/1/events',
      '/api/stores/1/pricing-events',
      '/api/stores/1/reports/daily',
      '/api/stores/1/vision/status',
      '/api/stores/1/analytics/zones',
      '/api/stores/1/product-mappings',
      '/api/pii/users/1/consent',
      '/api/pricing/rules',
    ];
    for (const p of protectedPaths) {
      const res = await request(app).get(p);
      expect([401, 403]).toContain(res.status);
    }
  });

  it('POST /api/auth/login with invalid payload returns 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'no' });
    expect(res.status).toBe(400);
  });

  it('GET /api/docs.json returns OpenAPI doc in dev', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('openapi');
  });
});
