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

export type Intent =
  | 'top_seller'
  | 'worst_seller'
  | 'forecast'
  | 'revenue_margin'
  | 'today_revenue'
  | 'yesterday_revenue'
  | 'week_revenue'
  | 'avg_ticket'
  | 'transaction_count'
  | 'peak_hour'
  | 'category_sales'
  | 'payment_method'
  | 'inventory_low'
  | 'inventory_total'
  | 'expiring'
  | 'waste'
  | 'pricing'
  | 'anomaly'
  | 'recommendation'
  | 'order_status'
  | 'multi'
  | 'unknown';

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
  /** 답변 근거가 된 실제 집계 데이터 라인 (화면에 답변과 함께 표시) */
  facts: string[];
  hadGrounding: boolean;
  model: string;
}

// --- 의도 분류 (다중 토픽 키워드 룰) ---------------------------------------
//   질문 하나에 여러 주제가 섞일 수 있으므로(예: "오늘 매출이랑 재고 어때?")
//   매칭되는 모든 토픽의 근거를 모아 답변 품질을 높인다.

interface Topic {
  intent: Intent;
  test: RegExp;
  run: (storeId: number, message: string) => Promise<{ facts: string[]; sources: GroundingSource[] }>;
}

const won = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;
const ea = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}개`;

/**
 * 질문에서 원하는 순위 개수(N)를 추출한다.
 *   "1-10", "1~10"(범위) → 상한값 / "TOP 10", "상위 10", "10위/개/가지/종" → 그 수.
 *   못 찾으면 def. 1~cap 범위로 보정.
 */
function parseTopN(message: string, def: number, cap = 20): number {
  let m = message.match(/\b\d{1,2}\s*[-~]\s*(\d{1,2})\b/); // "1-10" → 10
  if (!m) m = message.match(/(?:top|상위|순위|베스트|best)\s*(\d{1,2})/i);
  if (!m) m = message.match(/(\d{1,2})\s*(?:위|개|가지|종)\b/);
  let n = m ? parseInt(m[1], 10) : def;
  if (!Number.isFinite(n) || n <= 0) n = def;
  return Math.min(cap, Math.max(1, n));
}

/**
 * 질문에서 판매 집계 기간을 판별한다(과거 실적 기준).
 *   지난달 / 이번 달(=이번 한 달·당월·한 달) / 최근 30일 / 기본 최근 7일.
 *   반환 sql 은 고정 화이트리스트 문자열(사용자 입력 미포함)이라 인젝션 안전.
 */
function salesPeriod(message: string): { sql: string; label: string; period: string } {
  if (/(지난\s*달|지난달|전월|저번\s*달|작\s*월)/.test(message))
    return {
      sql: 'YEAR(t.occurred_at)=YEAR(DATE_SUB(CURRENT_DATE,INTERVAL 1 MONTH)) AND MONTH(t.occurred_at)=MONTH(DATE_SUB(CURRENT_DATE,INTERVAL 1 MONTH))',
      label: '지난달',
      period: 'last_month',
    };
  if (/(이번\s*한?\s*달|당월|이달|금월|한\s*달|월간|월\s*매출|이번\s*달)/.test(message))
    return {
      sql: 'YEAR(t.occurred_at)=YEAR(CURRENT_DATE) AND MONTH(t.occurred_at)=MONTH(CURRENT_DATE)',
      label: '이번 달',
      period: 'this_month',
    };
  if (/(최근\s*30|30\s*일|한\s*달간)/.test(message))
    return { sql: 't.occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY)', label: '최근 30일', period: 'last_30_days' };
  return { sql: 't.occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 7 DAY)', label: '최근 7일', period: 'last_7_days' };
}

/**
 * 다음 달 최다 판매 예측 — 전용 예측 데이터가 없으므로 최근 5주 판매 실적의
 * '요일별' 평균을 다음 달의 실제 요일 구성(평일/주말 일수)에 투영해 품목별
 * 예상 판매량·예상 매출을 산출한다. 작년 동월 데이터가 없어 계절성은 미반영(추정치).
 */
async function forecastNextMonth(
  storeId: number,
  message: string,
): Promise<{ facts: string[]; sources: GroundingSource[] }> {
  const pool = getPool();
  const n = parseTopN(message, 10);

  // 상품 × 요일(DAYOFWEEK 1=일~7=토)별 판매량·관측일수·매출
  const [rows] = await pool.query<any[]>(
    `SELECT ti.product_master_id AS pid, pm.name AS name,
            DAYOFWEEK(t.occurred_at) AS dow,
            SUM(ti.quantity) AS units,
            COUNT(DISTINCT DATE(t.occurred_at)) AS days,
            SUM(ti.quantity*ti.unit_price - ti.discount_applied) AS rev
       FROM \`transaction\` t
       JOIN transaction_item ti ON ti.transaction_id = t.id
       JOIN product_master pm ON pm.id = ti.product_master_id
      WHERE t.store_id=? AND t.occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 35 DAY)
      GROUP BY ti.product_master_id, pm.name, DAYOFWEEK(t.occurred_at)`,
    [storeId],
  );
  if (!rows.length) return { facts: [], sources: [] };

  const [meta] = await pool.query<any[]>(
    `SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL 1 MONTH),'%Y-%m-01') AS firstDay,
            DAY(LAST_DAY(DATE_ADD(CURRENT_DATE,INTERVAL 1 MONTH))) AS days,
            DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL 1 MONTH),'%Y년 %c월') AS label`,
  );
  const nextDays = Number(meta[0]?.days ?? 30);
  const nextLabel = String(meta[0]?.label ?? '다음 달');
  const firstDay = String(meta[0]?.firstDay ?? '');

  // 다음 달의 요일 구성 집계 (DAYOFWEEK 기준 1=일~7=토)
  const dowCount: Record<number, number> = {};
  let weekendDays = 0;
  if (firstDay) {
    const [y, mo] = firstDay.split('-').map(Number);
    for (let d = 1; d <= nextDays; d++) {
      const dow = new Date(y, mo - 1, d).getDay() + 1; // JS 0=일 → 1=일
      dowCount[dow] = (dowCount[dow] ?? 0) + 1;
      if (dow === 1 || dow === 7) weekendDays++;
    }
  }

  // 상품별 요일 평균(1일당 판매량) + 전체 평균/평균단가 집계
  const prod = new Map<number, { name: string; perDow: Map<number, number>; units: number; rev: number; days: number }>();
  for (const r of rows) {
    const pid = Number(r.pid);
    let p = prod.get(pid);
    if (!p) { p = { name: String(r.name), perDow: new Map(), units: 0, rev: 0, days: 0 }; prod.set(pid, p); }
    const obs = Math.max(1, Number(r.days));
    p.perDow.set(Number(r.dow), Number(r.units) / obs); // 해당 요일 1일 평균
    p.units += Number(r.units);
    p.rev += Number(r.rev);
    p.days += Number(r.days);
  }

  const projected = [...prod.values()]
    .map((p) => {
      const overallPerDay = p.days > 0 ? p.units / p.days : 0; // 요일 데이터 공백 시 보완값
      const avgPrice = p.units > 0 ? p.rev / p.units : 0;
      let predUnits = 0;
      for (const [dowStr, cnt] of Object.entries(dowCount)) {
        const dow = Number(dowStr);
        predUnits += (p.perDow.get(dow) ?? overallPerDay) * cnt;
      }
      predUnits = Math.round(predUnits);
      return { name: p.name, predUnits, predRev: Math.round(predUnits * avgPrice) };
    })
    .sort((a, b) => b.predUnits - a.predUnits)
    .slice(0, n);

  const totU = projected.reduce((s, r) => s + r.predUnits, 0);
  const totR = projected.reduce((s, r) => s + r.predRev, 0);
  const facts = [
    `${nextLabel} 최다 판매 예측 상위 ${projected.length}개 (최근 5주 요일별 추세를 다음 달 요일구성[총 ${nextDays}일·주말 ${weekendDays}일]에 투영):`,
  ];
  projected.forEach((r, i) =>
    facts.push(`  ${i + 1}. ${r.name} — 예상 ${ea(r.predUnits)} (예상 매출 ${won(r.predRev)})`),
  );
  facts.push(`  └ 상위 ${projected.length}개 예상 합계: ${ea(totU)} · ${won(totR)}`);
  facts.push('  ※ 요일·주말 패턴을 반영한 추세 투영 추정치입니다(작년 동월 데이터가 쌓이면 계절성까지 반영해 정밀도를 높일 수 있습니다).');
  return { facts, sources: [{ type: 'demand_forecast', period: 'next_month', detail: '다음 달 판매 예측(요일 가중 투영)' }] };
}

const TOPICS: Topic[] = [
  // 오늘 매출 / 거래 건수 / 객단가
  {
    intent: 'today_revenue',
    test: /(오늘|금일|today).*(매출|벌|수익|팔렸|판매액)|(매출|수익).*(오늘|금일)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT COALESCE(SUM(total_amount),0) AS rev, COUNT(*) AS tx
           FROM \`transaction\` WHERE store_id=? AND DATE(occurred_at)=CURRENT_DATE`,
        [storeId],
      );
      const rev = Number(rows[0]?.rev ?? 0);
      const tx = Number(rows[0]?.tx ?? 0);
      if (tx > 0) {
        const facts = [
          `오늘 매출: ${won(rev)} (거래 ${tx.toLocaleString('ko-KR')}건, 객단가 ${won(rev / tx)})`,
        ];
        return { facts, sources: [{ type: 'transaction', period: 'today', detail: '당일 매출 집계' }] };
      }
      // 오늘 아직 거래가 없으면 가장 최근 영업일 매출로 대신 안내한다(데이터 공백 폴백).
      const [last] = await pool.query<any[]>(
        `SELECT DATE(occurred_at) AS d, SUM(total_amount) AS rev, COUNT(*) AS tx
           FROM \`transaction\` WHERE store_id=?
          GROUP BY DATE(occurred_at) ORDER BY d DESC LIMIT 1`,
        [storeId],
      );
      if (!last.length) return { facts: [], sources: [] };
      const d = String(last[0].d).slice(0, 10);
      const lr = Number(last[0].rev);
      const lt = Number(last[0].tx);
      return {
        facts: [
          `오늘은 아직 집계된 거래가 없습니다. 가장 최근 영업일(${d}) 매출은 ${won(lr)} (거래 ${lt.toLocaleString('ko-KR')}건, 객단가 ${won(lr / lt)})였습니다.`,
        ],
        sources: [{ type: 'transaction', period: 'latest_day', detail: '최근 영업일 매출' }],
      };
    },
  },
  // 어제 매출 + 전일 대비
  {
    intent: 'yesterday_revenue',
    test: /(어제|전일|yesterday).*(매출|벌|수익|판매)|전일\s*대비/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT
            COALESCE(SUM(CASE WHEN DATE(occurred_at)=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY) THEN total_amount END),0) AS y,
            COALESCE(SUM(CASE WHEN DATE(occurred_at)=CURRENT_DATE THEN total_amount END),0) AS t
           FROM \`transaction\`
          WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)`,
        [storeId],
      );
      const y = Number(rows[0]?.y ?? 0);
      const t = Number(rows[0]?.t ?? 0);
      if (y === 0 && t === 0) return { facts: [], sources: [] };
      const facts = [`어제 매출: ${won(y)}`];
      if (y > 0) {
        const diff = ((t - y) / y) * 100;
        facts.push(`오늘(${won(t)})은 어제 대비 ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`);
      }
      return { facts, sources: [{ type: 'transaction', period: 'yesterday', detail: '전일 매출 비교' }] };
    },
  },
  // 최근 7일 매출 추이
  {
    intent: 'week_revenue',
    test: /(이번\s*주|최근\s*(일|7)|일주일|주간|한\s*주|week).*(매출|추이|판매)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT DATE(occurred_at) AS d, SUM(total_amount) AS rev
           FROM \`transaction\`
          WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 6 DAY)
          GROUP BY DATE(occurred_at) ORDER BY d ASC`,
        [storeId],
      );
      if (!rows.length) return { facts: [], sources: [] };
      const total = rows.reduce((s, r) => s + Number(r.rev), 0);
      const facts = [`최근 7일 매출 합계: ${won(total)} (일평균 ${won(total / rows.length)})`];
      rows.forEach((r) => facts.push(`  • ${String(r.d).slice(0, 10)} — ${won(Number(r.rev))}`));
      return { facts, sources: [{ type: 'transaction', period: 'last_7_days', detail: '일별 매출 추이' }] };
    },
  },
  // 이번 달 매출·마진
  {
    intent: 'revenue_margin',
    test: /(마진|이익|순익|수익률)|(이번\s*달|당월|월\s*매출|이달|monthly).*(매출|수익|마진)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT COALESCE(SUM(total_amount),0) AS revenue, COUNT(*) AS txCount
           FROM \`transaction\`
          WHERE store_id=? AND YEAR(occurred_at)=YEAR(CURRENT_DATE) AND MONTH(occurred_at)=MONTH(CURRENT_DATE)`,
        [storeId],
      );
      const revenue = Number(rows[0]?.revenue ?? 0);
      if (revenue <= 0) return { facts: [], sources: [] };
      const estMargin = Math.round(revenue * 0.28);
      return {
        facts: [
          `이번 달 누적 매출: ${won(revenue)}`,
          `거래 건수: ${Number(rows[0].txCount).toLocaleString('ko-KR')}건`,
          `추정 마진(평균 마진율 28% 가정): 약 ${won(estMargin)}`,
        ],
        sources: [{ type: 'transaction', period: 'this_month', detail: '당월 매출 집계' }],
      };
    },
  },
  // 객단가
  {
    intent: 'avg_ticket',
    test: /(객단가|평균\s*(구매|결제|구입)|건당|avg.*ticket)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT COALESCE(AVG(total_amount),0) AS avgTicket, COUNT(*) AS tx
           FROM \`transaction\`
          WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY)`,
        [storeId],
      );
      if (Number(rows[0]?.tx ?? 0) === 0) return { facts: [], sources: [] };
      return {
        facts: [`최근 30일 평균 객단가: ${won(Number(rows[0].avgTicket))} (거래 ${Number(rows[0].tx).toLocaleString('ko-KR')}건)`],
        sources: [{ type: 'transaction', period: 'last_30_days', detail: '객단가 집계' }],
      };
    },
  },
  // 거래 건수 / 손님 수
  {
    intent: 'transaction_count',
    test: /(손님|고객|방문객|내점|거래\s*건|거래량|몇\s*명|트래픽|손님\s*수)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT
            SUM(DATE(occurred_at)=CURRENT_DATE) AS today,
            SUM(DATE(occurred_at)=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)) AS yday
           FROM \`transaction\`
          WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY)`,
        [storeId],
      );
      const today = Number(rows[0]?.today ?? 0);
      const yday = Number(rows[0]?.yday ?? 0);
      if (today === 0 && yday === 0) return { facts: [], sources: [] };
      return {
        facts: [`오늘 거래(손님) ${today.toLocaleString('ko-KR')}건 · 어제 ${yday.toLocaleString('ko-KR')}건`],
        sources: [{ type: 'transaction', period: 'today', detail: '거래 건수' }],
      };
    },
  },
  // 피크 시간대
  {
    intent: 'peak_hour',
    test: /(피크|붐비|바쁜|시간대|몇\s*시|러시|혼잡|언제\s*(많이|붐))/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT HOUR(occurred_at) AS h, COUNT(*) AS tx, SUM(total_amount) AS rev
           FROM \`transaction\`
          WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 7 DAY)
          GROUP BY HOUR(occurred_at) ORDER BY tx DESC LIMIT 3`,
        [storeId],
      );
      if (!rows.length) return { facts: [], sources: [] };
      const facts = ['최근 7일 시간대별 혼잡 TOP3:'];
      rows.forEach((r) =>
        facts.push(`  • ${String(r.h).padStart(2, '0')}시 — 거래 ${Number(r.tx)}건 (매출 ${won(Number(r.rev))})`),
      );
      return { facts, sources: [{ type: 'transaction', period: 'last_7_days', detail: '시간대별 거래' }] };
    },
  },
  // 기간별 상위 판매 상품 순위 (요청 기간·개수 인식, 수량+매출)
  {
    intent: 'top_seller',
    test: /(최다|많이\s*팔|베스트|잘\s*팔|인기|top|상위).*(판매|상품|제품|메뉴)?|판매\s*(순위|상위|랭킹)/,
    run: async (storeId, message) => {
      const pool = getPool();
      const n = parseTopN(message, 5); // 기본 5, "1-10"/"상위 10" 등 요청 시 그 수
      const p = salesPeriod(message); // 이번 달 / 지난달 / 최근 30일 / 기본 7일
      const [rows] = await pool.query<any[]>(
        `SELECT pm.name AS name, SUM(ti.quantity) AS units,
                SUM(ti.quantity*ti.unit_price - ti.discount_applied) AS rev
           FROM \`transaction\` t
           JOIN transaction_item ti ON ti.transaction_id = t.id
           JOIN product_master pm ON pm.id = ti.product_master_id
          WHERE t.store_id=? AND ${p.sql}
          GROUP BY ti.product_master_id, pm.name ORDER BY units DESC LIMIT ${n}`,
        [storeId],
      );
      if (!rows.length) return { facts: [], sources: [] };
      const totUnits = rows.reduce((s, r) => s + Number(r.units), 0);
      const totRev = rows.reduce((s, r) => s + Number(r.rev), 0);
      const facts = [`${p.label} 판매 상위 ${rows.length}개 상품 (판매수량·매출):`];
      rows.forEach((r, i) =>
        facts.push(`  ${i + 1}. ${r.name} — ${ea(Number(r.units))} (매출 ${won(Number(r.rev))})`),
      );
      facts.push(`  └ 상위 ${rows.length}개 합계: ${ea(totUnits)} · ${won(totRev)}`);
      return { facts, sources: [{ type: 'transaction', period: p.period, detail: `${p.label} 품목별 판매량·매출` }] };
    },
  },
  // 안 팔리는 상품
  {
    intent: 'worst_seller',
    test: /(안\s*팔|부진|재고\s*만|판매\s*저조|덜\s*팔|가장\s*적게|worst|안나가)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT pm.name AS name, COALESCE(SUM(ti.quantity),0) AS units
           FROM product_master pm
           JOIN inventory inv ON inv.product_master_id = pm.id AND inv.store_id = ?
           LEFT JOIN transaction_item ti ON ti.product_master_id = pm.id
           LEFT JOIN \`transaction\` t ON t.id = ti.transaction_id
                 AND t.store_id = ? AND t.occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 7 DAY)
          GROUP BY pm.id, pm.name ORDER BY units ASC LIMIT 5`,
        [storeId, storeId],
      );
      if (!rows.length) return { facts: [], sources: [] };
      const facts = ['최근 7일 판매 부진 상품(재고 보유분):'];
      rows.forEach((r) => facts.push(`  • ${r.name} — 7일 판매 ${Number(r.units)}개`));
      return { facts, sources: [{ type: 'transaction', period: 'last_7_days', detail: '판매 부진 분석' }] };
    },
  },
  // 카테고리별 매출
  {
    intent: 'category_sales',
    test: /(카테고리|분류|품목군|부문|category).*(매출|판매|비중)|어떤\s*(종류|분류)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT COALESCE(pm.category,'기타') AS cat, SUM(ti.quantity*ti.unit_price - ti.discount_applied) AS rev
           FROM \`transaction\` t
           JOIN transaction_item ti ON ti.transaction_id=t.id
           JOIN product_master pm ON pm.id=ti.product_master_id
          WHERE t.store_id=? AND t.occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY)
          GROUP BY pm.category ORDER BY rev DESC LIMIT 6`,
        [storeId],
      );
      if (!rows.length) return { facts: [], sources: [] };
      const facts = ['최근 30일 카테고리별 매출:'];
      rows.forEach((r) => facts.push(`  • ${r.cat} — ${won(Number(r.rev))}`));
      return { facts, sources: [{ type: 'transaction', period: 'last_30_days', detail: '카테고리별 매출' }] };
    },
  },
  // 결제 수단 분포
  {
    intent: 'payment_method',
    test: /(결제\s*(수단|방법|비중)|카드|현금|페이|간편결제|payment)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT COALESCE(payment_method,'기타') AS m, COUNT(*) AS cnt, SUM(total_amount) AS rev
           FROM \`transaction\`
          WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 30 DAY)
          GROUP BY payment_method ORDER BY cnt DESC LIMIT 6`,
        [storeId],
      );
      if (!rows.length) return { facts: [], sources: [] };
      const facts = ['최근 30일 결제수단 분포:'];
      rows.forEach((r) => facts.push(`  • ${r.m} — ${Number(r.cnt).toLocaleString('ko-KR')}건 (${won(Number(r.rev))})`));
      return { facts, sources: [{ type: 'transaction', period: 'last_30_days', detail: '결제수단 분포' }] };
    },
  },
  // 내일 수요예측 / 발주량
  {
    intent: 'forecast',
    test: /(예측|수요|내일|주문량|발주량|얼마나\s*(시켜|들여)|forecast)/,
    run: async (storeId, message) => {
      // "다음 달" 판매 예측은 내일 발주 예측과 별개 — 추세 투영으로 월간 순위 예측
      if (/(다음\s*달|다음달|내달|담\s*달|익월|차월|next\s*month)/.test(message)) {
        return forecastNextMonth(storeId, message);
      }
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT pm.name AS name, df.predicted_quantity AS qty, df.confidence AS conf
           FROM demand_forecast df
           JOIN product_master pm ON pm.id = df.product_master_id
          WHERE df.store_id=? AND df.target_date = DATE_ADD(CURRENT_DATE,INTERVAL 1 DAY)
          ORDER BY df.predicted_quantity DESC LIMIT 12`,
        [storeId],
      );
      // 내일자 예측이 있으면 그대로, 없으면 최근 28일 일평균 판매량으로 권장 발주량을 추정한다.
      let items: Array<{ name: string; qty: number; conf: number | null }>;
      let basedOnForecast = true;
      if (rows.length) {
        items = rows.map((r) => ({ name: String(r.name), qty: Number(r.qty), conf: Number(r.conf) }));
      } else {
        const [avg] = await pool.query<any[]>(
          `SELECT pm.name AS name,
                  SUM(ti.quantity) / COUNT(DISTINCT DATE(t.occurred_at)) AS avgday
             FROM \`transaction\` t
             JOIN transaction_item ti ON ti.transaction_id = t.id
             JOIN product_master pm ON pm.id = ti.product_master_id
            WHERE t.store_id=? AND t.occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 28 DAY)
            GROUP BY ti.product_master_id, pm.name ORDER BY avgday DESC LIMIT 12`,
          [storeId],
        );
        if (!avg.length) return { facts: [], sources: [] };
        basedOnForecast = false;
        items = avg.map((r) => ({ name: String(r.name), qty: Math.ceil(Number(r.avgday)), conf: null }));
      }
      const matched = items.filter((r) => message.includes(r.name.slice(0, 2)));
      const use = (matched.length ? matched : items).slice(0, 6);
      const facts = [
        basedOnForecast
          ? '내일 수요예측(권장 발주 참고):'
          : '내일 권장 발주량(최근 28일 일평균 판매량 기준 추정):',
      ];
      use.forEach((r) =>
        facts.push(`  • ${r.name} — ${r.qty}개${r.conf != null ? ` (신뢰도 ${Math.round(r.conf * 100)}%)` : ''}`),
      );
      return {
        facts,
        sources: [
          basedOnForecast
            ? { type: 'demand_forecast', period: 'tomorrow', detail: '품목별 예측 수량' }
            : { type: 'transaction', period: 'last_28_days', detail: '최근 판매 기반 발주 추정' },
        ],
      };
    },
  },
  // 발주 현황
  {
    intent: 'order_status',
    test: /(발주|주문|입고|purchase\s*order).*(현황|상태|진행|승인|대기)|발주\s*(어때|상황)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT status, COUNT(*) AS cnt FROM purchase_order
          WHERE store_id=? AND order_date >= DATE_SUB(CURRENT_DATE,INTERVAL 14 DAY)
          GROUP BY status ORDER BY cnt DESC`,
        [storeId],
      );
      if (!rows.length) return { facts: [], sources: [] };
      const label: Record<string, string> = {
        draft: '초안', pending_review: '승인 대기', approved: '승인됨', sent: '발송', received: '입고완료', cancelled: '취소', failed: '실패',
      };
      const facts = ['최근 2주 발주 현황:'];
      rows.forEach((r) => facts.push(`  • ${label[r.status] ?? r.status} — ${Number(r.cnt)}건`));
      return { facts, sources: [{ type: 'purchase_order', period: 'last_14_days', detail: '발주 상태 집계' }] };
    },
  },
  // 재고 부족 / 품절 임박
  {
    intent: 'inventory_low',
    test: /(재고\s*부족|품절|모자라|떨어진|소진|발주\s*필요|부족한|보충|low\s*stock)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT pm.name AS name, inv.quantity AS qty
           FROM inventory inv JOIN product_master pm ON pm.id=inv.product_master_id
          WHERE inv.store_id=? AND inv.quantity <= 5
          ORDER BY inv.quantity ASC LIMIT 8`,
        [storeId],
      );
      if (!rows.length) return { facts: [], sources: [] };
      const facts = ['재고 부족(5개 이하) 상품:'];
      rows.forEach((r) => facts.push(`  • ${r.name} — ${Number(r.qty)}개 남음`));
      return { facts, sources: [{ type: 'inventory', period: 'now', detail: '재고 부족 목록' }] };
    },
  },
  // 전체 재고 현황
  {
    intent: 'inventory_total',
    test: /(재고\s*(현황|수준|총|얼마|상태|어때)|총\s*재고|stock\s*level)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT COUNT(*) AS items, COALESCE(SUM(quantity),0) AS units,
                SUM(quantity<=5) AS low
           FROM inventory WHERE store_id=?`,
        [storeId],
      );
      if (Number(rows[0]?.items ?? 0) === 0) return { facts: [], sources: [] };
      return {
        facts: [
          `현재 재고: ${Number(rows[0].items).toLocaleString('ko-KR')}개 품목 · 총 ${Number(rows[0].units).toLocaleString('ko-KR')}개 (부족 품목 ${Number(rows[0].low)}종)`,
        ],
        sources: [{ type: 'inventory', period: 'now', detail: '재고 요약' }],
      };
    },
  },
  // 유통기한 임박
  {
    intent: 'expiring',
    test: /(유통기한|소비기한|임박|폐기\s*임박|expire|상하|신선도|날짜\s*지)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT pm.name AS name, inv.quantity AS qty, inv.expires_at AS exp
           FROM inventory inv JOIN product_master pm ON pm.id=inv.product_master_id
          WHERE inv.store_id=? AND inv.expires_at IS NOT NULL
            AND inv.expires_at <= DATE_ADD(CURRENT_DATE,INTERVAL 2 DAY)
          ORDER BY inv.expires_at ASC LIMIT 8`,
        [storeId],
      );
      if (!rows.length) return { facts: [], sources: [] };
      const facts = ['유통기한 임박(2일 이내) 상품 — 할인 검토 권장:'];
      rows.forEach((r) => facts.push(`  • ${r.name} — ${Number(r.qty)}개 (만료 ${String(r.exp).slice(0, 10)})`));
      return { facts, sources: [{ type: 'inventory', period: 'next_2_days', detail: '유통기한 임박' }] };
    },
  },
  // 폐기
  {
    intent: 'waste',
    test: /(폐기|버린|손실|로스|버려|waste)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT COALESCE(-SUM(delta),0) AS units
           FROM inventory_history
          WHERE store_id=? AND reason='discard' AND occurred_at >= DATE_SUB(NOW(),INTERVAL 7 DAY)`,
        [storeId],
      );
      const units = Number(rows[0]?.units ?? 0);
      return {
        facts: [`최근 7일 폐기 수량: ${units}개`],
        sources: [{ type: 'inventory_history', period: 'last_7_days', detail: '폐기 집계' }],
      };
    },
  },
  // 가격 인하 / 할인 현황
  {
    intent: 'pricing',
    test: /(할인|가격\s*(인하|조정|변경|내림)|마크다운|세일|프로모션|markdown|discount)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT pm.name AS name, pe.original_price AS op, pe.adjusted_price AS ap
           FROM pricing_event pe JOIN product_master pm ON pm.id=pe.product_master_id
          WHERE pe.store_id=? AND NOW() BETWEEN pe.effective_from AND pe.effective_to
          ORDER BY (pe.original_price-pe.adjusted_price) DESC LIMIT 6`,
        [storeId],
      );
      if (!rows.length) return { facts: ['현재 진행 중인 할인(가격 인하)이 없습니다.'], sources: [{ type: 'pricing_event', period: 'now', detail: '진행 할인 없음' }] };
      const facts = ['현재 진행 중인 가격 인하:'];
      rows.forEach((r) => {
        const rate = Math.round((1 - Number(r.ap) / Number(r.op)) * 100);
        facts.push(`  • ${r.name} — ${won(Number(r.op))} → ${won(Number(r.ap))} (${rate}%↓)`);
      });
      return { facts, sources: [{ type: 'pricing_event', period: 'now', detail: '진행 중 할인' }] };
    },
  },
  // 이상 신호 / 도난 / 미결제
  {
    intent: 'anomaly',
    test: /(이상\s*(신호|징후)|도난|미결제|분실|사고|소란|침입|쓰러|anomaly|보안)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT anomaly_type AS t, COUNT(*) AS cnt
           FROM anomaly_event
          WHERE store_id=? AND detected_at >= DATE_SUB(NOW(),INTERVAL 7 DAY)
          GROUP BY anomaly_type ORDER BY cnt DESC`,
        [storeId],
      );
      const label: Record<string, string> = { unpaid_exit: '미결제 퇴장', disturbance: '소란 발생', collapse: '고객 쓰러짐', intrusion: '외부 침입' };
      if (!rows.length) return { facts: ['최근 7일 감지된 이상 신호가 없습니다.'], sources: [{ type: 'anomaly_event', period: 'last_7_days', detail: '이상 없음' }] };
      const facts = ['최근 7일 이상 신호 감지:'];
      rows.forEach((r) => facts.push(`  • ${label[r.t] ?? r.t} — ${Number(r.cnt)}건`));
      return { facts, sources: [{ type: 'anomaly_event', period: 'last_7_days', detail: '이상 신호 집계' }] };
    },
  },
  // AI 추천 / 처방 액션
  {
    intent: 'recommendation',
    test: /(추천|처방|제안|뭐\s*(해|하면)|어떻게\s*(해야|하면)|액션|할\s*일|개선|조치|recommend)/,
    run: async (storeId) => {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT action_type AS t, rationale, confidence AS conf
           FROM prescriptive_action
          WHERE store_id=? AND status='proposed'
          ORDER BY priority DESC, confidence DESC LIMIT 5`,
        [storeId],
      );
      const label: Record<string, string> = { price_markdown: '가격 인하', promotion: '프로모션', reorder: '재발주', reallocate: '재배치', staffing: '인력 조정' };
      if (!rows.length) return { facts: [], sources: [] };
      const facts = ['AI 추천 조치(우선순위순):'];
      rows.forEach((r) =>
        facts.push(`  • [${label[r.t] ?? r.t}] ${r.rationale ?? ''} (신뢰도 ${Math.round(Number(r.conf) * 100)}%)`),
      );
      return { facts, sources: [{ type: 'prescriptive_action', period: 'open', detail: 'AI 처방 액션' }] };
    },
  },
];

export function classifyIntent(message: string): Intent {
  for (const t of TOPICS) if (t.test.test(message)) return t.intent;
  return 'unknown';
}

// --- 근거 데이터 조회 (비식별 집계만, 다중 토픽 누적) -----------------------

/**
 * 점포 운영 스냅샷 — 특정 의도에 매칭되지 않거나 해당 기간 데이터가 비어 있을 때,
 * "데이터 없음" 으로 끊지 않고 일반적인 운영 현황(최근 매출·인기 상품·재고)을 근거로
 * 제공해 웬만한 질문에는 답할 수 있게 한다. 점포에 데이터가 전혀 없을 때만 빈 결과.
 */
async function storeSnapshot(storeId: number): Promise<{ facts: string[]; sources: GroundingSource[] }> {
  const pool = getPool();
  const facts: string[] = [];
  const sources: GroundingSource[] = [];

  const [day] = await pool.query<any[]>(
    `SELECT DATE(occurred_at) AS d, SUM(total_amount) AS rev, COUNT(*) AS tx
       FROM \`transaction\` WHERE store_id=?
      GROUP BY DATE(occurred_at) ORDER BY d DESC LIMIT 1`,
    [storeId],
  );
  if (day.length) {
    const d = String(day[0].d).slice(0, 10);
    const rev = Number(day[0].rev);
    const tx = Number(day[0].tx);
    facts.push(`최근 영업일(${d}) 매출: ${won(rev)} (거래 ${tx.toLocaleString('ko-KR')}건, 객단가 ${won(rev / tx)})`);
    sources.push({ type: 'transaction', period: 'latest_day', detail: '최근 영업일 매출' });
  }

  const [week] = await pool.query<any[]>(
    `SELECT COALESCE(SUM(total_amount),0) AS rev, COUNT(*) AS tx
       FROM \`transaction\` WHERE store_id=? AND occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 6 DAY)`,
    [storeId],
  );
  if (Number(week[0]?.tx ?? 0) > 0) {
    facts.push(`최근 7일 매출 합계: ${won(Number(week[0].rev))} (거래 ${Number(week[0].tx).toLocaleString('ko-KR')}건)`);
    sources.push({ type: 'transaction', period: 'last_7_days', detail: '최근 7일 매출' });
  }

  const [top] = await pool.query<any[]>(
    `SELECT pm.name AS name, SUM(ti.quantity) AS units
       FROM \`transaction\` t
       JOIN transaction_item ti ON ti.transaction_id = t.id
       JOIN product_master pm ON pm.id = ti.product_master_id
      WHERE t.store_id=? AND t.occurred_at >= DATE_SUB(CURRENT_DATE,INTERVAL 7 DAY)
      GROUP BY ti.product_master_id, pm.name ORDER BY units DESC LIMIT 3`,
    [storeId],
  );
  if (top.length) {
    facts.push(`최근 7일 인기 상품: ${top.map((r) => `${r.name}(${Number(r.units)}개)`).join(', ')}`);
    sources.push({ type: 'transaction', period: 'last_7_days', detail: '인기 상품' });
  }

  const [inv] = await pool.query<any[]>(
    `SELECT COUNT(*) AS items, COALESCE(SUM(quantity),0) AS units, SUM(quantity<=5) AS low
       FROM inventory WHERE store_id=?`,
    [storeId],
  );
  if (Number(inv[0]?.items ?? 0) > 0) {
    facts.push(`현재 재고: ${Number(inv[0].items).toLocaleString('ko-KR')}개 품목 · 총 ${Number(inv[0].units).toLocaleString('ko-KR')}개 (부족 품목 ${Number(inv[0].low)}종)`);
    sources.push({ type: 'inventory', period: 'now', detail: '재고 요약' });
  }

  return { facts, sources };
}

export async function buildGrounding(storeId: number, message: string): Promise<Grounding> {
  const matched = TOPICS.filter((t) => t.test.test(message));
  const facts: string[] = [];
  const sources: GroundingSource[] = [];

  const results = await Promise.all(matched.map((t) => t.run(storeId, message).catch(() => ({ facts: [], sources: [] }))));
  for (const r of results) {
    facts.push(...r.facts);
    sources.push(...r.sources);
  }

  const withFacts = matched.filter((_, i) => results[i].facts.length > 0);

  // 매칭된 의도가 없거나 해당 기간 데이터가 비어 있으면, 일반 운영 스냅샷으로 폴백한다.
  if (facts.length === 0) {
    const snap = await storeSnapshot(storeId).catch(() => ({ facts: [], sources: [] }));
    facts.push(...snap.facts);
    sources.push(...snap.sources);
    return { intent: 'unknown', facts, sources };
  }

  const intent: Intent = withFacts.length === 1 ? withFacts[0].intent : 'multi';
  return { intent, facts, sources };
}

// --- 대화·메시지 영속 -------------------------------------------------------

export async function ensureConversation(storeId: number, userId: number | null, conversationId?: number): Promise<number> {
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
  opts: { sources?: GroundingSource[]; facts?: string[]; hadGrounding?: boolean } = {},
): Promise<number> {
  const pool = getPool();
  const [res]: any = await pool.query(
    `INSERT INTO assistant_message (conversation_id, role, content, sources_json, facts_json, had_grounding, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      conversationId,
      role,
      content,
      opts.sources && opts.sources.length ? JSON.stringify(opts.sources) : null,
      opts.facts && opts.facts.length ? JSON.stringify(opts.facts) : null,
      opts.hadGrounding ? 1 : 0,
    ],
  );
  return res.insertId as number;
}

/**
 * AI 점포 매니저 어시스턴트 전용 답변 스타일 지시.
 * 실 LLM(ADAPTER_LLM=openai) 전환 시 혼합 질문(예: 이번 달 순위 + 다음 달 예측)을
 * 자연스러운 한국어로 매끄럽게 요약하도록 유도한다. mock 어댑터는 system 메시지를 무시한다.
 */
const ASSISTANT_STYLE =
  '당신은 점주를 돕는 AI 점포 매니저입니다. [운영 데이터]의 수치만 근거로 답하되, ' +
  '다음 규칙을 지키세요. ' +
  '① 질문에 여러 주제(예: 이번 달 판매 순위 + 다음 달 예측)가 섞여 있으면 각 주제를 ' +
  '소제목으로 나눠 빠짐없이 다룹니다. ' +
  '② 먼저 한두 문장으로 핵심 인사이트를 요약한 뒤, 순위·수치는 목록으로 제시합니다. ' +
  '③ 판매수량과 매출 등 숫자는 데이터에 있는 값만 그대로 인용하고 임의로 만들지 않습니다. ' +
  '④ 예측·추정 수치에는 추정임을 한 줄로 함께 안내합니다. ' +
  '⑤ 데이터에 없으면 "데이터 없음"이라고 말합니다.';

/** 질의 처리: 근거 조회 → LLM(or 폴백) → 응답 저장 + 감사(assistant_query). */
export async function ask(storeId: number, userId: number | null, message: string, conversationId?: number): Promise<AssistantAnswer> {
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
      // 어시스턴트 전용 답변 스타일 지시(실 LLM에서만 반영, mock 어댑터는 무시).
      messages: [
        { role: 'system', content: ASSISTANT_STYLE },
        { role: 'user', content: message },
      ],
      groundingContext: grounding.facts.join('\n'),
      maxTokens: grounding.intent === 'multi' ? 900 : 512,
    });
    content = result.content;
    model = result.model;
  }

  const messageId = await insertMessage(convId, 'assistant', content, {
    sources: grounding.sources,
    facts: grounding.facts,
    hadGrounding,
  });

  await audit({
    storeId,
    userId,
    eventType: 'assistant_query',
    message: `AI 비서 질의 (의도=${grounding.intent}, 근거=${hadGrounding ? 'Y' : 'N'})`,
    metadata: { conversationId: convId, intent: grounding.intent, hadGrounding, sources: grounding.sources },
  });

  return { conversationId: convId, messageId, content, sources: grounding.sources, facts: grounding.facts, hadGrounding, model };
}

export async function listMessages(storeId: number, conversationId: number): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    `SELECT am.id, am.role, am.content, am.sources_json AS sources, am.facts_json AS facts,
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
