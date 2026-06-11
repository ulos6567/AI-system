/**
 * 일회성 복구 스크립트 — 라이브 데모 DB의 KPI/MAPE 공백 보정.
 *
 *   증상: 메인 '실시간 매장 운영 현황'에서 거래건수·예측정확도가 '—' 표시.
 *   원인: 점포1의 performance_kpi_daily 가 비어 있고(집계 미적재),
 *         점포2·3은 과거일자 demand_forecast 부재로 forecast_mape 가 NULL.
 *   조치(비파괴): 과거 14일 수요예측 생성(UPSERT) + 최근 30일 KPI 재집계(UPSERT).
 *         거래 이력은 건드리지 않음.
 *
 *   실행: ts-node --transpile-only src/db/repair-kpi-mape.ts
 */
import { getPool } from './pool';
import { forecastStoreFor } from '../services/forecast';
import { backfillRange } from '../services/kpi';
import { logger } from '../lib/logger';

const STORES = [1, 2, 3];
const KPI_DAYS = 30;
const FORECAST_BACKFILL_DAYS = 14;

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

async function main(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const storeId of STORES) {
    // 1) 과거 일자 수요예측 백필 — MAPE 산출용 (UPSERT, 중복 없음)
    for (let d = FORECAST_BACKFILL_DAYS; d >= 1; d--) {
      await forecastStoreFor(storeId, addDays(today, -d));
    }
    // 2) 최근 30일 KPI 일별 재집계 — performance_kpi_daily UPSERT (+ forecast_mape)
    const rows = await backfillRange(storeId, addDays(today, -(KPI_DAYS - 1)), today);
    const withMape = rows.filter((r) => r.forecastMape !== null).length;
    const lastTx = rows.length ? rows[rows.length - 1].transactionsCount : 0;
    logger.info(
      { storeId, days: rows.length, mapeDays: withMape, todayTransactions: lastTx },
      'kpi/mape repaired',
    );
  }

  await getPool().end();
  logger.info('repair complete');
}

main().catch((err) => {
  logger.error({ err: err.message }, 'repair failed');
  process.exit(1);
});
