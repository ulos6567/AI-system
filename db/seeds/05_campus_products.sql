-- 05_campus_products — 캠퍼스(축제·시험) 수요 대응 다양화 품목
--   권장 재고 추천이 음료·스낵에 편중되지 않도록 카테고리별 품목을 확충한다.
--   특히 얇았던 instant(컵라면)·ricesnack(주먹밥/김밥)·frozen(아이스크림) 보강.
--   id 26~43 고정 — INSERT IGNORE 로 멱등.

INSERT IGNORE INTO product_master (id, master_code, name, category, barcode, shelf_life_days, temp_zone) VALUES
  (26, 'PM026', '핫식스 250ml',       'beverage', '8801056901264',  365, 'ambient'),
  (27, 'PM027', '레드불 250ml',       'beverage', '8801056901271',  365, 'ambient'),
  (28, 'PM028', '몬스터 에너지 355ml','beverage', '8801056901288',  365, 'ambient'),
  (29, 'PM029', '게토레이 600ml',     'beverage', '8801056901295',  270, 'ambient'),
  (30, 'PM030', '칸타타 캔커피',      'beverage', '8801056901301',  365, 'ambient'),
  (31, 'PM031', '꼬깔콘 고소한맛',    'snack',    '8801056901318',  120, 'ambient'),
  (32, 'PM032', '허니버터칩',         'snack',    '8801056901325',  120, 'ambient'),
  (33, 'PM033', '프링글스 오리지널',  'snack',    '8801056901332',  180, 'ambient'),
  (34, 'PM034', '빼빼로 오리지널',    'snack',    '8801056901349',  240, 'ambient'),
  (35, 'PM035', '컵라면 육개장',      'instant',  '8801056901356',  365, 'ambient'),
  (36, 'PM036', '컵라면 짜파게티',    'instant',  '8801056901363',  365, 'ambient'),
  (37, 'PM037', '왕뚜껑',             'instant',  '8801056901370',  365, 'ambient'),
  (38, 'PM038', '김치볶음밥 도시락',  'lunchbox', '8801056901387',    2, 'chilled'),
  (39, 'PM039', '스팸마요 덮밥',      'lunchbox', '8801056901394',    2, 'chilled'),
  (40, 'PM040', '삼각김밥 스팸마요',  'ricesnack','8801056901400',    1, 'chilled'),
  (41, 'PM041', '주먹밥 멸치',        'ricesnack','8801056901417',    1, 'chilled'),
  (42, 'PM042', '아이스크림 월드콘',  'frozen',   '8801056901424',  365, 'frozen'),
  (43, 'PM043', '핫바 치즈',          'frozen',   '8801056901431',   60, 'frozen');

-- 점포별 로컬 매핑(자동매핑) — 신규 품목도 동일하게 매핑
INSERT IGNORE INTO product_local_mapping (store_id, local_code, local_name, product_master_id, confidence, status)
SELECT 1, CONCAT('S1-', LPAD(id, 3, '0')), name, id, 0.98, 'confirmed' FROM product_master WHERE id BETWEEN 26 AND 43;
INSERT IGNORE INTO product_local_mapping (store_id, local_code, local_name, product_master_id, confidence, status)
SELECT 2, CONCAT('S2-', LPAD(id, 3, '0')), name, id, 0.96, 'confirmed' FROM product_master WHERE id BETWEEN 26 AND 43;
INSERT IGNORE INTO product_local_mapping (store_id, local_code, local_name, product_master_id, confidence, status)
SELECT 3, CONCAT('S3-', LPAD(id, 3, '0')), name, id, 0.97, 'confirmed' FROM product_master WHERE id BETWEEN 26 AND 43;

-- 점포 1~3 신규 품목 초기 재고 — (store, product) 당 1행만(NOT EXISTS 가드)으로 중복 방지
INSERT INTO inventory (store_id, product_master_id, quantity, shelf_location, expires_at)
SELECT s.store_id, pm.id, s.qty, CONCAT(s.loc, '-', LPAD(pm.id, 2, '0')),
       CASE WHEN pm.shelf_life_days <= 2  THEN DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
            WHEN pm.shelf_life_days <= 14 THEN DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)
            ELSE NULL END
  FROM product_master pm
  CROSS JOIN (SELECT 1 AS store_id, 55 AS qty, 'A' AS loc
              UNION ALL SELECT 2, 45, 'B'
              UNION ALL SELECT 3, 60, 'C') s
 WHERE pm.id BETWEEN 26 AND 43
   AND NOT EXISTS (
       SELECT 1 FROM inventory i
        WHERE i.store_id = s.store_id AND i.product_master_id = pm.id);
