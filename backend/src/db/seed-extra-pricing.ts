/**
 * 추가 데모용 가격 규칙 시드 (additive · idempotent)
 *   - 기존 데이터/거래를 건드리지 않고 pricing_rule 만 보강한다.
 *   - 동일 name 이 이미 있으면 건너뛰므로 여러 번 실행해도 안전하다.
 *   - 비즈니스 모델(유통기한 임박·날씨·스케줄·수요하락·번들)에 맞춘 현실적인 규칙 구성.
 */
import { getPool } from './pool';
import { logger } from '../lib/logger';

interface RuleSeed {
  store: number | null;
  name: string;
  triggerType: 'shelf_life' | 'weather' | 'demand_drop' | 'schedule' | 'manual';
  triggerConfig: Record<string, unknown>;
  actionType: 'percent_off' | 'fixed_price' | 'bundle';
  actionConfig: Record<string, unknown>;
  active: 0 | 1;
}

const RULES: RuleSeed[] = [
  {
    store: 1,
    name: '삼각김밥·샌드위치 마감 40% 타임세일',
    triggerType: 'shelf_life',
    triggerConfig: { threshold_days: 1, product_master_ids: [14, 15, 24] },
    actionType: 'percent_off',
    actionConfig: { percent: 40, duration_hours: 2 },
    active: 1,
  },
  {
    store: 1,
    name: '우천 시 따뜻한 음료 15% 할인',
    triggerType: 'weather',
    triggerConfig: { min_rain_mm: 1, product_master_ids: [4, 5] },
    actionType: 'percent_off',
    actionConfig: { percent: 15, duration_hours: 6 },
    active: 1,
  },
  {
    store: 1,
    name: '주말 저녁 도시락·김밥 25% 타임세일',
    triggerType: 'schedule',
    triggerConfig: { days_of_week: ['sat', 'sun'], start_hour: 18, end_hour: 21, product_master_ids: [11, 12, 13, 14, 15] },
    actionType: 'percent_off',
    actionConfig: { percent: 25, duration_hours: 3 },
    active: 1,
  },
  {
    store: 1,
    name: '컵라면 2+1 번들 프로모션',
    triggerType: 'manual',
    triggerConfig: { product_master_ids: [16, 17] },
    actionType: 'bundle',
    actionConfig: { percent: 33, duration_hours: 24 },
    active: 1,
  },
  {
    store: 1,
    name: '판매 부진 스낵 20% 소진 할인',
    triggerType: 'demand_drop',
    triggerConfig: { window_days: 7, min_drop_pct: 25, product_master_ids: [8, 9, 10, 21, 25] },
    actionType: 'percent_off',
    actionConfig: { percent: 20, duration_hours: 12 },
    active: 1,
  },
  {
    store: 1,
    name: '유제품 마감 임박 990원 균일가',
    triggerType: 'shelf_life',
    triggerConfig: { threshold_days: 1, product_master_ids: [6, 7] },
    actionType: 'fixed_price',
    actionConfig: { price: 990, duration_hours: 4 },
    active: 1,
  },
  {
    store: null,
    name: '비타민워터 여름 시즌 프로모션 (예약)',
    triggerType: 'schedule',
    triggerConfig: { days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], start_hour: 12, end_hour: 15, product_master_ids: [22] },
    actionType: 'percent_off',
    actionConfig: { percent: 10, duration_hours: 3 },
    active: 0,
  },
];

async function main(): Promise<void> {
  const pool = getPool();
  let inserted = 0;
  let skipped = 0;
  for (const r of RULES) {
    const [exists] = await pool.query<any[]>('SELECT id FROM pricing_rule WHERE name = ? LIMIT 1', [r.name]);
    if (exists.length) {
      skipped++;
      continue;
    }
    await pool.query(
      `INSERT INTO pricing_rule
         (store_id, name, trigger_type, trigger_config_json, action_type, action_config_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [r.store, r.name, r.triggerType, JSON.stringify(r.triggerConfig), r.actionType, JSON.stringify(r.actionConfig), r.active],
    );
    inserted++;
  }
  logger.info({ inserted, skipped, total: RULES.length }, 'extra pricing rules seeded');
  // eslint-disable-next-line no-console
  console.log(`✅ pricing_rule 보강: 신규 ${inserted}건 / 기존 스킵 ${skipped}건`);
  await pool.end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
