-- T011 — inventory, inventory_history (data-model.md §2)

CREATE TABLE IF NOT EXISTS inventory (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id          BIGINT UNSIGNED NOT NULL,
  product_master_id BIGINT UNSIGNED NOT NULL,
  quantity          INT          NOT NULL DEFAULT 0,
  shelf_location    VARCHAR(32)  NULL,
  expires_at        DATE         NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inv_store_product_expires (store_id, product_master_id, expires_at),
  KEY idx_inv_store_expires (store_id, expires_at),
  CONSTRAINT fk_inv_store   FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_product FOREIGN KEY (product_master_id) REFERENCES product_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_history (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id          BIGINT UNSIGNED NOT NULL,
  product_master_id BIGINT UNSIGNED NOT NULL,
  delta             INT NOT NULL,
  reason            ENUM('sale','order_receive','discard','adjust','transfer') NOT NULL,
  occurred_at       DATETIME NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_invh_store_time (store_id, occurred_at DESC),
  KEY idx_invh_product (product_master_id),
  CONSTRAINT fk_invh_store   FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_invh_product FOREIGN KEY (product_master_id) REFERENCES product_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
