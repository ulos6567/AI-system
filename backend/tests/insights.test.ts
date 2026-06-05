/**
 * 002 (T016) — 처방형 인사이트 라우터 스모크 테스트
 *   DB 없이 검증 가능한 분기(인증 게이팅·자동 실행 부재 정책)만 확인.
 *   완전한 proposed→approve→executed e2e 는 docker compose mariadb 환경에서 수행.
 */
import request from 'supertest';
import { createApp } from '../src/index';

const app = createApp();

describe('insights routes smoke', () => {
  it('read endpoints require auth (401 without session)', async () => {
    const paths = [
      '/api/stores/1/insights/signals',
      '/api/stores/1/insights/actions',
      '/api/stores/1/insights/actions/1/outcome',
    ];
    for (const p of paths) {
      const res = await request(app).get(p);
      expect([401, 403]).toContain(res.status);
    }
  });

  it('write endpoints (approve/reject/generate) are not reachable without auth', async () => {
    // 자동 실행 경로가 없으며, 실행은 인증·운영자 권한 게이트 뒤에서만 가능(FR-003).
    const writes = [
      '/api/stores/1/insights/generate',
      '/api/stores/1/insights/actions/1/approve',
      '/api/stores/1/insights/actions/1/reject',
    ];
    for (const p of writes) {
      const res = await request(app).post(p).send({});
      expect([401, 403]).toContain(res.status);
    }
  });
});
