-- 07_today_ops — '오늘의 점포 운영' KPI(오늘 매출·마감 예상 매출·폐기 위험액)용 당일 데이터.
--   02_transactions 는 시드 실행일에 고정되어, 날짜가 지나면 '오늘' 거래가 비어
--   오늘 매출·마감 예상 매출이 0 이 되고, 신선식품은 거래이력이 없어 폐기 단가도 0 이 된다.
--   본 시드는 CURRENT_DATE 기준으로 매 실행마다 9,000,000+ 전용 id 구간을 비우고 다시 채워(멱등)
--   오늘 매출·시간대 페이스 기반 마감 추정·폐기 단가 산정이 모두 가능하도록 한다.

-- 1) 이전 당일-운영 데모 거래 제거 (멱등)
DELETE ti FROM transaction_item ti JOIN `transaction` t ON t.id = ti.transaction_id WHERE t.id >= 9000000;
DELETE FROM `transaction` WHERE id >= 9000000;

-- 2) 오늘 거래 적재: 점포 1~3 × 전 품목(신선식품 포함) × 영업시간(08~11시) 분산.
--    id = 9,000,000 + store*1000 + product_id  → 품목/점포를 id 로 역산 가능(아래 items 에서 사용).
--    total_amount = quantity × unit_price (아래 transaction_item 과 동일 공식으로 일치).
INSERT INTO `transaction` (id, store_id, pos_source, occurred_at, total_amount, payment_method)
SELECT
  9000000 + s.store_id * 1000 + p.id AS id,
  s.store_id, 'pos',
  DATE_ADD(CURRENT_DATE, INTERVAL (8 + (p.id % 4)) HOUR) AS occurred_at,
  (2 + (p.id % 5)) * (1000 + (p.id % 25) * 350) AS total_amount,
  CASE (p.id % 3) WHEN 0 THEN 'card' WHEN 1 THEN 'mobile' ELSE 'cash' END AS payment_method
FROM (SELECT 1 AS store_id UNION SELECT 2 UNION SELECT 3) AS s
CROSS JOIN product_master AS p;

-- 3) 거래 품목 — 신선식품(도시락·삼각김밥류)도 단가가 생겨 폐기 위험액이 산정된다.
INSERT INTO transaction_item (transaction_id, product_master_id, quantity, unit_price)
SELECT
  t.id,
  (t.id % 1000) AS product_master_id,
  (2 + ((t.id % 1000) % 5)) AS quantity,
  (1000 + ((t.id % 1000) % 25) * 350) AS unit_price
FROM `transaction` t
WHERE t.id >= 9000000;

-- 4) 재고 이력(sale 차감) 약식 기록 — 매출 패턴 화면 일관성용(멱등 가드)
INSERT INTO inventory_history (store_id, product_master_id, delta, reason, occurred_at)
SELECT t.store_id, ti.product_master_id, -ti.quantity, 'sale', t.occurred_at
FROM `transaction` t
JOIN transaction_item ti ON ti.transaction_id = t.id
WHERE t.id >= 9000000
  AND NOT EXISTS (
    SELECT 1 FROM inventory_history h
    WHERE h.store_id = t.store_id
      AND h.product_master_id = ti.product_master_id
      AND h.occurred_at = t.occurred_at
      AND h.reason = 'sale'
  );
