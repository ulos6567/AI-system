-- 002 (T004) — AI 인텔리전스·처방형 운영 인사이트 신규 테이블 (data-model.md)
-- 001 테이블(store, product_master, user) 을 FK 로 참조한다.

-- 1. 처방형 인텔리전스 ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS operational_signal (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id     BIGINT UNSIGNED NOT NULL,
  signal_type  ENUM('sales_drop','waste_risk','demand_surge','overstock','weather_impact') NOT NULL,
  severity     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  product_id   BIGINT UNSIGNED NULL,
  detected_at  DATETIME NOT NULL,
  payload_json JSON NULL,
  status       ENUM('open','actioned','dismissed','expired') NOT NULL DEFAULT 'open',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_os_store_status_time (store_id, status, detected_at DESC),
  CONSTRAINT fk_os_store   FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_os_product FOREIGN KEY (product_id) REFERENCES product_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prescriptive_action (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  signal_id           BIGINT UNSIGNED NOT NULL,
  store_id            BIGINT UNSIGNED NOT NULL,
  action_type         ENUM('price_markdown','promotion','reorder','reallocate','staffing') NOT NULL,
  target_product_id   BIGINT UNSIGNED NULL,
  recommendation_json JSON NULL,
  expected_effect_json JSON NULL,
  rationale           TEXT NULL,
  confidence          DECIMAL(4,3) NOT NULL DEFAULT 0.5,
  priority            INT NOT NULL DEFAULT 0,
  status              ENUM('proposed','approved','executed','rejected','expired') NOT NULL DEFAULT 'proposed',
  approved_by         BIGINT UNSIGNED NULL,
  approved_at         DATETIME NULL,
  executed_ref_json   JSON NULL,
  reject_reason       VARCHAR(255) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pa_store_status_pri (store_id, status, priority DESC),
  KEY idx_pa_signal (signal_id),
  CONSTRAINT fk_pa_signal   FOREIGN KEY (signal_id) REFERENCES operational_signal(id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_store    FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_product  FOREIGN KEY (target_product_id) REFERENCES product_master(id),
  CONSTRAINT fk_pa_approver FOREIGN KEY (approved_by) REFERENCES user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS action_outcome (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  action_id    BIGINT UNSIGNED NOT NULL,
  baseline_json JSON NULL,
  actual_json  JSON NULL,
  accuracy     DECIMAL(4,3) NULL,
  hit          BOOLEAN NULL,
  verified_at  DATETIME NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ao_action (action_id),
  CONSTRAINT fk_ao_action FOREIGN KEY (action_id) REFERENCES prescriptive_action(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Vision 행동/히트맵 집계 (비식별) ----------------------------------------

CREATE TABLE IF NOT EXISTS behavior_insight (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id      BIGINT UNSIGNED NOT NULL,
  insight_date  DATE NOT NULL,
  zone_code     VARCHAR(32) NOT NULL,
  dwell_weight  DECIMAL(8,2) NOT NULL DEFAULT 0,
  pass_count    INT UNSIGNED NOT NULL DEFAULT 0,
  pickup_count  INT UNSIGNED NOT NULL DEFAULT 0,
  putback_count INT UNSIGNED NOT NULL DEFAULT 0,
  demo_segment_json JSON NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bi_store_date_zone (store_id, insight_date, zone_code),
  CONSTRAINT fk_bi_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 이상 징후 감지 (시뮬레이션) ---------------------------------------------

CREATE TABLE IF NOT EXISTS anomaly_event (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id      BIGINT UNSIGNED NOT NULL,
  anomaly_type  ENUM('unpaid_exit','disturbance','collapse','intrusion') NOT NULL,
  severity      TINYINT UNSIGNED NOT NULL DEFAULT 1,
  zone_code     VARCHAR(32) NULL,
  detected_at   DATETIME NOT NULL,
  snapshot_ref  VARCHAR(255) NULL,
  notified_at   DATETIME NULL,
  escalated     BOOLEAN NOT NULL DEFAULT FALSE,
  false_positive BOOLEAN NULL,
  resolution    VARCHAR(255) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ae_store_time (store_id, detected_at DESC),
  KEY idx_ae_fp (false_positive),
  CONSTRAINT fk_ae_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. IoT 예지보전 (시뮬레이션) ------------------------------------------------

CREATE TABLE IF NOT EXISTS device (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id    BIGINT UNSIGNED NOT NULL,
  device_type ENUM('fridge','showcase','freezer','hvac') NOT NULL,
  label       VARCHAR(64) NOT NULL,
  spec_json   JSON NULL,
  status      ENUM('normal','warning','critical','offline') NOT NULL DEFAULT 'normal',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dev_store (store_id),
  CONSTRAINT fk_dev_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_reading (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id   BIGINT UNSIGNED NOT NULL,
  reading_at  DATETIME NOT NULL,
  temperature DECIMAL(5,2) NULL,
  power_watt  DECIMAL(8,2) NULL,
  PRIMARY KEY (id),
  KEY idx_dr_device_time (device_id, reading_at DESC),
  CONSTRAINT fk_dr_device FOREIGN KEY (device_id) REFERENCES device(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS maintenance_alert (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id            BIGINT UNSIGNED NOT NULL,
  risk_level           ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  predicted_failure_at DATETIME NULL,
  recommended_action   VARCHAR(255) NULL,
  raised_at            DATETIME NOT NULL,
  acknowledged_at      DATETIME NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ma_device (device_id, raised_at DESC),
  CONSTRAINT fk_ma_device FOREIGN KEY (device_id) REFERENCES device(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. AI 경영 비서 (외부 LLM) --------------------------------------------------

CREATE TABLE IF NOT EXISTS assistant_conversation (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id   BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ac_store_user (store_id, user_id),
  CONSTRAINT fk_ac_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_ac_user  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assistant_message (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id  BIGINT UNSIGNED NOT NULL,
  role             ENUM('user','assistant') NOT NULL,
  content          TEXT NOT NULL,
  sources_json     JSON NULL,
  linked_action_id BIGINT UNSIGNED NULL,
  had_grounding    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_am_conv_time (conversation_id, created_at),
  CONSTRAINT fk_am_conv   FOREIGN KEY (conversation_id) REFERENCES assistant_conversation(id) ON DELETE CASCADE,
  CONSTRAINT fk_am_action FOREIGN KEY (linked_action_id) REFERENCES prescriptive_action(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. 인력 스케줄러 ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employee (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id         BIGINT UNSIGNED NOT NULL,
  name             VARCHAR(64) NOT NULL,
  hourly_wage      INT UNSIGNED NOT NULL DEFAULT 0,
  availability_json JSON NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_emp_store (store_id),
  CONSTRAINT fk_emp_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS work_schedule (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id             BIGINT UNSIGNED NOT NULL,
  week_start           DATE NOT NULL,
  status               ENUM('draft','confirmed') NOT NULL DEFAULT 'draft',
  estimated_labor_cost INT UNSIGNED NOT NULL DEFAULT 0,
  constraint_violations_json JSON NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ws_store_week (store_id, week_start),
  CONSTRAINT fk_ws_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS work_shift (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  shift_date  DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_wsh_sched_date (schedule_id, shift_date),
  CONSTRAINT fk_wsh_sched FOREIGN KEY (schedule_id) REFERENCES work_schedule(id) ON DELETE CASCADE,
  CONSTRAINT fk_wsh_emp   FOREIGN KEY (employee_id) REFERENCES employee(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. 상품 미디어 -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_media (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  BIGINT UNSIGNED NOT NULL,
  image_url   VARCHAR(512) NOT NULL,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pm_product (product_id, sort_order),
  CONSTRAINT fk_pmedia_product FOREIGN KEY (product_id) REFERENCES product_master(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
