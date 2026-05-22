-- T015 — pii_app_user, pii_app_user_consent, analytics_customer_behavior (data-model.md §7, §8)
-- 명명으로 PII/Analytics 분리 — FR-019/020 권한 가드와 함께 작동

CREATE TABLE IF NOT EXISTS pii_app_user (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone_hash    CHAR(64) NOT NULL,
  nickname      VARCHAR(64) NULL,
  device_token  VARCHAR(255) NULL,
  registered_at DATETIME NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pau_phone (phone_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pii_app_user_consent (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pii_app_user_id BIGINT UNSIGNED NOT NULL,
  consent_type    ENUM('marketing_push','behavior_analytics','location') NOT NULL,
  granted         BOOLEAN NOT NULL,
  granted_at      DATETIME NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pauc_user_type (pii_app_user_id, consent_type),
  CONSTRAINT fk_pauc_user FOREIGN KEY (pii_app_user_id) REFERENCES pii_app_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS analytics_customer_behavior (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id          BIGINT UNSIGNED NOT NULL,
  anon_session_id   CHAR(36) NOT NULL,
  event_type        ENUM('dwell','path','pickup','approach_shelf','exit') NOT NULL,
  zone_code         VARCHAR(16) NULL,
  product_master_id BIGINT UNSIGNED NULL,
  dwell_seconds     INT NULL,
  occurred_at       DATETIME NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acb_store_time (store_id, occurred_at DESC),
  KEY idx_acb_session (anon_session_id),
  CONSTRAINT fk_acb_store   FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_acb_product FOREIGN KEY (product_master_id) REFERENCES product_master(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
