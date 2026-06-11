-- 012 — 대학 캠퍼스 캘린더 (축제·시험기간·방학) 및 점포-대학 연계
-- 점포 인근 대학의 학사일정(축제/시험기간/방학)과 기숙사 통금 시간을 관리하여,
-- 학생 유동인구 변화에 맞춘 이벤트(프로모션) 추진·재고 수량 조정을 지원한다.
-- 001(store) 테이블을 FK 로 참조한다.

CREATE TABLE IF NOT EXISTS university (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(128) NOT NULL,
  short_name    VARCHAR(32)  NULL,
  region        VARCHAR(64)  NULL,
  lat           DECIMAL(10,7) NULL,
  lng           DECIMAL(10,7) NULL,
  student_count INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_university_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS store_university (
  store_id      BIGINT UNSIGNED NOT NULL,
  university_id BIGINT UNSIGNED NOT NULL,
  distance_km   DECIMAL(5,2) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, university_id),
  KEY idx_su_university (university_id),
  CONSTRAINT fk_su_store      FOREIGN KEY (store_id)      REFERENCES store(id)      ON DELETE CASCADE,
  CONSTRAINT fk_su_university FOREIGN KEY (university_id) REFERENCES university(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS academic_event (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  university_id BIGINT UNSIGNED NOT NULL,
  event_type    ENUM('festival','exam','vacation','entrance','orientation') NOT NULL,
  title         VARCHAR(128) NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  curfew_time   TIME NULL,            -- 기숙사 통금 시간 (NULL = 통금 없음/자율)
  peak_hours    VARCHAR(32) NULL,     -- 학생 유동 피크 시간대 (예: '18:00-23:00')
  traffic_level ENUM('low','normal','high','peak') NOT NULL DEFAULT 'normal',
  note          VARCHAR(255) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ae_university_dates (university_id, start_date, end_date),
  KEY idx_ae_type_dates (event_type, start_date, end_date),
  CONSTRAINT fk_ae_university FOREIGN KEY (university_id) REFERENCES university(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
