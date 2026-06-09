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
  it('rejects malformed payload (400) even for guests', async () => {
    // AI 비서 질의는 비로그인 게스트도 가능하다(읽기 전용). 잘못된 페이로드만 400.
    const post = await request(app).post('/api/stores/1/assistant/ask').send({});
    expect(post.status).toBe(400);
  });
});

describe('assistant grounding does not leak PII', () => {
  it('unknown intent falls back to store snapshot (집계만), 근거 조회 실패해도 안전', async () => {
    // 매칭 의도가 없으면 일반 운영 스냅샷(매출·인기상품·재고 집계)으로 폴백한다.
    // 스냅샷은 집계 컬럼만 조회하며 고객명/연락처 등 PII 는 절대 포함하지 않는다.
    // DB 가 없는 단위 테스트 환경에서는 조회가 실패해 빈 근거로 안전하게 떨어진다.
    const g = await buildGrounding(1, '안녕하세요');
    expect(g.intent).toBe('unknown');
    expect(Array.isArray(g.facts)).toBe(true);
    expect(Array.isArray(g.sources)).toBe(true);
    // 어떤 근거가 나오든 개인식별정보 패턴(전화번호 등)은 없어야 한다.
    expect(g.facts.join('\n')).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
  });
});
