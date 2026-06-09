-- T017 — 데모 데이터 (quickstart.md §5 시나리오 동작용)
-- 점포 3곳, 마스터 상품 50종(축약 25종 + 카테고리 확장), 1주일치 거래, 외부 신호 샘플
-- 사용자/권한은 backend/src/db/seed.ts에서 bcrypt 해시 후 별도 적재

INSERT IGNORE INTO store (id, code, name, address, lat, lng, open_hours_json, status) VALUES
  (1, 'ST001', '강남역 직영점',   '서울 강남구 강남대로 396', 37.4980, 127.0276,
   JSON_OBJECT('mon','08-23','tue','08-23','wed','08-23','thu','08-23','fri','08-23','sat','09-22','sun','09-22'), 'active'),
  (2, 'ST002', '판교 테크노밸리점', '경기 성남시 분당구 판교역로 235', 37.3947, 127.1109,
   JSON_OBJECT('mon','07-22','tue','07-22','wed','07-22','thu','07-22','fri','07-22','sat','10-20','sun','10-20'), 'active'),
  (3, 'ST003', '홍대입구역점',     '서울 마포구 양화로 188', 37.5571, 126.9244,
   JSON_OBJECT('mon','10-24','tue','10-24','wed','10-24','thu','10-24','fri','10-25','sat','10-25','sun','10-22'), 'active');

-- 상품 마스터 25종 (축약: 음료/스낵/도시락/즉석식품)
INSERT IGNORE INTO product_master (id, master_code, name, category, barcode, shelf_life_days, temp_zone) VALUES
  ( 1, 'PM001', '삼다수 500ml',    'beverage', '8801056901011',  365, 'ambient'),
  ( 2, 'PM002', '코카콜라 500ml',  'beverage', '8801056901028',  180, 'ambient'),
  ( 3, 'PM003', '제로콜라 500ml',  'beverage', '8801056901035',  180, 'ambient'),
  ( 4, 'PM004', '아메리카노 컵',   'beverage', '8801056901042',   30, 'chilled'),
  ( 5, 'PM005', '카페라떼 컵',     'beverage', '8801056901059',   30, 'chilled'),
  ( 6, 'PM006', '바나나우유 240ml','beverage', '8801056901066',   14, 'chilled'),
  ( 7, 'PM007', '딸기우유 240ml',  'beverage', '8801056901073',   14, 'chilled'),
  ( 8, 'PM008', '새우깡',          'snack',    '8801056901080',   90, 'ambient'),
  ( 9, 'PM009', '포카칩 오리지널', 'snack',    '8801056901097',  120, 'ambient'),
  (10, 'PM010', '초코파이',        'snack',    '8801056901103',  180, 'ambient'),
  (11, 'PM011', '불고기 도시락',   'lunchbox', '8801056901110',    2, 'chilled'),
  (12, 'PM012', '제육 도시락',     'lunchbox', '8801056901127',    2, 'chilled'),
  (13, 'PM013', '치킨마요 덮밥',   'lunchbox', '8801056901134',    2, 'chilled'),
  (14, 'PM014', '삼각김밥 참치',   'ricesnack','8801056901141',    1, 'chilled'),
  (15, 'PM015', '삼각김밥 전주비빔','ricesnack','8801056901158',   1, 'chilled'),
  (16, 'PM016', '컵라면 신라면',   'instant',  '8801056901165',  365, 'ambient'),
  (17, 'PM017', '컵라면 진라면',   'instant',  '8801056901172',  365, 'ambient'),
  (18, 'PM018', '핫바 매콤',       'frozen',   '8801056901189',   60, 'frozen'),
  (19, 'PM019', '아이스크림 메로나','frozen',  '8801056901196',  365, 'frozen'),
  (20, 'PM020', '아이스크림 비비빅','frozen',  '8801056901202',  365, 'frozen'),
  (21, 'PM021', '에너지바 단백질', 'snack',    '8801056901219',  240, 'ambient'),
  (22, 'PM022', '비타민워터 500ml','beverage', '8801056901226',  365, 'ambient'),
  (23, 'PM023', '녹차 티백 20입', 'beverage', '8801056901233',  730, 'ambient'),
  (24, 'PM024', '샌드위치 햄치즈', 'lunchbox', '8801056901240',    2, 'chilled'),
  (25, 'PM025', '닭가슴살 100g',  'snack',    '8801056901257',   90, 'chilled');

-- 점포별 로컬 매핑 (1:1 자동매핑, confidence 0.95+)
-- 점포 1에 25종, 점포 2에 25종, 점포 3에 25종 - 동일 마스터를 다른 local_code로
INSERT IGNORE INTO product_local_mapping (store_id, local_code, local_name, product_master_id, confidence, status)
SELECT 1, CONCAT('S1-', LPAD(id, 3, '0')), name, id, 0.98, 'confirmed' FROM product_master;
INSERT IGNORE INTO product_local_mapping (store_id, local_code, local_name, product_master_id, confidence, status)
SELECT 2, CONCAT('S2-', LPAD(id, 3, '0')), name, id, 0.96, 'confirmed' FROM product_master;
INSERT IGNORE INTO product_local_mapping (store_id, local_code, local_name, product_master_id, confidence, status)
SELECT 3, CONCAT('S3-', LPAD(id, 3, '0')), name, id, 0.97, 'confirmed' FROM product_master;

-- 초기 재고 — 점포별, 도시락/김밥은 임박 expires_at 설정해 US3 시연 가능
INSERT IGNORE INTO inventory (store_id, product_master_id, quantity, shelf_location, expires_at)
SELECT 1, id, 50, CONCAT('A-', LPAD(id, 2, '0')),
       CASE WHEN shelf_life_days <= 2 THEN DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
            WHEN shelf_life_days <= 14 THEN DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)
            ELSE NULL END
FROM product_master;
INSERT IGNORE INTO inventory (store_id, product_master_id, quantity, shelf_location, expires_at)
SELECT 2, id, 40, CONCAT('B-', LPAD(id, 2, '0')),
       CASE WHEN shelf_life_days <= 2 THEN DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
            WHEN shelf_life_days <= 14 THEN DATE_ADD(CURRENT_DATE, INTERVAL 5 DAY)
            ELSE NULL END
FROM product_master;
INSERT IGNORE INTO inventory (store_id, product_master_id, quantity, shelf_location, expires_at)
SELECT 3, id, 60, CONCAT('C-', LPAD(id, 2, '0')),
       CASE WHEN shelf_life_days <= 2 THEN DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
            WHEN shelf_life_days <= 14 THEN DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)
            ELSE NULL END
FROM product_master;

-- 외부 신호 샘플 (기상청/이벤트)
INSERT IGNORE INTO external_signal (store_id, region_code, signal_type, occurred_at, payload_json, source) VALUES
  (NULL, '11000', 'weather',  DATE_SUB(NOW(), INTERVAL 1 DAY),
   JSON_OBJECT('temp_c', 24.5, 'humidity', 65, 'rain_mm', 0, 'condition','clear'), 'KMA'),
  (NULL, '11000', 'weather',  NOW(),
   JSON_OBJECT('temp_c', 27.1, 'humidity', 70, 'rain_mm', 2.3, 'condition','rain'), 'KMA'),
  (NULL, '11000', 'event',    DATE_ADD(NOW(), INTERVAL 2 DAY),
   JSON_OBJECT('event_name','콘서트','expected_audience',8000,'venue_lat',37.498,'venue_lng',127.027), 'manual'),
  (NULL, '13100', 'weather',  NOW(),
   JSON_OBJECT('temp_c', 26.0, 'humidity', 60, 'rain_mm', 0, 'condition','partly_cloudy'), 'KMA');
