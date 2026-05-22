/**
 * T020 — /api/auth 통합 테스트 (supertest)
 *   DB 없는 환경에서도 부분 검증 가능하도록 invalid payload 경로 위주.
 *   완전한 e2e는 docker compose mariadb + migrate + seed 후 실행.
 */
import request from 'supertest';
import { createApp } from '../src/index';

describe('POST /api/auth/login', () => {
  const app = createApp();

  it('rejects invalid payload', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_payload');
  });

  it('rejects unknown email (requires DB)', async () => {
    if (!process.env.DB_USER) {
      console.warn('skipping DB-dependent assertion (no DB_USER)');
      return;
    }
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'demo1234' });
    expect([401, 500]).toContain(res.status);
  });
});

describe('GET /api/healthz', () => {
  const app = createApp();
  it('returns ok', async () => {
    const res = await request(app).get('/api/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
