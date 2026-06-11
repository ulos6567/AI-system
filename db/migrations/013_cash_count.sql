-- 013 — 시재 점검 (cash reconciliation)
-- 교대(오픈/중간/마감) 시점에 금전등록기 현금 시재를 실측하여
-- 시스템 예상 시재(직전 점검액 + 이후 현금 매출)와 비교, 과부족을 기록한다.

CREATE TABLE IF NOT EXISTS cash_count (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id         BIGINT UNSIGNED NOT NULL,
  user_id          BIGINT UNSIGNED NULL,
  counted_at       DATETIME      NOT NULL,
  shift            ENUM('open','mid','close') NOT NULL DEFAULT 'close',
  opening_float    DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- 시재 기준액(직전 점검 실측액)
  cash_sales       DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- 직전 점검 이후 현금 매출
  expected_amount  DECIMAL(12,2) NOT NULL,               -- 예상 시재 = opening_float + cash_sales
  counted_amount   DECIMAL(12,2) NOT NULL,               -- 실측 시재
  difference       DECIMAL(12,2) NOT NULL,               -- counted - expected (음수=부족)
  denominations_json JSON NULL,                          -- 권종별 매수 {"50000":n,...}
  memo             VARCHAR(255) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cc_store_time (store_id, counted_at DESC),
  CONSTRAINT fk_cc_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_user  FOREIGN KEY (user_id)  REFERENCES `user`(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
