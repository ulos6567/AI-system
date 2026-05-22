-- T010 — product_master, product_local_mapping (data-model.md §2)

CREATE TABLE IF NOT EXISTS product_master (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  master_code     VARCHAR(64)  NOT NULL,
  name            VARCHAR(255) NOT NULL,
  category        VARCHAR(64)  NULL,
  barcode         VARCHAR(32)  NULL,
  shelf_life_days INT          NULL,
  temp_zone       ENUM('ambient','chilled','frozen') NOT NULL DEFAULT 'ambient',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_master_code (master_code),
  KEY idx_product_master_barcode (barcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_local_mapping (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id           BIGINT UNSIGNED NOT NULL,
  local_code         VARCHAR(64)  NOT NULL,
  local_name         VARCHAR(255) NOT NULL,
  product_master_id  BIGINT UNSIGNED NULL,
  confidence         DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  status             ENUM('auto','confirmed','rejected','pending') NOT NULL DEFAULT 'pending',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plm_store_local (store_id, local_code),
  KEY idx_plm_master (product_master_id),
  CONSTRAINT fk_plm_store  FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_plm_master FOREIGN KEY (product_master_id) REFERENCES product_master(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
