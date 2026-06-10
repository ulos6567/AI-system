-- 015 (003) — 셀프 결제 대기시간 계측 (checkout wait-time metric)
-- 고객 셀프 결제(키오스크)의 시작~완료 대기시간을 건별로 기록한다.
-- SC-004: 피크타임 대기시간 건당 10초(10000ms) 이내.
-- FR-006. 신규 테이블(003에서 유일하게 신설). 기존 transaction 과 느슨하게 연결.

CREATE TABLE IF NOT EXISTS checkout_metric (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id         BIGINT UNSIGNED NOT NULL,
  external_id      VARCHAR(128)  NULL,                          -- 연결된 거래 external_id(완료 시). 미완료 NULL
  channel          ENUM('self','staff') NOT NULL DEFAULT 'self',-- 셀프/직원
  started_at       DATETIME      NOT NULL,                      -- 결제 시작
  completed_at     DATETIME      NULL,                          -- 완료(미완료/이탈 시 NULL)
  wait_ms          INT UNSIGNED  NULL,                          -- 대기시간(ms) = completed - started
  outcome          ENUM('completed','abandoned') NOT NULL DEFAULT 'completed',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cm_store_time (store_id, started_at DESC),
  KEY idx_cm_store_outcome (store_id, outcome),
  CONSTRAINT fk_cm_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
