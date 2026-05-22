-- T017 — 거래 시계열 시드 (최근 7일, 점포×상품×일자 약식)
-- 본 시드는 발주 예측·KPI 집계 흐름 시연용으로 충분한 양만 적재한다.
-- (12주 전체는 backend/src/db/seed-transactions.ts 등 후속 잡에서 확장 가능)

INSERT IGNORE INTO `transaction` (id, store_id, pos_source, occurred_at, total_amount, payment_method)
SELECT
  ROW_NUMBER() OVER (ORDER BY s.store_id, n.n, p.id) AS id,
  s.store_id, 'pos',
  DATE_ADD(DATE_SUB(CURRENT_DATE, INTERVAL n.n DAY), INTERVAL (8 + (p.id % 12)) HOUR),
  ROUND(1500 + (p.id * 137) % 6000, 2),
  CASE (p.id % 3) WHEN 0 THEN 'card' WHEN 1 THEN 'mobile' ELSE 'cash' END
FROM
  (SELECT 1 AS store_id UNION SELECT 2 UNION SELECT 3) AS s
  CROSS JOIN (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) AS n
  CROSS JOIN product_master AS p
WHERE p.id <= 10;

INSERT IGNORE INTO transaction_item (transaction_id, product_master_id, quantity, unit_price)
SELECT
  t.id,
  ((t.id - 1) % 10) + 1 AS product_master_id,
  1 + ((t.id) % 3) AS quantity,
  ROUND(1000 + (((t.id - 1) % 10) + 1) * 350, 2) AS unit_price
FROM `transaction` t
WHERE NOT EXISTS (SELECT 1 FROM transaction_item ti WHERE ti.transaction_id = t.id);

-- 재고 이력 — 위 거래의 sale 차감을 약식 기록
INSERT IGNORE INTO inventory_history (store_id, product_master_id, delta, reason, occurred_at)
SELECT t.store_id, ti.product_master_id, -ti.quantity, 'sale', t.occurred_at
FROM `transaction` t
JOIN transaction_item ti ON ti.transaction_id = t.id
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_history h
  WHERE h.store_id = t.store_id
    AND h.product_master_id = ti.product_master_id
    AND h.occurred_at = t.occurred_at
    AND h.reason = 'sale'
);
