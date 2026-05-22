-- T014 — pricing_rule, pricing_event, external_signal (data-model.md §5, §6)

CREATE TABLE IF NOT EXISTS pricing_rule (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id            BIGINT UNSIGNED NULL,
  name                VARCHAR(128) NOT NULL,
  trigger_type        ENUM('shelf_life','weather','demand_drop','manual','schedule') NOT NULL,
  trigger_config_json JSON NULL,
  action_type         ENUM('percent_off','fixed_price','bundle') NOT NULL,
  action_config_json  JSON NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pr_store_active (store_id, is_active),
  CONSTRAINT fk_pr_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pricing_event (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id          BIGINT UNSIGNED NOT NULL,
  product_master_id BIGINT UNSIGNED NOT NULL,
  pricing_rule_id   BIGINT UNSIGNED NOT NULL,
  original_price    DECIMAL(10,2) NOT NULL,
  adjusted_price    DECIMAL(10,2) NOT NULL,
  effective_from    DATETIME NOT NULL,
  effective_to      DATETIME NOT NULL,
  esl_push_status   ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  audit_meta_json   JSON NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pe_store_time (store_id, effective_from DESC),
  KEY idx_pe_rule (pricing_rule_id),
  KEY idx_pe_product (product_master_id),
  CONSTRAINT fk_pe_store   FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_pe_product FOREIGN KEY (product_master_id) REFERENCES product_master(id),
  CONSTRAINT fk_pe_rule    FOREIGN KEY (pricing_rule_id) REFERENCES pricing_rule(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS external_signal (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id     BIGINT UNSIGNED NULL,
  region_code  VARCHAR(32)  NULL,
  signal_type  ENUM('weather','foot_traffic','event','holiday','competitor') NOT NULL,
  occurred_at  DATETIME NOT NULL,
  payload_json JSON NULL,
  source       VARCHAR(64) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_es_store_type_time (store_id, signal_type, occurred_at DESC),
  KEY idx_es_region_time (region_code, occurred_at DESC),
  CONSTRAINT fk_es_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
