-- T009 — store, user, store_user (data-model.md §1)

CREATE TABLE IF NOT EXISTS store (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(32)  NOT NULL,
  name            VARCHAR(128) NOT NULL,
  address         VARCHAR(255) NULL,
  lat             DECIMAL(10,7) NULL,
  lng             DECIMAL(10,7) NULL,
  timezone        VARCHAR(32)  NOT NULL DEFAULT 'Asia/Seoul',
  open_hours_json JSON         NULL,
  status          ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_store_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user` (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  display_name    VARCHAR(128) NOT NULL,
  global_role     ENUM('SUPER_ADMIN','HQ_OPERATOR','STORE_USER') NOT NULL DEFAULT 'STORE_USER',
  last_login_at   DATETIME     NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS store_user (
  store_id   BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  store_role ENUM('STORE_OWNER','STORE_STAFF') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, user_id),
  KEY idx_store_user_user (user_id),
  CONSTRAINT fk_store_user_store FOREIGN KEY (store_id) REFERENCES store(id) ON DELETE CASCADE,
  CONSTRAINT fk_store_user_user  FOREIGN KEY (user_id)  REFERENCES `user`(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
