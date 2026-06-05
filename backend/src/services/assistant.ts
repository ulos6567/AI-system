/**
 * 002 (T031) — AI 경영비서 서비스 (RAG, FR-019~021, SC-010)
 *
 *   파이프라인: 의도 분류 → 점포 데이터 조회(비식별 집계) → 근거 컨텍스트 합성 →
 *               LLM 호출 → 근거(sources) 동반 응답. 근거가 없으면 "데이터 없음" 폴백.
 *
 *   개인식별정보(고객명·연락처 등)는 컨텍스트에 절대 포함하지 않는다(SC-013).
 *   컨텍스트는 매출/판매량/예측/폐기 등 집계값만 사용한다.
 */
import { getPool } from '../db/pool';
import { audit } from '../lib/audit';
import { getLlmAdapter } from '../adapters/factory';

export type Intent = 'top_seller' | 'forecast' | 'revenue_margin' | 'waste' | 'unknown';

export interface GroundingSource {
  type: string;
  period?: string;
  detail?: string;
}

export interface Grounding {
  intent: Intent;
  facts: string[];
  sources: GroundingSource[];
}

export interface AssistantAnswer {
  conversationId: number;
  messageId: number;
  content: string;
  sources: GroundingSource[];
  hadGrounding: boolean;
  model: string;
}

// --- 의도 분류 (간단 키워드 룰) --------------------------------------------

export function classifyIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(최다|많이|베스트|잘\s*팔|top|인기)/.test(m)) return 'top_seller';
  if (/(발주|예측|내일|얼마나.*시켜|주문량|forecast)/.test(m)) return 'forecast';
  if (/(마진|매출|수익|이익|이번\s*달|월\s*매출|revenue|margin)/.test(m)) return 'revenue_margin';
  if (/(폐기|버린|손실|waste)/.test(m)) return 'waste';
  return 'unknown';
}

// --- 근거 데이터 조회 (비식별 집계만) --------------------------------------

export async function buildGrounding(storeId: number, message: string): Promise<Grounding> {
  const intent = classifyIntent(message);
  const pool = getPool();
  const facts: string[] = [];
  const sources: GroundingSource[] = [];

  if (intent === 'top_seller') {
    const [rows] = await pool.query<any[]>(
      `SELECT pm.name AS name, SUM(ti.quantity) AS units
         FROM \`transaction\` t
         JOIN transaction_item ti ON ti.transaction_id = t.id
         JOIN product_master pm ON pm.id = ti.product_master_id
        WHERE t.store_id = ? AND DATE(t.occurred_at) = CURRENT_DATE
        GROUP BY ti.product_master_id, pm.name
        ORDER BY units DESC LIMIT 5`,
      [storeId],
    );
    if (rows.length) {
      facts.push('오늘 판매 상위 상품:');
      rows.forEach((r, i) => facts.push(`  ${i + 1}. ${r.name} — ${Number(r.units)}개`));
      sources.push({ type: 'transaction', period: 'today', detail: '당일 품목별 판매량' });
    }
  } else if (intent === 'forecast') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [rows] = await pool.query<any[]>(
      `SELECT pm.name AS name, df.predicted_quantity AS qty, df.confidence AS conf
         FROM demand_forecast df
         JOIN product_master pm ON pm.id = df.product_master_id
        WHERE df.store_id = ? AND df.target_date = DATE(?)
        ORDER BY df.predicted_quantity DESC LIMIT 8`,
      [storeId, tomorrow],
    );
    // 메시지에 특정 상품명이 있으면 우선 필터
    const matched = rows.filter((r) => message.includes(String(r.name).slice(0, 2)));
    const use = matched.length ? matched : rows;
    if (use.length) {
      facts.push(`내일(${tomorrow.toISOString().slice(0, 10)}) 수요예측:`);
      use.slice(0, 6).forEach((r) =>
        facts.push(`  • ${r.name} — 예측 ${Number(r.qty)}개 (신뢰도 ${Math.round(Number(r.conf) * 100)}%)`),
      );
      sources.push({ type: 'demand_forecast', period: 'tomorrow', detail: '품목별 예측 수량' });
    }
  } else if (intent === 'revenue_margin') {
    const [rows] = await pool.query<any[]>(
      `SELECT COALESCE(SUM(t.total_amount), 0) AS revenue, COUNT(*) AS txCount
         FROM \`transaction\` t
        WHERE t.store_id = ?
          AND YEAR(t.occurred_at) = YEAR(CURRENT_DATE)
          AND MONTH(t.occurred_at) = MONTH(CURRENT_DATE)`,
      [storeId],
    );
    const revenue = Number(rows[0]?.revenue ?? 0);
    if (revenue > 0) {
      const estMargin = Math.round(revenue * 0.28); // 편의점 평균 마진율 가정(28%)
      facts.push(`이번 달 누적 매출: ${revenue.toLocaleString('ko-KR')}원`);
      facts.push(`거래 건수: ${Number(rows[0].txCount).toLocaleString('ko-KR')}건`);
      facts.push(`추정 마진(평균 마진율 28% 가정): 약 ${estMargin.toLocaleString('ko-KR')}원`);
      sources.push({ type: 'transaction', period: 'this_month', detail: '당월 매출 집계' });
    }
  } else if (intent === 'waste') {
    const [rows] = await pool.query<any[]>(
      `SELECT COALESCE(-SUM(ih.delta), 0) AS units
         FROM inventory_history ih
        WHERE ih.store_id = ? AND ih.reason = 'discard'
          AND ih.occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [storeId],
    );
    const units = Number(rows[0]?.units ?? 0);
    facts.push(`최근 7일 폐기 수량: ${units}개`);
    sources.push({ type: 'inventory_history', period: 'last_7_days', detail: '폐기 집계' });
  }

  return { intent, facts, sources };
}

// --- 대화·메시지 영속 -------------------------------------------------------

export async function ensureConversation(storeId: number, userId: number, conversationId?: number): Promise<number> {
  const pool = getPool();
  if (conversationId) {
    const [rows] = await pool.query<any[]>(
      `SELECT id FROM assistant_conversation WHERE id = ? AND store_id = ?`,
      [conversationId, storeId],
    );
    if (rows.length) return conversationId;
  }
  const [res]: any = await pool.query(
    `INSERT INTO assistant_conversation (store_id, user_id, started_at) VALUES (?, ?, NOW())`,
    [storeId, userId],
  );
  return res.insertId as number;
}

async function insertMessage(
  conversationId: number,
  role: 'user' | 'assistant',
  content: string,
  opts: { sources?: GroundingSource[]; hadGrounding?: boolean } = {},
): Promise<number> {
  const pool = getPool();
  const [res]: any = await pool.query(
    `INSERT INTO assistant_message (conversation_id, role, content, sources_json, had_grounding, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [
      conversationId,
      role,
      content,
      opts.sources && opts.sources.length ? JSON.stringify(opts.sources) : null,
      opts.hadGrounding ? 1 : 0,
    ],
  );
  return res.insertId as number;
}

/** 질의 처리: 근거 조회 → LLM(or 폴백) → 응답 저장 + 감사(assistant_query). */
export async function ask(storeId: number, userId: number, message: string, conversationId?: number): Promise<AssistantAnswer> {
  const convId = await ensureConversation(storeId, userId, conversationId);
  await insertMessage(convId, 'user', message);

  const grounding = await buildGrounding(storeId, message);
  const hadGrounding = grounding.facts.length > 0;

  let content: string;
  let model = 'fallback';
  if (!hadGrounding) {
    content = '관련 운영 데이터를 찾지 못했어요. 데이터 없음으로 안내드립니다. 질문을 더 구체적으로 해주시거나 다른 지표를 물어봐 주세요.';
  } else {
    const llm = getLlmAdapter();
    const result = await llm.complete({
      messages: [{ role: 'user', content: message }],
      groundingContext: grounding.facts.join('\n'),
      maxTokens: 512,
    });
    content = result.content;
    model = result.model;
  }

  const messageId = await insertMessage(convId, 'assistant', content, {
    sources: grounding.sources,
    hadGrounding,
  });

  await audit({
    storeId,
    userId,
    eventType: 'assistant_query',
    message: `AI 비서 질의 (의도=${grounding.intent}, 근거=${hadGrounding ? 'Y' : 'N'})`,
    metadata: { conversationId: convId, intent: grounding.intent, hadGrounding, sources: grounding.sources },
  });

  return { conversationId: convId, messageId, content, sources: grounding.sources, hadGrounding, model };
}

export async function listMessages(storeId: number, conversationId: number): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT am.id, am.role, am.content, am.sources_json AS sources,
            am.had_grounding AS hadGrounding, am.linked_action_id AS linkedActionId, am.created_at AS createdAt
       FROM assistant_message am
       JOIN assistant_conversation ac ON ac.id = am.conversation_id
      WHERE am.conversation_id = ? AND ac.store_id = ?
      ORDER BY am.id ASC`,
    [conversationId, storeId],
  );
  return rows.map((r) => ({ ...r, hadGrounding: !!r.hadGrounding }));
}

export async function listConversations(storeId: number, userId: number): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT ac.id, ac.started_at AS startedAt,
            (SELECT content FROM assistant_message m WHERE m.conversation_id = ac.id AND m.role = 'user' ORDER BY m.id ASC LIMIT 1) AS firstQuery,
            (SELECT COUNT(*) FROM assistant_message m WHERE m.conversation_id = ac.id) AS messageCount
       FROM assistant_conversation ac
      WHERE ac.store_id = ? AND ac.user_id = ?
      ORDER BY ac.id DESC LIMIT 50`,
    [storeId, userId],
  );
  return rows;
}
