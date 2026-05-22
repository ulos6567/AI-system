-- T013 — demand_forecast, purchase_order, purchase_order_item (data-model.md §4)

CREATE TABLE IF NOT EXISTS demand_forecast (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id          BIGINT UNSIGNED NOT NULL,
  product_master_id BIGINT UNSIGNED NOT NULL,
  target_date       DATE         NOT NULL,
  predicted_quantity INT         NOT NULL,
  confidence        DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  model_version     VARCHAR(32)  NOT NULL DEFAULT 'baseline-v1',
  generated_at      DATETIME     NOT NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_df_store_product_date (store_id, product_master_id, target_date),
  KEY idx_df_target (target_date),
  CONSTRAINT fk_df_store   FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_df_product FOREIGN KEY (product_master_id) REFERENCES product_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_order (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id            BIGINT UNSIGNED NOT NULL,
  order_date          DATE NOT NULL,
  status              ENUM('draft','pending_review','approved','sent','received','cancelled','failed') NOT NULL DEFAULT 'draft',
  source              ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  sent_at             DATETIME NULL,
  received_at         DATETIME NULL,
  approved_by_user_id BIGINT UNSIGNED NULL,
  auto_hold_reason    VARCHAR(255) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_po_store_date (store_id, order_date DESC),
  KEY idx_po_status (status),
  CONSTRAINT fk_po_store    FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_po_approver FOREIGN KEY (approved_by_user_id) REFERENCES `user`(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_order_item (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_order_id  BIGINT UNSIGNED NOT NULL,
  product_master_id  BIGINT UNSIGNED NOT NULL,
  ordered_quantity   INT NOT NULL,
  received_quantity  INT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_poi_order (purchase_order_id),
  KEY idx_poi_product (product_master_id),
  CONSTRAINT fk_poi_order   FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id) ON DELETE CASCADE,
  CONSTRAINT fk_poi_product FOREIGN KEY (product_master_id) REFERENCES product_master(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
