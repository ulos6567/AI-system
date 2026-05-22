-- T068 — event_log 1년 보존 + 월별 파티셔닝 (FR-021, SC-013)
--
-- 기존 event_log 를 RANGE(YEAR*100+MONTH) 파티션으로 재구성한다.
-- MariaDB 는 FOREIGN KEY 가 걸린 테이블에 PARTITION BY 를 허용하지 않으므로,
-- 외부에서 event_log 를 참조하는 notification.event_log_id FK 를 먼저 제거하고
-- 파티션 적용 후 인덱스로 대체한다.

ALTER TABLE notification DROP FOREIGN KEY fk_notif_event;

ALTER TABLE event_log
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (id, occurred_at);

ALTER TABLE event_log
  PARTITION BY RANGE (TO_DAYS(occurred_at)) (
    PARTITION p_old   VALUES LESS THAN (TO_DAYS('2026-01-01')),
    PARTITION p202601 VALUES LESS THAN (TO_DAYS('2026-02-01')),
    PARTITION p202602 VALUES LESS THAN (TO_DAYS('2026-03-01')),
    PARTITION p202603 VALUES LESS THAN (TO_DAYS('2026-04-01')),
    PARTITION p202604 VALUES LESS THAN (TO_DAYS('2026-05-01')),
    PARTITION p202605 VALUES LESS THAN (TO_DAYS('2026-06-01')),
    PARTITION p202606 VALUES LESS THAN (TO_DAYS('2026-07-01')),
    PARTITION p202607 VALUES LESS THAN (TO_DAYS('2026-08-01')),
    PARTITION p202608 VALUES LESS THAN (TO_DAYS('2026-09-01')),
    PARTITION p202609 VALUES LESS THAN (TO_DAYS('2026-10-01')),
    PARTITION p202610 VALUES LESS THAN (TO_DAYS('2026-11-01')),
    PARTITION p202611 VALUES LESS THAN (TO_DAYS('2026-12-01')),
    PARTITION p202612 VALUES LESS THAN (TO_DAYS('2027-01-01')),
    PARTITION p_future VALUES LESS THAN MAXVALUE
  );

-- 알림 -> event_log 참조는 인덱스만 유지 (FK 미사용)
CREATE INDEX IF NOT EXISTS idx_notif_event_lookup ON notification (event_log_id);

-- 운영 노트:
--  * 매월 1일 새 파티션 추가는 후속 잡(node-cron) 또는 DBA 절차로 관리.
--  * 1년 경과 데이터는 ALTER TABLE event_log DROP PARTITION p202601 등으로 회수.
