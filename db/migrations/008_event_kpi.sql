-- T016 — event_log, notification, performance_kpi_daily (data-model.md §9, §10)
-- event_log 인덱스/파티셔닝 준비 (T068에서 1년 파티션 마이그레이션 추가 예정)

CREATE TABLE IF NOT EXISTS event_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id      BIGINT UNSIGNED NULL,
  user_id       BIGINT UNSIGNED NULL,
  severity      ENUM('info','warn','error','critical') NOT NULL DEFAULT 'info',
  event_type    VARCHAR(64) NOT NULL,
  message       VARCHAR(512) NULL,
  metadata_json JSON NULL,
  occurred_at   DATETIME NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_el_store_severity_time (store_id, severity, occurred_at DESC),
  KEY idx_el_type_time (event_type, occurred_at DESC),
  KEY idx_el_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id                 BIGINT UNSIGNED NOT NULL,
  user_id                  BIGINT UNSIGNED NOT NULL,
  event_log_id             BIGINT UNSIGNED NULL,
  title                    VARCHAR(255) NOT NULL,
  body                     TEXT NULL,
  read_at                  DATETIME NULL,
  delivered_channels_json  JSON NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user_unread (user_id, read_at),
  KEY idx_notif_store_time (store_id, created_at DESC),
  CONSTRAINT fk_notif_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_user  FOREIGN KEY (user_id)  REFERENCES `user`(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_event FOREIGN KEY (event_log_id) REFERENCES event_log(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS performance_kpi_daily (
  store_id            BIGINT UNSIGNED NOT NULL,
  metric_date         DATE NOT NULL,
  revenue             DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  transactions_count  INT NOT NULL DEFAULT 0,
  avg_ticket          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discard_amount      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  discard_rate        DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  labor_cost          DECIMAL(14,2) NULL,
  forecast_mape       DECIMAL(5,4) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, metric_date),
  KEY idx_pkpi_date (metric_date),
  CONSTRAINT fk_pkpi_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
