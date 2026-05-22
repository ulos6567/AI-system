-- T012 — transaction, transaction_item (data-model.md §3)
-- 인덱스: (store_id, occurred_at DESC)

CREATE TABLE IF NOT EXISTS `transaction` (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id          BIGINT UNSIGNED NOT NULL,
  pos_source        ENUM('pos','self_kiosk','app') NOT NULL DEFAULT 'pos',
  occurred_at       DATETIME      NOT NULL,
  total_amount      DECIMAL(12,2) NOT NULL,
  payment_method    VARCHAR(32)   NULL,
  pii_app_user_id   BIGINT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tx_store_time (store_id, occurred_at DESC),
  KEY idx_tx_pii_user (pii_app_user_id),
  CONSTRAINT fk_tx_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transaction_item (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id    BIGINT UNSIGNED NOT NULL,
  product_master_id BIGINT UNSIGNED NOT NULL,
  quantity          INT NOT NULL,
  unit_price        DECIMAL(10,2) NOT NULL,
  discount_applied  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  pricing_event_id  BIGINT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_txi_tx (transaction_id),
  KEY idx_txi_product (product_master_id),
  KEY idx_txi_pricing_event (pricing_event_id),
  CONSTRAINT fk_txi_tx      FOREIGN KEY (transaction_id) REFERENCES `transaction`(id) ON DELETE CASCADE,
  CONSTRAINT fk_txi_product FOREIGN KEY (product_master_id) REFERENCES product_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
