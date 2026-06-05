/**
 * 발표용 초기 데이터(Initial State) 시드 — 가격 정책 / 가격 변동 이력.
 *
 * - 가격 정책: '도시락 마감 3시간 전 30% 타임세일' 룰 1개 (강남역 직영점, store_id=1)
 * - 가격 변동 이력: 최근 일주일간 위 룰로 할인 적용된 현실적 이력 3건
 * - 상품 매핑: 이미 confirmed 매핑이 존재하므로 별도 삽입 없음
 *   (프론트 기본 필터를 'all'로 바꿔 노출 처리)
 *
 * 멱등(idempotent): 룰은 (store, name) 기준으로 한 번만 생성하고,
 * 이벤트는 해당 룰의 기존 이력을 지운 뒤 다시 넣어 재실행해도 중복되지 않는다.
 * seed-demo-refresh 는 이 테이블들을 건드리지 않으므로 db:seed:demo 후에도 유지된다.
 *
 * 실행: npm run db:seed:pricing-demo
 */
import { getPool, closePool } from './pool';
import { logger } from '../lib/logger';

const STORE_ID = 1; // 강남역 직영점
const RULE_NAME = '도시락 마감 3시간 전 30% 타임세일';

function datetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

async function main(): Promise<void> {
  const pool = getPool();

  // 1) 가격 정책 룰 (멱등: 같은 매장·이름이 이미 있으면 재사용)
  const [existing] = await pool.query<any[]>(
    'SELECT id FROM pricing_rule WHERE store_id = ? AND name = ? LIMIT 1',
    [STORE_ID, RULE_NAME],
  );
  let ruleId: number;
  const triggerConfig = { threshold_hours: 3, product_master_ids: [11, 12, 13, 24] };
  const actionConfig = { percent: 30, duration_hours: 3 };
  if (existing.length) {
    ruleId = Number(existing[0].id);
    await pool.query(
      `UPDATE pricing_rule
         SET trigger_type='shelf_life', trigger_config_json=?, action_type='percent_off',
             action_config_json=?, is_active=1
       WHERE id=?`,
      [JSON.stringify(triggerConfig), JSON.stringify(actionConfig), ruleId],
    );
  } else {
    const [res]: any = await pool.query(
      `INSERT INTO pricing_rule
         (store_id, name, trigger_type, trigger_config_json, action_type, action_config_json, is_active)
       VALUES (?, ?, 'shelf_life', ?, 'percent_off', ?, 1)`,
      [STORE_ID, RULE_NAME, JSON.stringify(triggerConfig), JSON.stringify(actionConfig)],
    );
    ruleId = res.insertId as number;
  }
  logger.info({ ruleId }, 'pricing rule ready');

  // 2) 가격 변동 이력 (멱등: 이 룰의 기존 이력 제거 후 재삽입)
  await pool.query('DELETE FROM pricing_event WHERE pricing_rule_id = ?', [ruleId]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 도시락류 현실적 정가 → 30% 할인가(10원 단위 반올림)
  const items = [
    { pmId: 11, name: '불고기 도시락', original: 4500, daysAgo: 2 },
    { pmId: 12, name: '제육 도시락', original: 4800, daysAgo: 4 },
    { pmId: 13, name: '치킨마요 덮밥', original: 4300, daysAgo: 6 },
  ];
  const rows = items.map((it) => {
    const adjusted = Math.round((it.original * 0.7) / 10) * 10; // 30% off, 10원 단위
    const from = addDays(today, -it.daysAgo);
    from.setHours(18, 10, 0, 0); // 마감 3시간 전 타임세일 시작
    const to = new Date(from);
    to.setHours(21, 10, 0, 0); // 3시간 적용
    const meta = {
      ruleId,
      ruleName: RULE_NAME,
      triggerType: 'shelf_life',
      actionType: 'percent_off',
      percent: 30,
      reason: '유통기한 임박(마감 3시간 전) 타임세일',
    };
    return [
      STORE_ID,
      it.pmId,
      ruleId,
      it.original,
      adjusted,
      datetime(from),
      datetime(to),
      'sent',
      JSON.stringify(meta),
    ];
  });

  await pool.query(
    `INSERT INTO pricing_event
       (store_id, product_master_id, pricing_rule_id, original_price, adjusted_price,
        effective_from, effective_to, esl_push_status, audit_meta_json)
     VALUES ?`,
    [rows],
  );
  logger.info({ events: rows.length }, 'pricing events seeded');

  await closePool();
  logger.info('pricing/mapping demo seed complete');
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'pricing demo seed failed');
  process.exit(1);
});
