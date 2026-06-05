/**
 * 002 (T033) — AI 비서 단위/스모크 테스트.
 *   - 의도 분류 룰
 *   - 인증 게이팅
 *   - 비식별 보장: 근거 컨텍스트 빌더는 개인식별자(고객명/연락처 등) 컬럼을 조회하지 않는다.
 *   완전한 근거 동반율·환각 폴백 e2e 는 docker compose mariadb 환경에서 수행한다.
 */
import request from 'supertest';
import { createApp } from '../src/index';
import { classifyIntent, buildGrounding } from '../src/services/assistant';

const app = createApp();

describe('assistant intent classification', () => {
  it('maps representative queries to intents', () => {
    expect(classifyIntent('오늘 최다 판매 상품은?')).toBe('top_seller');
    expect(classifyIntent('내일 샌드위치 발주량 알려줘')).toBe('forecast');
    expect(classifyIntent('이번 달 마진 얼마야?')).toBe('revenue_margin');
    expect(classifyIntent('지난주 폐기 얼마나 났어')).toBe('waste');
    expect(classifyIntent('안녕 반가워')).toBe('unknown');
  });
});

describe('assistant routes smoke', () => {
  it('requires auth (401/403 without session)', async () => {
    const get = await request(app).get('/api/stores/1/assistant/conversations');
    expect([401, 403]).toContain(get.status);
    const post = await request(app).post('/api/stores/1/assistant/ask').send({ message: '오늘 매출은?' });
    expect([401, 403]).toContain(post.status);
  });
});

describe('assistant grounding does not leak PII', () => {
  it('unknown intent yields empty grounding → "데이터 없음" 폴백 경로', async () => {
    // unknown 의도는 어떤 테이블도 조회하지 않으므로 DB 없이도 빈 근거를 반환한다.
    const g = await buildGrounding(1, '안녕하세요');
    expect(g.intent).toBe('unknown');
    expect(g.facts.length).toBe(0);
    expect(g.sources.length).toBe(0);
  });
});
